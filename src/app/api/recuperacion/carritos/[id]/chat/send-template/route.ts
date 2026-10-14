import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { fetchMetaWhatsappTemplatesForBusiness, type SafeMetaWhatsappTemplate } from "@/lib/recuperacion/meta-whatsapp-templates";
import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";
import {
  buildRecoveryWhatsappTemplateN8nPayload,
  buildRecoveryWhatsappTemplateN8nPayloadPreview,
} from "@/lib/recuperacion/whatsapp-template-n8n-payload";
import {
  sendRecoveryWhatsappTemplateViaN8n,
  type RecoveryWhatsappTemplateN8nSendFailure,
} from "@/lib/recuperacion/whatsapp-template-n8n-transport";
import { buildRecoveryWhatsappMetaTemplatePayload, buildRecoveryWhatsappMetaTemplatePayloadPreview } from "@/lib/recuperacion/whatsapp-template-send-payload";
import { getWhatsappFreeformWindowForCart, type RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import {
  validateRecoveryWhatsappTemplateMediaSelection,
  type RecoveryWhatsappTemplateSelectedMedia,
} from "@/lib/recuperacion/whatsapp-template-media-library";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CartTemplateSendDryRunRow = {
  booking_id: string | null;
  cms_url: string | null;
  email_normalized: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
  type: string | null;
};

type SafeSentTemplateMessage = {
  chatState: string | null;
  dayOfWeek: string | null;
  direction: "outbound";
  intentCategory: string | null;
  label: string;
  messageAt: string;
  messageBoundType: string;
  messageSentiment: string | null;
  messageSource: string;
  messageText: string;
  messageType: string;
  source: "live";
  sourceMessageId: string | null;
  timeOfDay: string | null;
  whatsappMessageId: string | null;
  whatsappStatus: string | null;
};

type SendTemplateDryRunRequest = {
  dryRun?: unknown;
  language?: unknown;
  media?: unknown;
  templateKey?: unknown;
  variables?: unknown;
};

type TemplateVariableValue = {
  component: "BODY" | "HEADER";
  parameterName: string | null;
  placeholder: string;
  position: number;
  text: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEMPLATE_VARIABLE_LENGTH = 500;
const TEMPLATE_SEND_UNCONFIRMED_STATUS = "unconfirmed";
const ALLOWED_DRY_RUN_PAYLOAD_KEYS = new Set(["dryRun", "language", "media", "templateKey", "variables"]);
const FORBIDDEN_DRY_RUN_PAYLOAD_KEYS = new Set([
  "accessToken",
  "businessKey",
  "components",
  "graphPayload",
  "metaPayload",
  "mode",
  "n8nPayload",
  "n8nTransportPayload",
  "operatorEmail",
  "parking",
  "phone",
  "phone_number_id",
  "previewText",
  "secreto",
  "senderKey",
  "sentAt",
  "source",
  "telefono_usuario",
  "templateName",
  "webhookUrl",
]);
function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
}

function hasOnlyAllowedPayloadKeys(value: SendTemplateDryRunRequest) {
  return Object.keys(value as Record<string, unknown>).every(
    (key) => ALLOWED_DRY_RUN_PAYLOAD_KEYS.has(key) && !FORBIDDEN_DRY_RUN_PAYLOAD_KEYS.has(key),
  );
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401, "auth_required"), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError("No se pudo validar el acceso.", 500, "auth_check_failed"), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403, "forbidden"), ok: false as const };
  }

  return { ok: true as const, supabase, user };
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function safeMessagePayload(message: {
  id: string | null;
  message_at: string;
  message_text: string;
  whatsapp_message_id?: string | null;
  whatsapp_status: string | null;
}): SafeSentTemplateMessage {
  return {
    chatState: null,
    dayOfWeek: null,
    direction: "outbound",
    intentCategory: null,
    label: "Nosotros / sistema",
    messageAt: message.message_at,
    messageBoundType: "outbound",
    messageSentiment: null,
    messageSource: "recovery_web_template",
    messageText: message.message_text,
    messageType: "template",
    source: "live",
    sourceMessageId: message.id,
    timeOfDay: null,
    whatsappMessageId: message.whatsapp_message_id ?? null,
    whatsappStatus: message.whatsapp_status,
  };
}

function shortErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message.slice(0, 1000);

  const text = safeString(value);

  return text ? text.slice(0, 1000) : "Error al enviar plantilla.";
}

