import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecoveryWhatsappBusinessKey = "MPV" | "EAP";
export type WhatsappFreeformWindowStatus = "open" | "closing_soon" | "closed" | "missing" | "unverifiable";
export type WhatsappFreeformWindowSource = "live" | "message_memory" | "combined" | null;

export type WhatsappFreeformWindowState = {
  businessKey: RecoveryWhatsappBusinessKey | null;
  canSendFreeform: boolean;
  closesAt: string | null;
  expiresAt: string | null;
  lastInboundAt: string | null;
  metaRejectedAsClosed: boolean;
  remainingSeconds: number | null;
  source: WhatsappFreeformWindowSource;
  status: WhatsappFreeformWindowStatus;
};

const WHATSAPP_FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;
const WHATSAPP_WINDOW_WARNING_SECONDS = 2 * 60 * 60;

const RECOVERY_WHATSAPP_BUSINESS_PHONES: Record<RecoveryWhatsappBusinessKey, string> = {
  EAP: "56984533883",
  MPV: "56926817602",
};

export function recoveryWhatsappBusinessPhoneForKey(key: RecoveryWhatsappBusinessKey) {
  return RECOVERY_WHATSAPP_BUSINESS_PHONES[key];
}

type CartContactRow = {
  parking_code: string | null;
  phone_normalized: string | null;
};

export type WhatsappInboundCandidate = {
  businessKey: RecoveryWhatsappBusinessKey | null;
  messageAt: string | null;
  messageId: string | null;
  source: Exclude<WhatsappFreeformWindowSource, null>;
};

type LiveInboundRow = {
  direction: string | null;
  message_at: string | null;
  whatsapp_message_id?: string | null;
};

export type WhatsappMemoryConversationRow = {
  api_phone_normalized: string | null;
  message_at: string | null;
  message_bound_type: string | null;
};

function emptyState(
  status: "missing" | "unverifiable",
  businessKey: RecoveryWhatsappBusinessKey | null = null,
): WhatsappFreeformWindowState {
  return {
    businessKey,
    canSendFreeform: false,
    closesAt: null,
    expiresAt: null,
    lastInboundAt: null,
    metaRejectedAsClosed: false,
    remainingSeconds: null,
    source: null,
    status,
  };
}

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

export function businessKeyForParking(parkingCode: string | null | undefined): RecoveryWhatsappBusinessKey | null {
  const normalized = String(parkingCode ?? "").trim().toUpperCase();

  if (normalized === "MPV") return "MPV";
  if (normalized === "EAP") return "EAP";

  return null;
}

export function businessKeyForBusinessPhone(value: string | null | undefined): RecoveryWhatsappBusinessKey | null {
  const normalized = String(value ?? "").replace(/\D/g, "");

  for (const [businessKey, businessPhone] of Object.entries(RECOVERY_WHATSAPP_BUSINESS_PHONES)) {
    if (normalized === businessPhone) return businessKey as RecoveryWhatsappBusinessKey;
  }

  return null;
}

export function classifyWhatsappFreeformWindow(
  lastInboundAt: string | null,
  nowMs = Date.now(),
  businessKey: RecoveryWhatsappBusinessKey | null = null,
  source: WhatsappFreeformWindowSource = null,
): WhatsappFreeformWindowState {
  const lastInboundMs = validTimestamp(lastInboundAt);

  if (lastInboundMs === null) {
    return emptyState("missing", businessKey);
  }

  const closesAtMs = lastInboundMs + WHATSAPP_FREEFORM_WINDOW_MS;
  const remainingMs = closesAtMs - nowMs;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const closesAt = new Date(closesAtMs).toISOString();
  const normalizedLastInboundAt = new Date(lastInboundMs).toISOString();

  if (nowMs >= closesAtMs) {
    return {
      businessKey,
      canSendFreeform: false,
      closesAt,
      expiresAt: closesAt,
      lastInboundAt: normalizedLastInboundAt,
      metaRejectedAsClosed: false,
      remainingSeconds: 0,
      source,
      status: "closed",
    };
  }

  return {
    businessKey,
    canSendFreeform: true,
    closesAt,
    expiresAt: closesAt,
    lastInboundAt: normalizedLastInboundAt,
    metaRejectedAsClosed: false,
    remainingSeconds,
    source,
    status: remainingSeconds <= WHATSAPP_WINDOW_WARNING_SECONDS ? "closing_soon" : "open",
  };
}

