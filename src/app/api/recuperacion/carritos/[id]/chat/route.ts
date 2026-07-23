import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const MAX_CHAT_MESSAGES = 100;

const LIVE_MESSAGE_SELECT = "direction,message_at,message_text,source,whatsapp_status";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CartChatSourceRow = {
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
  chat_state: string | null;
  day_of_week: string | null;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_type: string | null;
  time_of_day: string | null;
};

type RawMessageMemoryChatRow = {
  chat_state: string | null;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_text: string | null;
  message_type: string | null;
};

type LiveMessageChatRow = {
  direction: "inbound" | "outbound";
  message_at: string;
  message_text: string;
  source: string;
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
  timeOfDay: string | null;
  whatsappStatus: string | null;
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

function safeCartPayload(cart: CartChatSourceRow, windowStart: string | null, windowEnd: string | null) {
  return {
    cmsUrl: cart.cms_url,
    email: cart.email_normalized,
    formDatetime: cart.form_datetime,
    id: cart.id,
    intendedDepartureDate: cart.intended_departure_date,
    parkingCode: cart.parking_code,
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
    timeOfDay: "time_of_day" in message ? message.time_of_day : null,
    whatsappStatus: null,
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
    timeOfDay: null,
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

    return 0;
  });
}

function dedupeLiveMessages(messages: LiveMessageChatRow[]) {
  const seen = new Set<string>();
  const uniqueMessages: LiveMessageChatRow[] = [];

  for (const message of messages) {
    const key = [message.direction, message.message_at, message.source, message.whatsapp_status, message.message_text].join("|");

    if (seen.has(key)) continue;

    seen.add(key);
    uniqueMessages.push(message);
  }

  return uniqueMessages;
}

async function loadLiveMessages(params: {
  cartId: string;
  phoneNormalized: string;
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>;
  windowEnd: string;
  windowStart: string;
}) {
  const { data: cartLiveMessages } = await params.supabase
    .from("recovery_whatsapp_live_messages")
    .select(LIVE_MESSAGE_SELECT)
    .eq("cart_id", params.cartId)
    .order("message_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_CHAT_MESSAGES);

  const { data: phoneLiveMessages } = await params.supabase
    .from("recovery_whatsapp_live_messages")
    .select(LIVE_MESSAGE_SELECT)
    .eq("phone_normalized", params.phoneNormalized)
    .gte("message_at", params.windowStart)
    .lt("message_at", params.windowEnd)
    .order("message_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_CHAT_MESSAGES);

  return dedupeLiveMessages([
    ...((cartLiveMessages ?? []) as LiveMessageChatRow[]),
    ...((phoneLiveMessages ?? []) as LiveMessageChatRow[]),
  ]).slice(0, MAX_CHAT_MESSAGES);
}

export async function GET(_request: NextRequest, context: RouteContext) {
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
    .from("recovery_incomplete_bookings_import")
    .select("id,cms_url,email_normalized,phone_normalized,form_datetime,intended_departure_date,type,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (cartError) {
    return jsonError("No se pudo cargar el carrito solicitado.", 500);
  }

  if (!cartData) {
    return jsonError("Carrito no encontrado.", 404);
  }

  const cart = cartData as CartChatSourceRow;
  const windowStart = cart.form_datetime;
  const windowEndDate = cart.form_datetime ? addDays(cart.form_datetime, 7) : null;
  const windowEnd = windowEndDate ? windowEndDate.toISOString() : null;

  if (!cart.phone_normalized) {
    return NextResponse.json({
      cart: safeCartPayload(cart, windowStart, windowEnd),
      messages: [],
      ok: true,
      reason: "El carrito no tiene telefono normalizado para cruzar conversaciones.",
      summary: buildSummary([], "metadata"),
    });
  }

  if (!windowStart || !windowEnd) {
    return NextResponse.json({
      cart: safeCartPayload(cart, windowStart, windowEnd),
      messages: [],
      ok: true,
      reason: "El carrito no tiene fecha form_datetime valida para construir la ventana de chat.",
      summary: buildSummary([], "metadata"),
    });
  }

  const liveMessages = await loadLiveMessages({
    cartId,
    phoneNormalized: cart.phone_normalized,
    supabase: admin.supabase,
    windowEnd,
    windowStart,
  });
  const safeLiveMessages = liveMessages.map(safeLiveMessagePayload);

  const { data: rawMessagesData, error: rawMessagesError } = await admin.supabase
    .from("recovery_whatsapp_message_memory_raw_import")
    .select("message_at,message_bound_type,message_type,intent_category,message_sentiment,chat_state,message_text")
    .eq("wa_id_normalized", cart.phone_normalized)
    .gte("message_at", windowStart)
    .lt("message_at", windowEnd)
    .order("message_at", { ascending: true })
    .order("message_bound_type", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_CHAT_MESSAGES);

  if (rawMessagesError) {
    return jsonError("No se pudo cargar el chat real del carrito.", 500);
  }

  const rawMessages = (rawMessagesData ?? []) as RawMessageMemoryChatRow[];

  if (rawMessages.length > 0) {
    const messages = sortSafeMessages([...rawMessages.map(safeMessagePayload), ...safeLiveMessages]).slice(0, MAX_CHAT_MESSAGES);

    return NextResponse.json({
      cart: safeCartPayload(cart, windowStart, windowEnd),
      messages,
      ok: true,
      summary: buildSummary(messages, "raw"),
    });
  }

  const { data: messagesData, error: messagesError } = await admin.supabase
    .from("recovery_whatsapp_message_memory_import")
    .select("message_at,message_bound_type,message_type,intent_category,message_sentiment,chat_state,time_of_day,day_of_week")
    .eq("wa_id_normalized", cart.phone_normalized)
    .gte("message_at", windowStart)
    .lt("message_at", windowEnd)
    .order("message_at", { ascending: true })
    .order("message_bound_type", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_CHAT_MESSAGES);

  if (messagesError) {
    return jsonError("No se pudo cargar el chat metadata-only del carrito.", 500);
  }

  const messages = (messagesData ?? []) as MessageMemoryChatRow[];
  const safeMessages = sortSafeMessages([...messages.map(safeMessagePayload), ...safeLiveMessages]).slice(0, MAX_CHAT_MESSAGES);

  return NextResponse.json({
    cart: safeCartPayload(cart, windowStart, windowEnd),
    messages: safeMessages,
    ok: true,
    summary: buildSummary(safeMessages, messages.length > 0 ? "metadata" : "live"),
  });
}