function localStatusForN8nFailure(result: RecoveryWhatsappTemplateN8nSendFailure) {
  return result.outcome === "ambiguous" ? TEMPLATE_SEND_UNCONFIRMED_STATUS : "failed";
}

function publicErrorForN8nFailure(result: RecoveryWhatsappTemplateN8nSendFailure) {
  return result.outcome === "ambiguous"
    ? "No fue posible confirmar si la plantilla fue enviada. No reintentes automaticamente; requiere reconciliacion."
    : "No se pudo enviar la plantilla de WhatsApp.";
}

function isSupportedBusinessKey(value: unknown): value is RecoveryWhatsappBusinessKey {
  return value === "MPV" || value === "EAP";
}

function maskPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 6) return null;

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

async function loadCart(supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, cartId: string) {
  const { data, error } = await supabase
    .from("v_recovery_incomplete_bookings_current_compat")
    .select("id,booking_id,phone_normalized,email_normalized,type,parking_code,cms_url")
    .eq("id", cartId)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo cargar el carrito solicitado.", 500, "cart_load_failed"), ok: false as const };
  if (!data) return { error: jsonError("Carrito no encontrado.", 404, "cart_not_found"), ok: false as const };

  const cart = data as CartTemplateSendDryRunRow;
  const commercialParking = resolveRecoveryCommercialParking({
    cmsUrl: cart.cms_url,
    parkingCode: cart.parking_code,
  });

  return {
    cart: {
      ...cart,
      parking_code: commercialParking.parkingCode,
    },
    ok: true as const,
  };
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
    return { error: jsonError("No se pudo resolver la identidad legacy del carrito.", 500, "cart_identity_failed"), ok: false as const };
  }

  if ((data ?? []).length > 1) {
    return { error: jsonError("Identidad legacy ambigua para el carrito.", 409, "cart_identity_conflict"), ok: false as const };
  }

  return { legacyCartId: data?.[0]?.id ?? null, ok: true as const };
}

function findTemplate(templates: SafeMetaWhatsappTemplate[], templateKey: string, language: string) {
  return templates.find((template) => (template.key === templateKey || template.name === templateKey) && template.language === language) ?? null;
}

function blockedOnlyByMissingMedia(template: SafeMetaWhatsappTemplate) {
  return template.compatibility.status === "blocked"
    && template.compatibility.reasons.length > 0
    && template.compatibility.reasons.every((reason) => reason.toLowerCase().includes("requiere") && reason.toLowerCase().includes("para enviarse"));
}

function inputKeysForTemplateParameter(parameter: SafeMetaWhatsappTemplate["parameters"][number]) {
  const keys = new Set([parameter.id, parameter.placeholder]);

  if (parameter.component === "BODY" && parameter.position) {
    keys.add(String(parameter.position));
    keys.add(`{{${parameter.position}}}`);
  }

  if (parameter.name) {
    keys.add(parameter.name);
    keys.add(`{{${parameter.name}}}`);
  }

  return keys;
}

