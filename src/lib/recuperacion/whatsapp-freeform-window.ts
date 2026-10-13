import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";

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
  booking_id: string | null;
  cms_url?: string | null;
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
  id: string;
  message_at: string | null;
  whatsapp_message_id?: string | null;
};

export type WhatsappMemoryConversationRow = {
  api_phone_normalized: string | null;
  message_at: string | null;
  message_bound_type: string | null;
};

type WhatsappFreeformWindowRpcRow = {
  business_key: RecoveryWhatsappBusinessKey | null;
  error_code: string | null;
  last_inbound_at: string | null;
  source: WhatsappFreeformWindowSource;
};

type WhatsappConversationWindowRpcRow = {
  error_code: string | null;
  last_inbound_at: string | null;
  source: WhatsappFreeformWindowSource;
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

function isMissingConversationWindowRpcError(error: unknown) {
  const candidate = error as { code?: string | null; details?: string | null; message?: string | null } | null;
  const text = [candidate?.code, candidate?.message, candidate?.details]
    .filter(Boolean)
    .join(" ");

  return /\b(PGRST202|42883)\b/i.test(text)
    || /recovery_whatsapp_conversation_window_v2.*(not found|does not exist|could not find|unknown)/i.test(text)
    || /(not found|does not exist|could not find|unknown).*recovery_whatsapp_conversation_window_v2/i.test(text);
}

export function businessKeyForParking(parkingCode: string | null | undefined): RecoveryWhatsappBusinessKey | null {
  return resolveRecoveryCommercialParking({ parkingCode }).parkingCode;
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
  legacyCartId: string | null,
  businessKey: RecoveryWhatsappBusinessKey,
) {
  const queries = [
    supabase
      .from("recovery_whatsapp_live_messages")
      .select("id,message_at,direction,whatsapp_message_id")
      .eq("cart_v2_id", cartId)
      .eq("direction", "inbound")
      .order("message_at", { ascending: false })
      .limit(20),
  ];

  if (legacyCartId) {
    queries.push(
      supabase
        .from("recovery_whatsapp_live_messages")
        .select("id,message_at,direction,whatsapp_message_id")
        .eq("cart_id", legacyCartId)
        .eq("direction", "inbound")
        .order("message_at", { ascending: false })
        .limit(20),
    );
  }

  const results = await Promise.all(queries);

  if (results.some((result) => result.error)) return { candidates: [] as WhatsappInboundCandidate[], error: true as const };

  const seen = new Set<string>();
  const rows = results
    .flatMap((result) => (result.data ?? []) as LiveInboundRow[])
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  const candidates = rows
    .filter((row) => row.direction === "inbound")
    .map((row) => ({
      businessKey,
      messageAt: row.message_at,
      messageId: row.whatsapp_message_id ?? null,
      source: "live" as const,
    }));

  return { candidates, error: false as const };
}

async function resolveLegacyCartIdByBookingId(supabase: SupabaseClient, bookingId: string | null) {
  if (!bookingId) return { legacyCartId: null, ok: true as const };

  const { data, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id")
    .eq("booking_id", bookingId)
    .limit(2);

  if (error || (data ?? []).length > 1) {
    return { legacyCartId: null, ok: false as const };
  }

  return { legacyCartId: data?.[0]?.id ?? null, ok: true as const };
}

async function memoryConversationRows(
  supabase: SupabaseClient,
  tableName:
    | "v_recovery_whatsapp_message_memory_raw_current_compat"
    | "v_recovery_whatsapp_message_memory_current_compat",
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
  options?: {
    bookingId?: string | null;
    parkingBusinessKey?: RecoveryWhatsappBusinessKey | null;
    phoneNormalized?: string | null;
  },
): Promise<WhatsappFreeformWindowState> {
  if (options) {
    if (!options.parkingBusinessKey) {
      return emptyState("unverifiable");
    }

    if (!options.phoneNormalized) {
      return emptyState("missing", options.parkingBusinessKey);
    }

    const legacyIdentity = await resolveLegacyCartIdByBookingId(supabase, options.bookingId ?? null);

    if (!legacyIdentity.ok) {
      return emptyState("unverifiable", options.parkingBusinessKey);
    }

    const businessPhone = recoveryWhatsappBusinessPhoneForKey(options.parkingBusinessKey);
    const { data: conversationWindowData, error: conversationWindowError } = await supabase.rpc(
      "recovery_whatsapp_conversation_window_v2",
      {
        p_api_phone_normalized: businessPhone,
        p_cart_id: cartId,
        p_legacy_cart_id: legacyIdentity.legacyCartId,
        p_wa_id_normalized: options.phoneNormalized,
      },
    );

    if (!conversationWindowError) {
      const row = (Array.isArray(conversationWindowData) ? conversationWindowData[0] : conversationWindowData) as WhatsappConversationWindowRpcRow | null;

      if (!row || row.error_code) {
        return emptyState(row?.error_code ? "unverifiable" : "missing", options.parkingBusinessKey);
      }

      if (!row.last_inbound_at) {
        return emptyState("missing", options.parkingBusinessKey);
      }

      return classifyWhatsappFreeformWindow(
        row.last_inbound_at,
        nowMs,
        options.parkingBusinessKey,
        row.source,
      );
    }

    if (!isMissingConversationWindowRpcError(conversationWindowError)) {
      return emptyState("unverifiable", options.parkingBusinessKey);
    }

    const [currentMemoryRows, rawMemoryRows, liveCandidatesResult] = await Promise.all([
      memoryConversationRows(supabase, "v_recovery_whatsapp_message_memory_current_compat", options.phoneNormalized),
      memoryConversationRows(supabase, "v_recovery_whatsapp_message_memory_raw_current_compat", options.phoneNormalized),
      liveInboundCandidates(supabase, cartId, legacyIdentity.legacyCartId, options.parkingBusinessKey),
    ]);

    if (currentMemoryRows.error || rawMemoryRows.error || liveCandidatesResult.error) {
      return emptyState("unverifiable", options.parkingBusinessKey);
    }

    return resolveWhatsappFreeformWindowFromLoadedSources({
      liveCandidates: liveCandidatesResult.candidates,
      memoryRows: [...currentMemoryRows.rows, ...rawMemoryRows.rows],
      nowMs,
      parkingBusinessKey: options.parkingBusinessKey,
    });
  }

  const { data, error } = await supabase.rpc("recovery_whatsapp_freeform_window_v2", {
    p_cart_id: cartId,
  });

  if (error) {
    return emptyState("unverifiable");
  }

  const row = (Array.isArray(data) ? data[0] : data) as WhatsappFreeformWindowRpcRow | null;
  const businessKey = row?.business_key ?? null;

  if (!row || row.error_code || !businessKey) {
    return emptyState("unverifiable", businessKey);
  }

  if (!row.last_inbound_at) {
    return emptyState("missing", businessKey);
  }

  return classifyWhatsappFreeformWindow(
    row.last_inbound_at,
    nowMs,
    businessKey,
    row.source,
  );
}
