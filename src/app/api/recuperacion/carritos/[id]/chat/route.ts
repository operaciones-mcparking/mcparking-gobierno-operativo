import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";
import {
  businessKeyForParking,
  getWhatsappFreeformWindowForCart,
  recoveryWhatsappBusinessPhoneForKey,
  type WhatsappFreeformWindowState,
} from "@/lib/recuperacion/whatsapp-freeform-window";

const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_PAGE_SIZE = 100;

const LIVE_MESSAGE_SELECT = "id,direction,message_at,message_text,source,whatsapp_status,whatsapp_message_id";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CartChatSourceRow = {
  booking_id: string | null;
  cms_url: string | null;
  email_normalized: string | null;
  form_datetime: string | null;
  id: string;
  intended_departure_date: string | null;
  parking_code: string | null;
  phone_normalized: string | null;
  type: string | null;
};

type MessageMemoryChatRow = {
  api_phone_normalized: string | null;
  chat_state: string | null;
  conversation_id: string | null;
  day_of_week: string | null;
  id: string | null;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_type: string | null;
  time_of_day: string | null;
  whatsapp_status?: string | null;
};

type RawMessageMemoryChatRow = {
  api_phone_normalized: string | null;
  chat_state: string | null;
  conversation_id: string | null;
  id: string | null;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_text: string | null;
  message_type: string | null;
  whatsapp_status?: string | null;
};

type ScopedConversationMessageRow = RawMessageMemoryChatRow & {
  source_id_raw: number | null;
};

type LiveMessageChatRow = {
  direction: "inbound" | "outbound";
  id: string;
  message_at: string;
  message_text: string;
  source: string;
  whatsapp_message_id: string | null;
  whatsapp_status: string | null;
};

type SafeChatMessagePayload = {
  chatState: string | null;
  dayOfWeek: string | null;
  direction: "inbound" | "outbound";
  intentCategory: string | null;
  label: string;
  messageAt: string;
  messageBoundType: string | null;
  messageSentiment: string | null;
  messageSource: string | null;
  source: "live" | "message_memory";
  messageText: string | null;
  messageType: string | null;
  sourceMessageId: string | null;
  timeOfDay: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: string | null;
};

type ChatPaginationPayload = {
  hasMore: boolean;
  nextBefore: string | null;
  nextBeforeSourceId?: number | null;
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
    return { error: jsonError(error.message, 500), ok: false as const };
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

function directionForBoundType(messageBoundType: string | null) {
  return messageBoundType === "outbound" ? "outbound" : "inbound";
}

function labelForDirection(direction: "inbound" | "outbound") {
  return direction === "inbound" ? "Cliente" : "Nosotros / sistema";
}

function normalizedWhatsappMessageId(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();

  return normalized.length > 0 ? normalized : null;
}

function safeCartPayload(cart: CartChatSourceRow, windowStart: string | null, windowEnd: string | null) {
  const effectiveParking = resolveRecoveryCommercialParking({
    cmsUrl: cart.cms_url,
    parkingCode: cart.parking_code,
  }).parkingCode;

  return {
    cmsUrl: cart.cms_url,
    email: cart.email_normalized,
    formDatetime: cart.form_datetime,
    id: cart.id,
    intendedDepartureDate: cart.intended_departure_date,
    parkingCode: effectiveParking,
    phone: cart.phone_normalized,
    type: cart.type,
    windowEnd,
    windowStart,
  };
}

function safeMessagePayload(message: MessageMemoryChatRow | RawMessageMemoryChatRow): SafeChatMessagePayload {
  const direction = directionForBoundType(message.message_bound_type);

  return {
    chatState: message.chat_state,
    dayOfWeek: "day_of_week" in message ? message.day_of_week : null,
    direction,
    intentCategory: message.intent_category,
    label: labelForDirection(direction),
    messageAt: message.message_at,
    messageBoundType: message.message_bound_type,
    messageSentiment: message.message_sentiment,
    messageSource: null,
    source: "message_memory",
    messageText: "message_text" in message ? message.message_text : null,
    messageType: message.message_type,
    sourceMessageId: message.id,
    timeOfDay: "time_of_day" in message ? message.time_of_day : null,
    whatsappMessageId: normalizedWhatsappMessageId(message.conversation_id),
    whatsappStatus: "whatsapp_status" in message ? message.whatsapp_status ?? null : null,
  };
}

function safeLiveMessagePayload(message: LiveMessageChatRow): SafeChatMessagePayload {
  return {
    chatState: null,
    dayOfWeek: null,
    direction: message.direction,
    intentCategory: null,
    label: labelForDirection(message.direction),
    messageAt: message.message_at,
    messageBoundType: message.direction,
    messageSentiment: null,
    messageSource: message.source,
    source: "live",
    messageText: message.message_text,
    messageType: "text",
    sourceMessageId: message.id,
    timeOfDay: null,
    whatsappMessageId: normalizedWhatsappMessageId(message.whatsapp_message_id),
    whatsappStatus: message.whatsapp_status,
  };
}

function buildSummary(messages: SafeChatMessagePayload[], source: "metadata" | "raw" | "live") {
  const inboundMessages = messages.filter((message) => message.direction === "inbound").length;
  const liveMessages = messages.filter((message) => message.messageSource).length;
  const outboundMessages = messages.filter((message) => message.direction === "outbound").length;

  return {
    hasConversation: messages.length > 0,
    inboundMessages,
    liveMessages,
    outboundMessages,
    source,
    totalMessages: messages.length,
  };
}

function sortSafeMessages(messages: SafeChatMessagePayload[]) {
  return [...messages].sort((left, right) => {
    const leftTime = new Date(left.messageAt).getTime();
    const rightTime = new Date(right.messageAt).getTime();

    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.direction !== right.direction) return left.direction === "inbound" ? -1 : 1;
    if (left.source !== right.source) return left.source.localeCompare(right.source);
    const leftId = normalizedWhatsappMessageId(left.whatsappMessageId) ?? left.sourceMessageId ?? left.messageSource ?? "";
    const rightId = normalizedWhatsappMessageId(right.whatsappMessageId) ?? right.sourceMessageId ?? right.messageSource ?? "";

    if (leftId !== rightId) return leftId.localeCompare(rightId);

    return 0;
  });
}