function validateTemplateVariables(template: SafeMetaWhatsappTemplate, value: unknown) {
  const expectedParameters = template.parameters.filter((parameter) => parameter.needsInput && parameter.required);

  if (expectedParameters.length === 0) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length > 0) {
      return { error: jsonError("Esta plantilla no acepta variables.", 400, "unknown_variable"), ok: false as const };
    }

    return { ok: true as const, variables: [] as TemplateVariableValue[] };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: jsonError("Debes enviar variables como objeto.", 400, "invalid_variables"), ok: false as const };
  }

  const expectedByInputKey = new Map<string, SafeMetaWhatsappTemplate["parameters"][number]>();

  for (const parameter of expectedParameters) {
    if (!parameter.supported || parameter.type !== "text" || (parameter.component !== "BODY" && parameter.component !== "HEADER")) {
      return { error: jsonError("La plantilla contiene parametros no soportados.", 409, "unsupported_template_parameters"), ok: false as const };
    }

    for (const key of inputKeysForTemplateParameter(parameter)) {
      expectedByInputKey.set(key, parameter);
    }
  }

  const normalized = new Map<string, string>();

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const parameter = expectedByInputKey.get(rawKey.trim());

    if (!parameter) {
      return { error: jsonError("La solicitud contiene variables desconocidas.", 400, "unknown_variable"), ok: false as const };
    }

    if (normalized.has(parameter.id)) {
      return { error: jsonError("La solicitud contiene variables desconocidas.", 400, "unknown_variable"), ok: false as const };
    }

    if (typeof rawValue !== "string") {
      return { error: jsonError("Todas las variables deben ser texto.", 400, "invalid_variable_value"), ok: false as const };
    }

    const text = rawValue.trim();

    if (!text) {
      return { error: jsonError("Todas las variables son obligatorias.", 400, "missing_variable"), ok: false as const };
    }

    if (text.length > MAX_TEMPLATE_VARIABLE_LENGTH) {
      return { error: jsonError("Una variable supera el largo maximo permitido.", 400, "variable_too_long"), ok: false as const };
    }

    normalized.set(parameter.id, text);
  }

  for (const parameter of expectedParameters) {
    if (!normalized.has(parameter.id)) {
      return { error: jsonError("Faltan variables obligatorias.", 400, "missing_variable"), ok: false as const };
    }
  }

  return {
    ok: true as const,
    variables: expectedParameters
      .filter((parameter) => parameter.type === "text" && (parameter.component === "BODY" || parameter.component === "HEADER"))
      .map((parameter, index) => ({
        component: parameter.component as "BODY" | "HEADER",
        parameterName: parameter.name,
        placeholder: parameter.placeholder,
        position: parameter.position ?? index + 1,
        text: normalized.get(parameter.id) ?? "",
      }))
      .sort((left, right) => {
        if (left.component !== right.component) return left.component === "HEADER" ? -1 : 1;

        return left.position - right.position;
      }),
  };
}

