import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const MAX_MESSAGE_TEXT_LENGTH = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_DIRECTIONS = new Set(["inbound", "outbound"]);
const ALLOWED_SOURCES = new Set(["n8n_inbound", "n8n_outbound", "n8n_system", "recovery_web"]);
const ALLOWED_STATUSES = new Set(["pending", "sent", "delivered", "read", "failed", "received"]);

type LiveMessagePayload = {
  cartId?: unknown;
  direction?: unknown;
  email?: unknown;
  errorMessage?: unknown;
  messageAt?: unknown;
  messageText?: unknown;
  n8nExecutionId?: unknown;
  phone?: unknown;
  source?: unknown;
  whatsappMessageId?: unknown;
  whatsappStatus?: unknown;
};

type CartContactRow = {
  email_normalized: string | null;
  phone_normalized: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown) {
  const digits = safeString(value).replace(/\D/g, "");

  return digits || null;
}

function normalizeEmail(value: unknown) {
  const email = safeString(value).toLowerCase();

  return email || null;
}

function normalizeOptionalText(value: unknown, maxLength = 1000) {
  const text = safeString(value);

  return text ? text.slice(0, maxLength) : null;
}

function normalizeMessageAt(value: unknown) {
  const rawValue = safeString(value);

  if (!rawValue) return new Date().toISOString();

  const date = new Date(rawValue);

  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isValidSecret(incomingSecret: string | null) {
  const expectedSecret = process.env.N8N_RECOVERY_WEBHOOK_SECRET;

  if (!incomingSecret || !expectedSecret) return false;

  const incomingBuffer = Buffer.from(incomingSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (incomingBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  if (!isValidSecret(request.headers.get("x-mcparking-recovery-secret"))) {
    return jsonError("No autorizado.", 401);
  }

  let payload: LiveMessagePayload;

  try {
    payload = (await request.json()) as LiveMessagePayload;
  } catch {
    return jsonError("Debes enviar JSON valido.", 400);
  }

  const cartId = safeString(payload.cartId);
  const safeCartId = cartId && UUID_PATTERN.test(cartId) ? cartId : null;
  const direction = safeString(payload.direction);
  const source = safeString(payload.source);
  const messageText = safeString(payload.messageText).slice(0, MAX_MESSAGE_TEXT_LENGTH);

  if (!ALLOWED_DIRECTIONS.has(direction)) {
    return jsonError("Direccion invalida.", 400);
  }

  if (!ALLOWED_SOURCES.has(source)) {
    return jsonError("Origen invalido.", 400);
  }

  if (!messageText) {
    return jsonError("El mensaje no puede estar vacio.", 400);
  }

  const supabase = createServiceRoleClient();
  let cartContact: CartContactRow | null = null;

  if (safeCartId) {
    const { data, error } = await supabase
      .from("recovery_incomplete_bookings_import")
      .select("phone_normalized,email_normalized")
      .eq("id", safeCartId)
      .maybeSingle();

    if (error) {
      return jsonError("No se pudo validar el carrito asociado.", 500);
    }

    cartContact = data as CartContactRow | null;
  }

  const phoneNormalized = cartContact?.phone_normalized ?? normalizePhone(payload.phone);
  const emailNormalized = cartContact?.email_normalized ?? normalizeEmail(payload.email);

  if (!phoneNormalized && !safeCartId) {
    return jsonError("Debes enviar telefono o cartId.", 400);
  }

  const whatsappMessageId = normalizeOptionalText(payload.whatsappMessageId, 300);
  const whatsappStatus = normalizeOptionalText(payload.whatsappStatus, 80);
  const safeWhatsappStatus = whatsappStatus && ALLOWED_STATUSES.has(whatsappStatus) ? whatsappStatus : null;

  const row = {
    cart_id: safeCartId,
    direction,
    email_normalized: emailNormalized,
    error_message: normalizeOptionalText(payload.errorMessage, 1000),
    message_at: normalizeMessageAt(payload.messageAt),
    message_text: messageText,
    n8n_execution_id: normalizeOptionalText(payload.n8nExecutionId, 300),
    phone_normalized: phoneNormalized,
    source,
    updated_at: new Date().toISOString(),
    whatsapp_message_id: whatsappMessageId,
    whatsapp_status: safeWhatsappStatus ?? (direction === "inbound" ? "received" : null),
  };

  if (whatsappMessageId) {
    const { data: existingData, error: existingError } = await supabase
      .from("recovery_whatsapp_live_messages")
      .select("id")
      .eq("whatsapp_message_id", whatsappMessageId)
      .maybeSingle();

    if (existingError) {
      return jsonError("No se pudo validar el mensaje live.", 500);
    }

    if (existingData?.id) {
      const { error: updateError } = await supabase
        .from("recovery_whatsapp_live_messages")
        .update(row)
        .eq("id", existingData.id);

      if (updateError) {
        return jsonError("No se pudo actualizar el mensaje live.", 500);
      }

      return NextResponse.json({ id: existingData.id, ok: true, updated: true });
    }
  }

  const { data: insertedData, error: insertError } = await supabase
    .from("recovery_whatsapp_live_messages")
    .insert(row)
    .select("id")
    .single();

  if (insertError) {
    return jsonError("No se pudo registrar el mensaje live.", 500);
  }

  return NextResponse.json({ id: insertedData.id, ok: true, updated: false });
}
