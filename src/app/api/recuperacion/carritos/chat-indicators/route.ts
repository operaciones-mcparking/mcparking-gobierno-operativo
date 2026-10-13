import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import {
  businessKeyForBusinessPhone,
  businessKeyForParking,
  publicWhatsappFreeformWindow,
  resolveWhatsappConversationBusinessKey,
  resolveWhatsappFreeformWindowFromLoadedSources,
  type WhatsappFreeformWindowStatus,
  type WhatsappInboundCandidate,
  type WhatsappMemoryConversationRow,
} from "@/lib/recuperacion/whatsapp-freeform-window";
import {
  chatConversationIndicatorFromMemoryRows,
  type ChatIndicatorMemoryRow,
} from "@/lib/recuperacion/recovery-chat-indicator";

const MAX_CART_IDS = 100;
const PAGE_SIZE = 1000;

const UNVERIFIABLE_WHATSAPP_WINDOW: ChatIndicatorWhatsappWindow = {
  closesAt: null,
  remainingSeconds: null,
  status: "unverifiable",
};

type CartIndicatorSourceRow = {
  booking_id: string | null;
  form_datetime: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
};

type MessageMemoryIndicatorRow = ChatIndicatorMemoryRow & WhatsappMemoryConversationRow;

type LiveWindowRow = {
  cart_id: string | null;
  cart_v2_id: string | null;
  direction: string | null;
  id: string;
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
  hasChat: boolean | null;
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

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return null;

  date.setDate(date.getDate() + days);

  return date;
}

