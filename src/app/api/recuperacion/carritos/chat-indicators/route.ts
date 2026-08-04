import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import {
  businessKeyForParking,
  publicWhatsappFreeformWindow,
  resolveWhatsappConversationBusinessKey,
  resolveWhatsappFreeformWindowFromLoadedSources,
  type WhatsappFreeformWindowStatus,
  type WhatsappInboundCandidate,
  type WhatsappMemoryConversationRow,
} from "@/lib/recuperacion/whatsapp-freeform-window";

const MAX_CART_IDS = 100;
const PAGE_SIZE = 1000;

const UNVERIFIABLE_WHATSAPP_WINDOW: ChatIndicatorWhatsappWindow = {
  closesAt: null,
  remainingSeconds: null,
  status: "unverifiable",
};

type CartIndicatorSourceRow = {
  form_datetime: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
};

type MessageMemoryIndicatorRow = WhatsappMemoryConversationRow & {
  chat_state: string | null;
  intent_category: string | null;
  message_sentiment: string | null;
  wa_id_normalized: string | null;
};

type LiveWindowRow = {
  cart_id: string | null;
  direction: string | null;
  message_at: string | null;
  whatsapp_message_id?: string | null;
};

type ChatIndicatorWhatsappWindow = {
  closesAt: string | null;
  remainingSeconds: number | null;
  status: WhatsappFreeformWindowStatus;
};

type ChatIndicatorPayload = {
  cartId: string;
  chatMessageCount: number;
  hasChat: boolean;
  hasInbound: boolean;
  lastInboundChatState: string | null;
  lastInboundIntentCategory: string | null;
  lastInboundMessageAt: string | null;
  lastInboundSentiment: string | null;
  whatsappWindow: ChatIndicatorWhatsappWindow;
};

type PagedRowsResult<T> = {
  error: boolean;
  rows: T[];
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError("No se pudo validar el acceso.", 500), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403), ok: false as const };
  }

  return { ok: true as const, supabase };
}

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return null;

  date.setDate(date.getDate() + days);

  return date;
}

function normalizeIdsFromSearchParams(searchParams: URLSearchParams) {
  const rawIds = [
    ...searchParams.getAll("cartId"),
    ...searchParams.getAll("cartIds").flatMap((value) => value.split(",")),
  ];

  return Array.from(
    new Set(
      rawIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ).slice(0, MAX_CART_IDS);
}

function emptyIndicator(cartId: string): ChatIndicatorPayload {
  return {
    cartId,
    chatMessageCount: 0,
    hasChat: false,
    hasInbound: false,
    lastInboundChatState: null,
    lastInboundIntentCategory: null,
    lastInboundMessageAt: null,
    lastInboundSentiment: null,
    whatsappWindow: {
      closesAt: null,
      remainingSeconds: null,
      status: "missing",
    },
  };
}

function indicatorWithUnverifiableWindow(indicator: ChatIndicatorPayload): ChatIndicatorPayload {
  return {
    ...indicator,
    whatsappWindow: UNVERIFIABLE_WHATSAPP_WINDOW,
  };
}

async function fetchRowsInPages<T>(buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> }): Promise<PagedRowsResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { error: true, rows: [] };
    }

    const pageRows = Array.isArray(data) ? (data as T[]) : [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      return { error: false, rows };
    }
  }
}

function rowsByKey<T>(rows: T[], keyForRow: (row: T) => string | null | undefined) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    if (!key) continue;
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }

  return map;
}

function chatIndicatorFromMemoryRows(cart: CartIndicatorSourceRow, rows: MessageMemoryIndicatorRow[]) {
  if (!cart.form_datetime) return emptyIndicator(cart.id);

  const fromDate = new Date(cart.form_datetime);
  const toDate = addDays(cart.form_datetime, 7);

  if (!toDate || Number.isNaN(fromDate.getTime())) return emptyIndicator(cart.id);

  let messageCount = 0;
  let latestInbound: MessageMemoryIndicatorRow | null = null;

  for (const message of rows) {
    const messageDate = message.message_at ? new Date(message.message_at) : null;

    if (!messageDate || Number.isNaN(messageDate.getTime()) || messageDate < fromDate || messageDate >= toDate) continue;

    messageCount += 1;

    if (message.message_bound_type === "inbound" && (!latestInbound?.message_at || messageDate > new Date(latestInbound.message_at))) {
      latestInbound = message;
    }
  }

  return {
    ...emptyIndicator(cart.id),
    chatMessageCount: messageCount,
    hasChat: messageCount > 0,
    hasInbound: Boolean(latestInbound),
    lastInboundChatState: latestInbound?.chat_state ?? null,
    lastInboundIntentCategory: latestInbound?.intent_category ?? null,
    lastInboundMessageAt: latestInbound?.message_at ?? null,
    lastInboundSentiment: latestInbound?.message_sentiment ?? null,
  };
}