async function liveInboundCandidates(
  supabase: SupabaseClient,
  cartId: string,
  businessKey: RecoveryWhatsappBusinessKey,
) {
  const { data, error } = await supabase
    .from("recovery_whatsapp_live_messages")
    .select("message_at,direction,whatsapp_message_id")
    .eq("cart_id", cartId)
    .eq("direction", "inbound")
    .order("message_at", { ascending: false })
    .limit(20);

  if (error) return { candidates: [] as WhatsappInboundCandidate[], error: true as const };

  const candidates = ((data ?? []) as LiveInboundRow[])
    .filter((row) => row.direction === "inbound")
    .map((row) => ({
      businessKey,
      messageAt: row.message_at,
      messageId: row.whatsapp_message_id ?? null,
      source: "live" as const,
    }));

  return { candidates, error: false as const };
}

async function memoryConversationRows(
  supabase: SupabaseClient,
  tableName: "recovery_whatsapp_message_memory_raw_import" | "recovery_whatsapp_message_memory_import",
  phoneNormalized: string,
) {
  const { data, error } = await supabase
    .from(tableName)
    .select("message_at,message_bound_type,api_phone_normalized")
    .eq("wa_id_normalized", phoneNormalized)
    .order("message_at", { ascending: false })
    .limit(50);

  if (error) return { error: true as const, rows: [] as WhatsappMemoryConversationRow[] };

  return { error: false as const, rows: (data ?? []) as WhatsappMemoryConversationRow[] };
}

function explicitBusinessKeysForRows(rows: WhatsappMemoryConversationRow[]) {
  return new Set(rows.map((row) => businessKeyForBusinessPhone(row.api_phone_normalized)).filter((key): key is RecoveryWhatsappBusinessKey => key !== null));
}

function explicitOutboundBusinessKeysForRows(rows: WhatsappMemoryConversationRow[]) {
  return explicitBusinessKeysForRows(rows.filter((row) => row.message_bound_type === "outbound"));
}

function resolveConversationBusinessKey(params: {
  explicitRows: WhatsappMemoryConversationRow[];
  parkingBusinessKey: RecoveryWhatsappBusinessKey | null;
}) {
  const outboundKeys = explicitOutboundBusinessKeysForRows(params.explicitRows);

  if (outboundKeys.size === 1) {
    return [...outboundKeys][0];
  }

  if (outboundKeys.size > 1) {
    if (params.parkingBusinessKey && outboundKeys.has(params.parkingBusinessKey)) return params.parkingBusinessKey;

    return null;
  }

  return params.parkingBusinessKey;
}

export function resolveWhatsappConversationBusinessKey(params: {
  memoryRows: WhatsappMemoryConversationRow[];
  parkingBusinessKey: RecoveryWhatsappBusinessKey | null;
}) {
  return resolveConversationBusinessKey({
    explicitRows: params.memoryRows,
    parkingBusinessKey: params.parkingBusinessKey,
  });
}

function memoryInboundCandidates(rows: WhatsappMemoryConversationRow[], businessKey: RecoveryWhatsappBusinessKey) {
  return rows
    .filter((row) => row.message_bound_type === "inbound")
    .map((row) => ({
      businessKey: businessKeyForBusinessPhone(row.api_phone_normalized),
      messageAt: row.message_at,
      messageId: null,
      source: "message_memory" as const,
    }))
    .filter((candidate) => candidate.businessKey === businessKey);
}

function hasAmbiguousInboundWithoutBusiness(rows: WhatsappMemoryConversationRow[]) {
  return rows.some((row) => row.message_bound_type === "inbound" && !businessKeyForBusinessPhone(row.api_phone_normalized));
}