function dedupeLiveMessages(messages: LiveMessageChatRow[]) {
  const seen = new Set<string>();
  const uniqueMessages: LiveMessageChatRow[] = [];

  for (const message of messages) {
    const key = message.id;

    if (seen.has(key)) continue;

    seen.add(key);
    uniqueMessages.push(message);
  }

  return uniqueMessages;
}

function dedupeLiveMessagesAgainstCanonical(
  liveMessages: SafeChatMessagePayload[],
  canonicalMessages: SafeChatMessagePayload[],
) {
  const canonicalWamids = new Set(
    canonicalMessages
      .map((message) => normalizedWhatsappMessageId(message.whatsappMessageId))
      .filter((wamid): wamid is string => wamid !== null),
  );

  return liveMessages.filter((message) => {
    const liveWamid = normalizedWhatsappMessageId(message.whatsappMessageId);

    return liveWamid === null || !canonicalWamids.has(liveWamid);
  });
}

async function loadLiveMessages(params: {
  cartId: string;
  legacyCartId: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>;
}) {
  const cartLiveQueries = [
    params.supabase
      .from("recovery_whatsapp_live_messages")
      .select(LIVE_MESSAGE_SELECT)
      .eq("cart_v2_id", params.cartId)
      .order("message_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_CHAT_MESSAGES),
  ];

  if (params.legacyCartId) {
    cartLiveQueries.push(
      params.supabase
        .from("recovery_whatsapp_live_messages")
        .select(LIVE_MESSAGE_SELECT)
        .eq("cart_id", params.legacyCartId)
        .order("message_at", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_CHAT_MESSAGES),
    );
  }

  const cartLiveResults = await Promise.all(cartLiveQueries);

  return dedupeLiveMessages([
    ...cartLiveResults.flatMap((result) => (result.data ?? []) as LiveMessageChatRow[]),
  ]).slice(0, MAX_CHAT_MESSAGES);
}

async function resolveLegacyCartIdByBookingId(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  bookingId: string | null,
) {
  if (!bookingId) return { legacyCartId: null, ok: true as const };

  const { data, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id")
    .eq("booking_id", bookingId)
    .limit(2);

  if (error) {
    return { failed: true, legacyCartId: null, ok: false as const };
  }

  if ((data ?? []).length > 1) {
    return { failed: true, legacyCartId: null, ok: false as const };
  }

  return { legacyCartId: data?.[0]?.id ?? null, ok: true as const };
}

function normalizedPageSize(value: string | null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_CHAT_PAGE_SIZE;

  return Math.min(parsed, MAX_CHAT_PAGE_SIZE);
}

function normalizedBeforeCursor(value: string | null) {
  if (!value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function normalizedBeforeSourceId(value: string | null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isMissingConversationReadRpcError(error: unknown) {
  const candidate = error as { code?: string | null; details?: string | null; message?: string | null } | null;
  const text = [candidate?.code, candidate?.message, candidate?.details]
    .filter(Boolean)
    .join(" ");

  return /\b(PGRST202|42883)\b/i.test(text)
    || /recovery_whatsapp_conversation_messages_v2.*(not found|does not exist|could not find|unknown)/i.test(text)
    || /(not found|does not exist|could not find|unknown).*recovery_whatsapp_conversation_messages_v2/i.test(text);
}

function paginationForMessages(messages: SafeChatMessagePayload[], requestedLimit: number, fetchedCanonicalCount: number): ChatPaginationPayload {
  const sorted = sortSafeMessages(messages);
  const oldest = sorted[0]?.messageAt ?? null;
  const hasMore = fetchedCanonicalCount > requestedLimit;

  return {
    hasMore,
    nextBefore: hasMore ? oldest : null,
    nextBeforeSourceId: null,
  };
}

function paginationForScopedRows(rows: ScopedConversationMessageRow[], requestedLimit: number): ChatPaginationPayload {
  const canonicalRows = rows.slice(0, requestedLimit);
  const oldest = canonicalRows[canonicalRows.length - 1] ?? null;
  const hasMore = rows.length > requestedLimit;

  return {
    hasMore,
    nextBefore: hasMore ? oldest?.message_at ?? null : null,
    nextBeforeSourceId: hasMore ? oldest?.source_id_raw ?? null : null,
  };
}

async function loadScopedConversationMessages(params: {
  beforeCursor: string | null;
  beforeSourceId: number | null;
  businessPhone: string;
  pageSize: number;
  phoneNormalized: string;
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>;
}) {
  const { data, error } = await params.supabase.rpc("recovery_whatsapp_conversation_messages_v2", {
    p_api_phone_normalized: params.businessPhone,
    p_before: params.beforeCursor,
    p_before_source_id: params.beforeSourceId,
    p_limit: params.pageSize + 1,
    p_wa_id_normalized: params.phoneNormalized,
  });

  if (error) {
    return { error, rows: [] as ScopedConversationMessageRow[] };
  }

  return { error: null, rows: (data ?? []) as ScopedConversationMessageRow[] };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const { id } = await context.params;
  const cartId = id.trim();

  if (!cartId) {
    return jsonError("Debes indicar un carrito valido.", 400);
  }

  const { data: cartData, error: cartError } = await admin.supabase
    .from("v_recovery_incomplete_bookings_current_compat")
    .select("id,booking_id,cms_url,email_normalized,phone_normalized,form_datetime,intended_departure_date,type,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (cartError) {
    return jsonError("No se pudo cargar el carrito solicitado.", 500);
  }

  if (!cartData) {
    return jsonError("Carrito no encontrado.", 404);
  }

  const cart = cartData as CartChatSourceRow;
  const legacyIdentity = await resolveLegacyCartIdByBookingId(admin.supabase, cart.booking_id);

  if (!legacyIdentity.ok) {
    return jsonError("No se pudo resolver la identidad del carrito.", 500);
  }

  const windowStart = cart.form_datetime;
  const windowEndDate = cart.form_datetime ? addDays(cart.form_datetime, 7) : null;
  const windowEnd = windowEndDate ? windowEndDate.toISOString() : null;
  const pageSize = normalizedPageSize(request.nextUrl.searchParams.get("limit"));
  const beforeCursor = normalizedBeforeCursor(request.nextUrl.searchParams.get("before"));
  const beforeSourceId = normalizedBeforeSourceId(request.nextUrl.searchParams.get("beforeSourceId"));

  const commercialParking = resolveRecoveryCommercialParking({
    cmsUrl: cart.cms_url,
    parkingCode: cart.parking_code,
  });
  const cartBusinessKey = businessKeyForParking(commercialParking.parkingCode);
  const whatsappWindow = await getWhatsappFreeformWindowForCart(admin.supabase, cartId, Date.now(), {
    bookingId: cart.booking_id,
    parkingBusinessKey: cartBusinessKey,
    phoneNormalized: cart.phone_normalized,
  });

  if (!cart.phone_normalized) {
    return NextResponse.json({
      cart: safeCartPayload(cart, windowStart, windowEnd),
      messages: [],
      ok: true,
      reason: "El carrito no tiene telefono normalizado para cruzar conversaciones.",
      summary: buildSummary([], "metadata"),
      whatsappWindow,
    });
  }

  const liveMessages = await loadLiveMessages({
    cartId,
    legacyCartId: legacyIdentity.legacyCartId,
    supabase: admin.supabase,
  });
  const safeLiveMessages = liveMessages.map(safeLiveMessagePayload);
  const cartBusinessPhone = cartBusinessKey ? recoveryWhatsappBusinessPhoneForKey(cartBusinessKey) : null;

  if (cartBusinessPhone) {
    const scopedMessages = await loadScopedConversationMessages({
      beforeCursor,
      beforeSourceId,
      businessPhone: cartBusinessPhone,
      pageSize,
      phoneNormalized: cart.phone_normalized,
      supabase: admin.supabase,
    });

    if (!scopedMessages.error) {
      const canonicalRows = scopedMessages.rows.slice(0, pageSize);
      const safeCanonicalMessages = canonicalRows.map(safeMessagePayload);
      const messages = sortSafeMessages([
        ...safeCanonicalMessages,
        ...(beforeCursor ? [] : dedupeLiveMessagesAgainstCanonical(safeLiveMessages, safeCanonicalMessages)),
      ]).slice(-pageSize);

      return NextResponse.json({
        cart: safeCartPayload(cart, windowStart, windowEnd),
        messages,
        ok: true,
        pagination: paginationForScopedRows(scopedMessages.rows, pageSize),
        summary: buildSummary(messages, canonicalRows.length > 0 ? "raw" : "live"),
        whatsappWindow,
      });
    }

    if (!isMissingConversationReadRpcError(scopedMessages.error)) {
      return jsonError("No se pudo cargar el chat real del carrito.", 500);
    }
  }

  let rawMessagesQuery = admin.supabase
    .from("v_recovery_whatsapp_message_memory_raw_current_compat")
    .select("id,conversation_id,api_phone_normalized,message_at,message_bound_type,message_type,intent_category,message_sentiment,chat_state,message_text")
    .eq("wa_id_normalized", cart.phone_normalized)
    .order("message_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (beforeCursor) {
    rawMessagesQuery = rawMessagesQuery.lt("message_at", beforeCursor);
  }

  if (cartBusinessPhone) {
    rawMessagesQuery = rawMessagesQuery.eq("api_phone_normalized", cartBusinessPhone);
  }

  const { data: rawMessagesData, error: rawMessagesError } = await rawMessagesQuery;

  if (rawMessagesError) {
    return jsonError("No se pudo cargar el chat real del carrito.", 500);
  }

  const rawMessages = ((rawMessagesData ?? []) as RawMessageMemoryChatRow[]).slice(0, pageSize);

  if (rawMessages.length > 0) {
    const safeRawMessages = rawMessages.map(safeMessagePayload);
    const messages = sortSafeMessages([
      ...safeRawMessages,
      ...(beforeCursor ? [] : dedupeLiveMessagesAgainstCanonical(safeLiveMessages, safeRawMessages)),
    ]).slice(-pageSize);

    return NextResponse.json({
      cart: safeCartPayload(cart, windowStart, windowEnd),
      messages,
      ok: true,
      pagination: paginationForMessages(messages, pageSize, (rawMessagesData ?? []).length),
      summary: buildSummary(messages, "raw"),
      whatsappWindow,
    });
  }

  let messagesQuery = admin.supabase
    .from("v_recovery_whatsapp_message_memory_current_compat")
    .select("id,conversation_id,api_phone_normalized,message_at,message_bound_type,message_type,intent_category,message_sentiment,chat_state,time_of_day,day_of_week")
    .eq("wa_id_normalized", cart.phone_normalized)
    .order("message_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (beforeCursor) {
    messagesQuery = messagesQuery.lt("message_at", beforeCursor);
  }

  if (cartBusinessPhone) {
    messagesQuery = messagesQuery.eq("api_phone_normalized", cartBusinessPhone);
  }

  const { data: messagesData, error: messagesError } = await messagesQuery;

  if (messagesError) {
    return jsonError("No se pudo cargar el chat metadata-only del carrito.", 500);
  }

  const messages = ((messagesData ?? []) as MessageMemoryChatRow[]).slice(0, pageSize);
  const safeCanonicalMessages = messages.map(safeMessagePayload);
  const safeMessages = sortSafeMessages([
    ...safeCanonicalMessages,
    ...(beforeCursor ? [] : dedupeLiveMessagesAgainstCanonical(safeLiveMessages, safeCanonicalMessages)),
  ]).slice(-pageSize);

  return NextResponse.json({
    cart: safeCartPayload(cart, windowStart, windowEnd),
    messages: safeMessages,
    ok: true,
    pagination: paginationForMessages(safeMessages, pageSize, (messagesData ?? []).length),
    summary: buildSummary(safeMessages, messages.length > 0 ? "metadata" : "live"),
    whatsappWindow,
  });
}
