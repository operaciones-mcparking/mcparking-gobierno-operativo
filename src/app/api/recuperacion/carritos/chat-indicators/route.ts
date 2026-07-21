import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const MAX_CART_IDS = 100;

type CartIndicatorSourceRow = {
  form_datetime: string | null;
  id: string;
  phone_normalized: string | null;
};

type MessageMemoryIndicatorRow = {
  chat_state: string | null;
  intent_category: string | null;
  message_at: string | null;
  message_bound_type: string | null;
  message_sentiment: string | null;
  wa_id_normalized: string | null;
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

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
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
  };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Debes enviar JSON valido.", 400);
  }

  const ids = normalizeIds((body as { cartIds?: unknown })?.cartIds);

  if (ids.length === 0) {
    return NextResponse.json({ indicators: {}, ok: true });
  }

  const { data: cartsData, error: cartsError } = await admin.supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,phone_normalized,form_datetime")
    .in("id", ids);

  if (cartsError) {
    return jsonError("No se pudieron cargar indicadores de chat.", 500);
  }

  const carts = (cartsData ?? []) as CartIndicatorSourceRow[];
  const indicators = new Map<string, ChatIndicatorPayload>(ids.map((id) => [id, emptyIndicator(id)]));
  const cartsWithWindow = carts.filter((cart) => cart.phone_normalized && cart.form_datetime);

  if (cartsWithWindow.length === 0) {
    return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
  }

  const phones = Array.from(new Set(cartsWithWindow.map((cart) => cart.phone_normalized as string)));
  const fromDates = cartsWithWindow
    .map((cart) => new Date(cart.form_datetime as string))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (phones.length === 0 || fromDates.length === 0) {
    return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
  }

  const minDate = new Date(Math.min(...fromDates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...fromDates.map((date) => date.getTime())));
  maxDate.setDate(maxDate.getDate() + 7);

  const { data: messagesData, error: messagesError } = await admin.supabase
    .from("recovery_whatsapp_message_memory_import")
    .select("wa_id_normalized,message_at,message_bound_type,intent_category,message_sentiment,chat_state")
    .in("wa_id_normalized", phones)
    .gte("message_at", minDate.toISOString())
    .lt("message_at", maxDate.toISOString());

  if (messagesError) {
    return jsonError("No se pudieron cargar indicadores de chat.", 500);
  }

  const messagesByPhone = new Map<string, MessageMemoryIndicatorRow[]>();

  for (const message of (messagesData ?? []) as MessageMemoryIndicatorRow[]) {
    if (!message.wa_id_normalized) continue;
    const rows = messagesByPhone.get(message.wa_id_normalized) ?? [];
    rows.push(message);
    messagesByPhone.set(message.wa_id_normalized, rows);
  }

  for (const cart of cartsWithWindow) {
    if (!cart.phone_normalized || !cart.form_datetime) continue;
    const fromDate = new Date(cart.form_datetime);
    const toDate = addDays(cart.form_datetime, 7);

    if (!toDate || Number.isNaN(fromDate.getTime())) continue;

    let messageCount = 0;
    let latestInbound: MessageMemoryIndicatorRow | null = null;

    for (const message of messagesByPhone.get(cart.phone_normalized) ?? []) {
      if (!message.message_at) continue;
      const messageDate = new Date(message.message_at);

      if (Number.isNaN(messageDate.getTime()) || messageDate < fromDate || messageDate >= toDate) continue;

      messageCount += 1;

      if (message.message_bound_type === "inbound" && (!latestInbound?.message_at || messageDate > new Date(latestInbound.message_at))) {
        latestInbound = message;
      }
    }

    indicators.set(cart.id, {
      cartId: cart.id,
      chatMessageCount: messageCount,
      hasChat: messageCount > 0,
      hasInbound: Boolean(latestInbound),
      lastInboundChatState: latestInbound?.chat_state ?? null,
      lastInboundIntentCategory: latestInbound?.intent_category ?? null,
      lastInboundMessageAt: latestInbound?.message_at ?? null,
      lastInboundSentiment: latestInbound?.message_sentiment ?? null,
    });
  }

  return NextResponse.json({ indicators: Object.fromEntries(indicators), ok: true });
}