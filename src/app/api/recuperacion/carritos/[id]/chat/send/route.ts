import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const MAX_MESSAGE_TEXT_LENGTH = 4096;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SendChatPayload = {
  dryRun?: unknown;
  messageText?: unknown;
};

type CartSendSourceRow = {
  email_normalized: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
  type: string | null;
};

type SupabaseTechnicalError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type SafeSentMessage = {
  chatState: string | null;
  dayOfWeek: string | null;
  direction: "outbound";
  intentCategory: string | null;
  label: string;
  messageAt: string;
  messageBoundType: string;
  messageSentiment: string | null;
  messageSource: string;
  source: "live";
  messageText: string;
  messageType: string;
  timeOfDay: string | null;
  whatsappStatus: string | null;
};

function jsonError(message: string, status: number, stage?: string, messagePayload?: SafeSentMessage) {
  return NextResponse.json({ error: message, message: messagePayload, ok: false, stage }, { status });
}

function sanitizeDebugValue(value: unknown) {
  const text = safeString(value);

  if (!text) return null;
  if (/failing row contains/i.test(text)) return "Detalle de fila omitido por seguridad.";

  return text.slice(0, 1000);
}

function supabaseDebugPayload(error: SupabaseTechnicalError) {
  return {
    debugCode: sanitizeDebugValue(error.code),
    debugDetails: sanitizeDebugValue(error.details),
    debugHint: sanitizeDebugValue(error.hint),
    debugMessage: sanitizeDebugValue(error.message),
  };
}

function logSupabaseTechnicalError(stage: string, error: SupabaseTechnicalError) {
  const debug = supabaseDebugPayload(error);

  console.error("[recovery-whatsapp-chat-send]", {
    debugCode: debug.debugCode,
    debugDetails: debug.debugDetails,
    debugHint: debug.debugHint,
    debugMessage: debug.debugMessage,
    stage,
  });
}

function jsonSupabaseTechnicalError(message: string, status: number, stage: string, error: SupabaseTechnicalError) {
  logSupabaseTechnicalError(stage, error);

  return NextResponse.json(
    {
      error: message,
      ok: false,
      stage,
      ...(process.env.NODE_ENV !== "production" ? supabaseDebugPayload(error) : {}),
    },
    { status },
  );
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

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401, "auth"), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError("No se pudo validar el acceso.", 500, "auth"), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403, "auth"), ok: false as const };
  }

  return { ok: true as const, supabase, user };
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMessagePayload(message: {
  message_at: string;
  message_text: string;
  whatsapp_status: string | null;
}): SafeSentMessage {
  return {
    chatState: null,
    dayOfWeek: null,
    direction: "outbound",
    intentCategory: null,
    label: "Nosotros / sistema",
    messageAt: message.message_at,
    messageBoundType: "outbound",
    messageSentiment: null,
    messageSource: "recovery_web",
    source: "live",
    messageText: message.message_text,
    messageType: "text",
    timeOfDay: null,
    whatsappStatus: message.whatsapp_status,
  };
}

async function callN8nWebhook(payload: {
  cart: CartSendSourceRow;
  messageText: string;
  operatorEmail: string | null;
  sentAt: string;
}) {
  const webhookUrl = process.env.N8N_RECOVERY_WHATSAPP_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_RECOVERY_WEBHOOK_SECRET;

  if (!webhookUrl) {
    return { errorMessage: "Falta configurar N8N_RECOVERY_WHATSAPP_WEBHOOK_URL.", ok: false as const, status: 500 };
  }

  if (!webhookSecret) {
    return { errorMessage: "Falta configurar N8N_RECOVERY_WEBHOOK_SECRET.", ok: false as const, status: 500 };
  }

  const response = await fetch(webhookUrl, {
    body: JSON.stringify({
      cartId: payload.cart.id,
      cartType: payload.cart.type,
      email: payload.cart.email_normalized,
      messageText: payload.messageText,
      operatorEmail: payload.operatorEmail,
      parking: payload.cart.parking_code,
      phone: payload.cart.phone_normalized,
      sentAt: payload.sentAt,
      source: "recovery_web",
    }),
    headers: {
      "Content-Type": "application/json",
      "x-mcparking-recovery-secret": webhookSecret,
    },
    method: "POST",
  });

  let responsePayload: unknown = null;

  try {
    responsePayload = await response.json();
  } catch {
    responsePayload = null;
  }

  if (!response.ok) {
    return { errorMessage: `n8n respondio HTTP ${response.status}.`, ok: false as const, status: response.status };
  }

  const typedPayload = responsePayload as { n8nExecutionId?: unknown; executionId?: unknown; whatsappMessageId?: unknown; whatsappStatus?: unknown } | null;

  return {
    n8nExecutionId: safeString(typedPayload?.n8nExecutionId) || safeString(typedPayload?.executionId) || null,
    ok: true as const,
    whatsappMessageId: safeString(typedPayload?.whatsappMessageId) || null,
    whatsappStatus: safeString(typedPayload?.whatsappStatus) || "sent",
  };
}

function shortErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message.slice(0, 1000);
  const text = safeString(value);

  return text ? text.slice(0, 1000) : "Error al enviar mensaje.";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const { id } = await context.params;
  const cartId = id.trim();

  if (!cartId) {
    return jsonError("Debes indicar un carrito valido.", 400, "cart");
  }

  let payload: SendChatPayload;

  try {
    payload = (await request.json()) as SendChatPayload;
  } catch {
    return jsonError("Debes enviar JSON valido.", 400, "payload");
  }

  const messageText = safeString(payload.messageText).slice(0, MAX_MESSAGE_TEXT_LENGTH);

  if (!messageText) {
    return jsonError("El mensaje no puede estar vacio.", 400, "payload");
  }

  const { data: cartData, error: cartError } = await admin.supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,email_normalized,phone_normalized,type,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (cartError) {
    return jsonError("No se pudo cargar el carrito solicitado.", 500, "cart");
  }

  if (!cartData) {
    return jsonError("Carrito no encontrado.", 404, "cart");
  }

  const cart = cartData as CartSendSourceRow;

  if (!cart.phone_normalized) {
    return jsonError("El carrito no tiene telefono normalizado.", 400, "cart");
  }

  const sentAt = new Date().toISOString();
  const operatorEmail = admin.user.email ?? null;
  const dryRun = payload.dryRun === true;

  if (dryRun) {
    return NextResponse.json({
      cartId: cart.id,
      dryRun: true,
      ok: true,
      source: "recovery_web",
      status: "dry_run",
      wouldSendToN8n: true,
    });
  }

  let serviceSupabase: ReturnType<typeof createServiceRoleClient>;

  try {
    serviceSupabase = createServiceRoleClient();
  } catch (error) {
    return jsonSupabaseTechnicalError("No se pudo inicializar el cliente de servicio.", 500, "service_role", {
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }

  const { data: insertedMessage, error: insertError } = await serviceSupabase
    .from("recovery_whatsapp_live_messages")
    .insert({
      cart_id: cart.id,
      direction: "outbound",
      email_normalized: cart.email_normalized,
      message_at: sentAt,
      message_text: messageText,
      phone_normalized: cart.phone_normalized,
      sent_by: admin.user.id,
      sent_by_email: operatorEmail,
      source: "web_operator",
      whatsapp_status: "pending",
    })
    .select("id,message_at,message_text,whatsapp_status")
    .single();

  if (insertError) {
    return jsonSupabaseTechnicalError("No se pudo registrar el mensaje para envio.", 500, "insert", insertError);
  }

  const pendingMessage = safeMessagePayload(insertedMessage as { message_at: string; message_text: string; whatsapp_status: string | null });

  try {
    const n8nResult = await callN8nWebhook({ cart, messageText, operatorEmail, sentAt });

    if (!n8nResult.ok) {
      const failedStatus = "failed";

      await serviceSupabase
        .from("recovery_whatsapp_live_messages")
        .update({
          error_message: n8nResult.errorMessage.slice(0, 1000),
          updated_at: new Date().toISOString(),
          whatsapp_status: failedStatus,
        })
        .eq("id", insertedMessage.id);

      return jsonError(
        "Mensaje guardado localmente, pero n8n no pudo enviarlo.",
        502,
        "n8n",
        safeMessagePayload({ ...insertedMessage, whatsapp_status: failedStatus } as { message_at: string; message_text: string; whatsapp_status: string | null }),
      );
    }

    const { data: updatedMessage, error: updateError } = await serviceSupabase
      .from("recovery_whatsapp_live_messages")
      .update({
        n8n_execution_id: n8nResult.n8nExecutionId,
        updated_at: new Date().toISOString(),
        whatsapp_message_id: n8nResult.whatsappMessageId,
        whatsapp_status: n8nResult.whatsappStatus,
      })
      .eq("id", insertedMessage.id)
      .select("message_at,message_text,whatsapp_status")
      .single();

    if (updateError) {
      return NextResponse.json({
        message: pendingMessage,
        ok: true,
        warning: "Mensaje enviado, pero no se pudo actualizar su estado local.",
      });
    }

    return NextResponse.json({
      message: safeMessagePayload(updatedMessage as { message_at: string; message_text: string; whatsapp_status: string | null }),
      ok: true,
    });
  } catch (error) {
    const failedStatus = "failed";

    await serviceSupabase
      .from("recovery_whatsapp_live_messages")
      .update({
        error_message: shortErrorMessage(error),
        updated_at: new Date().toISOString(),
        whatsapp_status: failedStatus,
      })
      .eq("id", insertedMessage.id);

    return jsonError(
      "Mensaje guardado localmente, pero no se pudo conectar con n8n.",
      502,
      "n8n",
      safeMessagePayload({ ...insertedMessage, whatsapp_status: failedStatus } as { message_at: string; message_text: string; whatsapp_status: string | null }),
    );
  }
}