function dedupeCandidates(candidates: WhatsappInboundCandidate[]) {
  const seen = new Set<string>();
  const unique: WhatsappInboundCandidate[] = [];

  for (const candidate of candidates) {
    const timestamp = validTimestamp(candidate.messageAt);
    if (timestamp === null) continue;

    const key = candidate.messageId
      ? `wamid:${candidate.messageId}`
      : `fallback:${candidate.businessKey ?? "unknown"}:${new Date(timestamp).toISOString()}`;

    if (seen.has(key)) continue;

    seen.add(key);
    unique.push({
      ...candidate,
      messageAt: new Date(timestamp).toISOString(),
    });
  }

  return unique;
}

function sourceForCandidates(candidates: WhatsappInboundCandidate[]): WhatsappFreeformWindowSource {
  const sources = new Set(candidates.map((candidate) => candidate.source));

  if (sources.has("live") && sources.has("message_memory")) return "combined";
  if (sources.has("live")) return "live";
  if (sources.has("message_memory")) return "message_memory";

  return null;
}

export function resolveWhatsappFreeformWindowFromLoadedSources(params: {
  liveCandidates: WhatsappInboundCandidate[];
  memoryRows: WhatsappMemoryConversationRow[];
  nowMs?: number;
  parkingBusinessKey: RecoveryWhatsappBusinessKey | null;
}): WhatsappFreeformWindowState {
  const businessKey = resolveConversationBusinessKey({
    explicitRows: params.memoryRows,
    parkingBusinessKey: params.parkingBusinessKey,
  });

  if (!businessKey) {
    return emptyState("unverifiable", params.parkingBusinessKey);
  }

  const allCandidates = [
    ...params.liveCandidates.filter((candidate) => candidate.businessKey === businessKey),
    ...memoryInboundCandidates(params.memoryRows, businessKey),
  ];
  const candidates = dedupeCandidates(allCandidates);
  const latestInbound = candidates
    .map((candidate) => ({
      candidate,
      timestamp: validTimestamp(candidate.messageAt),
    }))
    .filter((item): item is { candidate: WhatsappInboundCandidate; timestamp: number } => item.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  if (!latestInbound) {
    if (params.memoryRows.length > 0 && hasAmbiguousInboundWithoutBusiness(params.memoryRows)) {
      return emptyState("unverifiable", businessKey);
    }

    return emptyState("missing", businessKey);
  }

  return classifyWhatsappFreeformWindow(
    new Date(latestInbound.timestamp).toISOString(),
    params.nowMs ?? Date.now(),
    businessKey,
    sourceForCandidates(candidates.filter((candidate) => candidate.messageAt === latestInbound.candidate.messageAt)),
  );
}

export function publicWhatsappFreeformWindow(state: WhatsappFreeformWindowState) {
  return {
    closesAt: state.closesAt,
    remainingSeconds: state.remainingSeconds,
    status: state.status,
  };
}

export async function getWhatsappFreeformWindowForCart(
  supabase: SupabaseClient,
  cartId: string,
  nowMs = Date.now(),
): Promise<WhatsappFreeformWindowState> {
  const { data: cartData, error: cartError } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("phone_normalized,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (cartError) {
    return emptyState("unverifiable");
  }

  const cart = cartData as CartContactRow | null;
  const parkingBusinessKey = businessKeyForParking(cart?.parking_code ?? null);

  if (!cart?.phone_normalized) {
    return emptyState("missing", parkingBusinessKey);
  }

  const memoryResults = await Promise.all([
    memoryConversationRows(supabase, "recovery_whatsapp_message_memory_raw_import", cart.phone_normalized),
    memoryConversationRows(supabase, "recovery_whatsapp_message_memory_import", cart.phone_normalized),
  ]);

  if (memoryResults.some((result) => result.error)) {
    return emptyState("unverifiable", parkingBusinessKey);
  }

  const memoryRows = memoryResults.flatMap((result) => result.rows);
  const businessKey = resolveConversationBusinessKey({
    explicitRows: memoryRows,
    parkingBusinessKey,
  });

  if (!businessKey) {
    return emptyState("unverifiable", parkingBusinessKey);
  }

  const liveResult = await liveInboundCandidates(supabase, cartId, businessKey);

  if (liveResult.error) {
    return emptyState("unverifiable", businessKey);
  }

  return resolveWhatsappFreeformWindowFromLoadedSources({
    liveCandidates: liveResult.candidates,
    memoryRows,
    nowMs,
    parkingBusinessKey,
  });
}