function memoryBoundsForCarts(carts: CartIndicatorSourceRow[]) {
  const fromTimes: number[] = [];
  const toTimes: number[] = [];

  for (const cart of carts) {
    if (!cart.form_datetime) continue;

    const fromDate = new Date(cart.form_datetime);
    const toDate = addDays(cart.form_datetime, 7);

    if (Number.isNaN(fromDate.getTime()) || !toDate) continue;

    fromTimes.push(fromDate.getTime());
    toTimes.push(toDate.getTime());
  }

  if (fromTimes.length === 0 || toTimes.length === 0) return null;

  return {
    from: new Date(Math.min(...fromTimes)).toISOString(),
    to: new Date(Math.max(...toTimes)).toISOString(),
  };
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

function indicatorWithUnknownChat(indicator: ChatIndicatorPayload): ChatIndicatorPayload {
  return {
    ...indicator,
    hasChat: null,
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

async function legacyCartIdentityByV2CartId(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  carts: CartIndicatorSourceRow[],
) {
  const bookingIds = Array.from(new Set(carts.map((cart) => cart.booking_id).filter((id): id is string => Boolean(id))));

  if (bookingIds.length === 0) {
    return { legacyByV2CartId: new Map<string, string>(), ok: true as const };
  }

  const { data, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,booking_id")
    .in("booking_id", bookingIds);

  if (error) {
    return { legacyByV2CartId: new Map<string, string>(), ok: false as const };
  }

  const legacyRowsByBookingId = rowsByKey((data ?? []) as { booking_id: string | null; id: string }[], (row) => row.booking_id);
  const legacyByV2CartId = new Map<string, string>();

  for (const cart of carts) {
    const legacyRows = cart.booking_id ? legacyRowsByBookingId.get(cart.booking_id) ?? [] : [];

    if (legacyRows.length === 1) {
      legacyByV2CartId.set(cart.id, legacyRows[0].id);
    }
  }

  return { legacyByV2CartId, ok: true as const };
}

function dedupeLiveRows(rows: LiveWindowRow[]) {
  const seen = new Set<string>();
  const uniqueRows: LiveWindowRow[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    uniqueRows.push(row);
  }

  return uniqueRows;
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

function memoryRowsForCartBusiness(cart: CartIndicatorSourceRow, rows: WhatsappMemoryConversationRow[]) {
  const parkingBusinessKey = businessKeyForParking(cart.parking_code);

  if (!parkingBusinessKey) return rows;

  return rows.filter((row) => {
    const rowBusinessKey = businessKeyForBusinessPhone(row.api_phone_normalized);

    return !rowBusinessKey || rowBusinessKey === parkingBusinessKey;
  });
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
    .from("v_recovery_incomplete_bookings_current_compat")
    .select("id,booking_id,phone_normalized,parking_code,form_datetime")
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
  const memoryBounds = memoryBoundsForCarts(cartsWithPhone);

  if (!memoryBounds) {
    return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
  }

  const legacyIdentity = await legacyCartIdentityByV2CartId(admin.supabase, carts);

  if (!legacyIdentity.ok) {
    return NextResponse.json({
      indicators: Object.fromEntries(Array.from(indicators.entries()).map(([id, indicator]) => [id, indicatorWithUnknownChat(indicator)])),
      ok: true,
    });
  }

  const legacyCartIds = Array.from(new Set(legacyIdentity.legacyByV2CartId.values()));

  const liveQueries = [
    fetchRowsInPages<LiveWindowRow>(() =>
      admin.supabase
        .from("recovery_whatsapp_live_messages")
        .select("id,cart_id,cart_v2_id,message_at,direction,whatsapp_message_id")
        .in("cart_v2_id", cartIds)
        .eq("direction", "inbound")
        .order("message_at", { ascending: false }),
    ),
  ];

  if (legacyCartIds.length > 0) {
    liveQueries.push(
      fetchRowsInPages<LiveWindowRow>(() =>
        admin.supabase
          .from("recovery_whatsapp_live_messages")
          .select("id,cart_id,cart_v2_id,message_at,direction,whatsapp_message_id")
          .in("cart_id", legacyCartIds)
          .eq("direction", "inbound")
          .order("message_at", { ascending: false }),
      ),
    );
  }

  const [memoryRowsResult, rawRowsResult, ...liveRowsResults] = await Promise.all([
    fetchRowsInPages<MessageMemoryIndicatorRow>(() =>
      admin.supabase
        .from("v_recovery_whatsapp_message_memory_current_compat")
        .select("wa_id_normalized,message_at,message_bound_type,intent_category,message_sentiment,chat_state,api_phone_normalized")
        .in("wa_id_normalized", phones)
        .gte("message_at", memoryBounds.from)
        .lt("message_at", memoryBounds.to)
        .order("message_at", { ascending: false }),
    ),
    fetchRowsInPages<MessageMemoryIndicatorRow>(() =>
      admin.supabase
        .from("v_recovery_whatsapp_message_memory_raw_current_compat")
        .select("wa_id_normalized,message_at,message_bound_type,api_phone_normalized")
        .in("wa_id_normalized", phones)
        .gte("message_at", memoryBounds.from)
        .lt("message_at", memoryBounds.to)
        .order("message_at", { ascending: false }),
    ),
    ...liveQueries,
  ]);

  if (memoryRowsResult.error || rawRowsResult.error || liveRowsResults.some((result) => result.error)) {
    return NextResponse.json({
      indicators: Object.fromEntries(Array.from(indicators.entries()).map(([id, indicator]) => [id, indicatorWithUnknownChat(indicator)])),
      ok: true,
    });
  }

  const normalMemoryRowsByPhone = rowsByKey(memoryRowsResult.rows, (row) => row.wa_id_normalized);
  const allMemoryRowsByPhone = rowsByKey([...memoryRowsResult.rows, ...rawRowsResult.rows], (row) => row.wa_id_normalized);
  const liveRows = dedupeLiveRows(liveRowsResults.flatMap((result) => result.rows));
  const legacyCartIdToV2CartId = new Map(Array.from(legacyIdentity.legacyByV2CartId.entries()).map(([v2CartId, legacyCartId]) => [legacyCartId, v2CartId]));
  const liveRowsByCartId = rowsByKey(liveRows, (row) => row.cart_v2_id ?? (row.cart_id ? legacyCartIdToV2CartId.get(row.cart_id) : null));
  const nowMs = Date.now();

  for (const cart of cartsWithPhone) {
    const cartWindowMemoryRows = memoryRowsForCartBusiness(
      cart,
      allMemoryRowsByPhone.get(cart.phone_normalized as string) ?? [],
    );
    const indicator = {
      ...emptyIndicator(cart.id),
      ...chatConversationIndicatorFromMemoryRows(cart, normalMemoryRowsByPhone.get(cart.phone_normalized as string) ?? []),
    };

    indicators.set(cart.id, {
      ...indicator,
      whatsappWindow: whatsappWindowForCart({
        cart,
        liveRows: liveRowsByCartId.get(cart.id) ?? [],
        memoryRows: cartWindowMemoryRows,
        nowMs,
      }),
    });
  }

  return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
}