function whatsappWindowForCart(params: {
  cart: CartIndicatorSourceRow;
  liveRows: LiveWindowRow[];
  memoryRows: WhatsappMemoryConversationRow[];
  nowMs: number;
}) {
  const parkingBusinessKey = businessKeyForParking(params.cart.parking_code);
  const businessKey = resolveWhatsappConversationBusinessKey({
    memoryRows: params.memoryRows,
    parkingBusinessKey,
  });
  const liveCandidates: WhatsappInboundCandidate[] = params.liveRows
    .filter((row) => row.direction === "inbound")
    .map((row) => ({
      businessKey,
      messageAt: row.message_at,
      messageId: row.whatsapp_message_id ?? null,
      source: "live" as const,
    }));

  return publicWhatsappFreeformWindow(
    resolveWhatsappFreeformWindowFromLoadedSources({
      liveCandidates,
      memoryRows: params.memoryRows,
      nowMs: params.nowMs,
      parkingBusinessKey,
    }),
  );
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const ids = normalizeIdsFromSearchParams(request.nextUrl.searchParams);

  if (ids.length === 0) {
    return NextResponse.json({ indicators: {}, ok: true });
  }

  const { data: cartsData, error: cartsError } = await admin.supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,phone_normalized,parking_code,form_datetime")
    .in("id", ids);

  if (cartsError) {
    return jsonError("No se pudieron cargar indicadores de chat.", 500);
  }

  const carts = (cartsData ?? []) as CartIndicatorSourceRow[];
  const indicators = new Map<string, ChatIndicatorPayload>(ids.map((id) => [id, emptyIndicator(id)]));
  const cartsWithPhone = carts.filter((cart) => cart.phone_normalized);

  if (cartsWithPhone.length === 0) {
    return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
  }

  const phones = Array.from(new Set(cartsWithPhone.map((cart) => cart.phone_normalized as string)));
  const cartIds = carts.map((cart) => cart.id);

  const [memoryRowsResult, rawRowsResult, liveRowsResult] = await Promise.all([
    fetchRowsInPages<MessageMemoryIndicatorRow>(() =>
      admin.supabase
        .from("recovery_whatsapp_message_memory_import")
        .select("wa_id_normalized,message_at,message_bound_type,intent_category,message_sentiment,chat_state,api_phone_normalized")
        .in("wa_id_normalized", phones)
        .order("message_at", { ascending: false }),
    ),
    fetchRowsInPages<MessageMemoryIndicatorRow>(() =>
      admin.supabase
        .from("recovery_whatsapp_message_memory_raw_import")
        .select("wa_id_normalized,message_at,message_bound_type,api_phone_normalized")
        .in("wa_id_normalized", phones)
        .order("message_at", { ascending: false }),
    ),
    fetchRowsInPages<LiveWindowRow>(() =>
      admin.supabase
        .from("recovery_whatsapp_live_messages")
        .select("cart_id,message_at,direction,whatsapp_message_id")
        .in("cart_id", cartIds)
        .eq("direction", "inbound")
        .order("message_at", { ascending: false }),
    ),
  ]);

  if (memoryRowsResult.error || rawRowsResult.error || liveRowsResult.error) {
    return NextResponse.json({
      indicators: Object.fromEntries(Array.from(indicators.entries()).map(([id, indicator]) => [id, indicatorWithUnverifiableWindow(indicator)])),
      ok: true,
    });
  }

  const normalMemoryRowsByPhone = rowsByKey(memoryRowsResult.rows, (row) => row.wa_id_normalized);
  const allMemoryRowsByPhone = rowsByKey([...memoryRowsResult.rows, ...rawRowsResult.rows], (row) => row.wa_id_normalized);
  const liveRowsByCartId = rowsByKey(liveRowsResult.rows, (row) => row.cart_id);
  const nowMs = Date.now();

  for (const cart of cartsWithPhone) {
    const indicator = chatIndicatorFromMemoryRows(cart, normalMemoryRowsByPhone.get(cart.phone_normalized as string) ?? []);

    indicators.set(cart.id, {
      ...indicator,
      whatsappWindow: whatsappWindowForCart({
        cart,
        liveRows: liveRowsByCartId.get(cart.id) ?? [],
        memoryRows: allMemoryRowsByPhone.get(cart.phone_normalized as string) ?? [],
        nowMs,
      }),
    });
  }

  return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
}