function renderPreviewText(value: string | null, variables: TemplateVariableValue[]) {
  if (!value) return null;

  const valuesByPlaceholder = new Map<string, string>();

  for (const variable of variables) {
    valuesByPlaceholder.set(`{{${variable.position}}}`, variable.text);
    valuesByPlaceholder.set(variable.placeholder, variable.text);
    if (variable.parameterName) valuesByPlaceholder.set(`{{${variable.parameterName}}}`, variable.text);
  }

  return value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/g, (placeholder, key) => valuesByPlaceholder.get(`{{${key}}}`) ?? placeholder);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const { id } = await context.params;
  const cartId = id.trim();

  if (!UUID_RE.test(cartId)) {
    return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");
  }

  let payload: SendTemplateDryRunRequest;

  try {
    payload = (await request.json()) as SendTemplateDryRunRequest;
  } catch {
    return jsonError("Debes enviar JSON valido.", 400, "invalid_payload");
  }

  if (!hasOnlyAllowedPayloadKeys(payload)) {
    return jsonError("La solicitud contiene campos no permitidos.", 400, "unknown_payload_field");
  }

  if (typeof payload.dryRun !== "boolean") {
    return jsonError("Debes indicar si la operacion es dry-run.", 400, "dry_run_required");
  }

  const templateKey = safeString(payload.templateKey);
  const language = safeString(payload.language);

  if (!templateKey || !language) {
    return jsonError("Debes indicar plantilla e idioma.", 400, "invalid_template");
  }

  const cartResult = await loadCart(admin.supabase, cartId);

  if (!cartResult.ok) {
    return cartResult.error;
  }

  const legacyIdentity = await resolveLegacyCartIdByBookingId(admin.supabase, cartResult.cart.booking_id);

  if (!legacyIdentity.ok) {
    return legacyIdentity.error;
  }

  if (!cartResult.cart.phone_normalized) {
    return jsonError("El carrito no tiene telefono normalizado.", 409, "business_key_unverifiable");
  }

  const windowState = await getWhatsappFreeformWindowForCart(admin.supabase, cartResult.cart.id, Date.now(), {
    bookingId: cartResult.cart.booking_id,
    parkingBusinessKey: isSupportedBusinessKey(cartResult.cart.parking_code) ? cartResult.cart.parking_code : null,
    phoneNormalized: cartResult.cart.phone_normalized,
  });

  if (windowState.status === "unverifiable" || !isSupportedBusinessKey(windowState.businessKey)) {
    return jsonError("No fue posible verificar el negocio de la conversacion de WhatsApp.", 409, "business_key_unverifiable");
  }

  const businessKey = windowState.businessKey;
  let templates: SafeMetaWhatsappTemplate[];

  try {
    templates = await fetchMetaWhatsappTemplatesForBusiness(businessKey);
  } catch {
    return jsonError("No se pudieron validar templates de WhatsApp.", 500, "meta_templates_unavailable");
  }

  const template = findTemplate(templates, templateKey, language);

  if (!template) {
    return jsonError("La plantilla seleccionada no esta disponible para esta conversacion.", 409, "template_not_allowed");
  }

  if (template.status !== "APPROVED") {
    return jsonError("La plantilla seleccionada no esta aprobada.", 409, "template_not_approved");
  }

  const requiredMedia = template.parameters.find((parameter) => (
    parameter.component === "HEADER"
      && parameter.required
      && !parameter.needsInput
      && (parameter.type === "image" || parameter.type === "video" || parameter.type === "document")
  ));
  const selectedMedia = payload.media === undefined ? null : payload.media;
  let effectiveHeaderMedia: RecoveryWhatsappTemplateSelectedMedia | null = template.sendMedia
    ? {
        format: template.sendMedia.format,
        id: template.sendMedia.id,
        link: template.sendMedia.link,
        source: template.sendMedia.source,
      }
    : null;

  if (requiredMedia && selectedMedia !== null) {
    const format = requiredMedia.type.toUpperCase() as "DOCUMENT" | "IMAGE" | "VIDEO";
    const validation = await validateRecoveryWhatsappTemplateMediaSelection(selectedMedia, format);

    if (!validation.ok) {
      return jsonError(validation.message, 400, validation.code);
    }

    effectiveHeaderMedia = validation.media;
  }

  if (template.compatibility.status !== "supported" && !(effectiveHeaderMedia && blockedOnlyByMissingMedia(template))) {
    return jsonError("La plantilla contiene componentes no soportados en esta etapa.", 409, "unsupported_template_components");
  }

  if (requiredMedia && !effectiveHeaderMedia) {
    return jsonError("Este template requiere multimedia configurada para enviarse.", 409, "template_media_required");
  }

  const variablesResult = validateTemplateVariables(template, payload.variables);

  if (!variablesResult.ok) {
    return variablesResult.error;
  }

  const metaPayload = buildRecoveryWhatsappMetaTemplatePayload({
    headerMedia: effectiveHeaderMedia
      ? {
          format: effectiveHeaderMedia.format,
          id: effectiveHeaderMedia.id,
          link: effectiveHeaderMedia.link,
        }
      : null,
    language: template.language,
    templateName: template.name,
    to: cartResult.cart.phone_normalized,
    variables: variablesResult.variables,
  });
  const metaPayloadPreview = buildRecoveryWhatsappMetaTemplatePayloadPreview(metaPayload, maskPhone(cartResult.cart.phone_normalized));
  const previewBody = renderPreviewText(template.preview.body, variablesResult.variables);
  const n8nTransportPayload = buildRecoveryWhatsappTemplateN8nPayload({
    cartId: cartResult.cart.id,
    cartType: cartResult.cart.type,
    metaPayload,
    operatorEmail: admin.user.email ?? "",
    previewText: previewBody ?? "",
    senderKey: businessKey,
    sentAt: new Date().toISOString(),
  });
  const n8nTransportPreview = buildRecoveryWhatsappTemplateN8nPayloadPreview(
    n8nTransportPayload,
    maskPhone(cartResult.cart.phone_normalized),
  );
  const n8nPayloadPreview = {
    components: metaPayload.template.components,
    language: template.language,
    mode: "template" as const,
    source: "recovery_web" as const,
    templateName: template.name,
  };

  if (payload.dryRun) {
    return NextResponse.json({
      dryRun: true,
      metaPayloadPreview,
      n8nPayloadPreview,
      n8nTransportPreview,
      ok: true,
      senderKey: businessKey,
      preview: {
        body: previewBody,
        buttons: template.preview.buttons,
        footer: template.preview.footer,
        header: template.preview.header,
        headerMedia: template.preview.headerMedia,
        previewMedia: effectiveHeaderMedia?.link
          ? {
              format: effectiveHeaderMedia.format,
              link: effectiveHeaderMedia.link,
              source: "selected_media" as const,
            }
          : template.preview.previewMedia,
      },
      validation: {
        businessKey,
        cartType: cartResult.cart.type,
        language: template.language,
        maskedPhone: maskPhone(cartResult.cart.phone_normalized),
        parameterCount: template.parameters.length,
        templateName: template.name,
        variableCount: variablesResult.variables.length,
      },
    });
  }

  let serviceSupabase: ReturnType<typeof createServiceRoleClient>;

  try {
    serviceSupabase = createServiceRoleClient();
  } catch {
    return jsonError("No se pudo inicializar el servicio de envio.", 500, "service_role_unavailable");
  }

  const sentAt = n8nTransportPayload.sentAt;
  const messageText = previewBody ?? template.label;
  const { data: insertedMessage, error: insertError } = await serviceSupabase
    .from("recovery_whatsapp_live_messages")
    .insert({
      cart_id: legacyIdentity.legacyCartId,
      cart_v2_id: cartResult.cart.id,
      direction: "outbound",
      email_normalized: cartResult.cart.email_normalized,
      message_at: sentAt,
      message_text: messageText,
      phone_normalized: cartResult.cart.phone_normalized,
      sent_by: admin.user.id,
      sent_by_email: admin.user.email ?? null,
      source: "web_operator",
      whatsapp_status: "pending",
    })
    .select("id,message_at,message_text,whatsapp_message_id,whatsapp_status")
    .single();

  if (insertError || !insertedMessage) {
    return jsonError("No se pudo registrar la plantilla para envio.", 500, "message_insert_failed");
  }

  let n8nResult;

  try {
    n8nResult = await sendRecoveryWhatsappTemplateViaN8n(n8nTransportPayload);
  } catch (error) {
    const localStatus = TEMPLATE_SEND_UNCONFIRMED_STATUS;

    await serviceSupabase
      .from("recovery_whatsapp_live_messages")
      .update({
        error_message: shortErrorMessage(error),
        updated_at: new Date().toISOString(),
        whatsapp_status: localStatus,
      })
      .eq("id", insertedMessage.id);

    const safeUnconfirmedMessage = safeMessagePayload({
      ...insertedMessage,
      whatsapp_status: localStatus,
    } as {
      id: string;
      message_at: string;
      message_text: string;
      whatsapp_message_id: string | null;
      whatsapp_status: string | null;
    });

    return NextResponse.json(
      {
        code: "n8n_unhandled_exception",
        error: "No fue posible confirmar si la plantilla fue enviada. No reintentes automaticamente; requiere reconciliacion.",
        message: safeUnconfirmedMessage,
        ok: false,
        stage: "n8n",
      },
      { status: 502 },
    );
  }

  if (!n8nResult.ok) {
    const localStatus = localStatusForN8nFailure(n8nResult);

    await serviceSupabase
      .from("recovery_whatsapp_live_messages")
      .update({
        error_message: n8nResult.message.slice(0, 1000),
        updated_at: new Date().toISOString(),
        whatsapp_status: localStatus,
      })
      .eq("id", insertedMessage.id);

    const safeFailedMessage = safeMessagePayload({
      ...insertedMessage,
      whatsapp_status: localStatus,
    } as {
      id: string;
      message_at: string;
      message_text: string;
      whatsapp_message_id: string | null;
      whatsapp_status: string | null;
    });

    return NextResponse.json(
      {
        code: n8nResult.code,
        error: publicErrorForN8nFailure(n8nResult),
        message: safeFailedMessage,
        ok: false,
        stage: "n8n",
      },
      { status: n8nResult.status },
    );
  }

  const finalStatus = n8nResult.messageStatus ?? "sent";
  const { data: updatedMessage, error: updateError } = await serviceSupabase
    .from("recovery_whatsapp_live_messages")
    .update({
      updated_at: new Date().toISOString(),
      whatsapp_message_id: n8nResult.messageId,
      whatsapp_status: finalStatus,
    })
    .eq("id", insertedMessage.id)
    .select("id,message_at,message_text,whatsapp_message_id,whatsapp_status")
    .single();

  const safeMessage = safeMessagePayload(
    (updateError || !updatedMessage
      ? { ...insertedMessage, whatsapp_message_id: n8nResult.messageId, whatsapp_status: finalStatus }
      : updatedMessage) as {
      id: string;
      message_at: string;
      message_text: string;
      whatsapp_message_id: string | null;
      whatsapp_status: string | null;
    },
  );

  return NextResponse.json({
    dryRun: false,
    message: safeMessage,
    ok: true,
    ...(updateError ? { warning: "Plantilla aceptada por n8n, pero no se pudo actualizar su estado local." } : {}),
    send: {
      businessKey: n8nResult.senderKey,
      messageId: n8nResult.messageId,
      messageStatus: n8nResult.messageStatus,
      status: n8nResult.status,
    },
  });
}
