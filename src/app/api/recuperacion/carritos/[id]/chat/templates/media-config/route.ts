import { NextResponse, type NextRequest } from "next/server";

import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";
import { fetchMetaWhatsappTemplatesForBusiness } from "@/lib/recuperacion/meta-whatsapp-templates";
import { getWhatsappFreeformWindowForCart, type RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import { validateRecoveryWhatsappTemplateMediaSelection } from "@/lib/recuperacion/whatsapp-template-media-library";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type MediaConfigRequest = {
  language?: unknown;
  media?: unknown;
  template_name?: unknown;
};

type CartTemplateSourceRow = {
  booking_id: string | null;
  cms_url: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
};

const ALLOWED_PAYLOAD_KEYS = new Set(["language", "media", "template_name"]);

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOnlyAllowedPayloadKeys(value: MediaConfigRequest) {
  return Object.keys(value).every((key) => ALLOWED_PAYLOAD_KEYS.has(key));
}

function isSupportedBusinessKey(value: unknown): value is RecoveryWhatsappBusinessKey {
  return value === "MPV" || value === "EAP";
}

function driveFileIdFromUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== "drive.google.com") return null;
    const queryId = url.searchParams.get("id")?.trim();
    if (queryId) return queryId;
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    return fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : null;
  } catch {
    return null;
  }
}

function mediaPreviewUrl(cartId: string, driveFileId: string | null) {
  return driveFileId
    ? `/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/templates/media-library/${encodeURIComponent(driveFileId)}/preview`
    : null;
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("No autenticado.", 401, "auth_required"), ok: false as const };

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo validar el acceso.", 500, "auth_check_failed"), ok: false as const };
  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403, "forbidden"), ok: false as const };
  }

  return { ok: true as const, supabase };
}

async function resolveBusiness(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  cartId: string,
) {
  const { data, error } = await supabase
    .from("v_recovery_incomplete_bookings_current_compat")
    .select("id,booking_id,phone_normalized,parking_code,cms_url")
    .eq("id", cartId)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo cargar el carrito solicitado.", 500, "cart_load_failed"), ok: false as const };
  if (!data) return { error: jsonError("Carrito no encontrado.", 404, "cart_not_found"), ok: false as const };

  const cart = data as CartTemplateSourceRow;
  const commercialParking = resolveRecoveryCommercialParking({
    cmsUrl: cart.cms_url,
    parkingCode: cart.parking_code,
  });

  if (!cart.phone_normalized) {
    return { error: jsonError("El carrito no tiene telefono normalizado.", 409, "business_key_unverifiable"), ok: false as const };
  }

  const windowState = await getWhatsappFreeformWindowForCart(supabase, cart.id, Date.now(), {
    bookingId: cart.booking_id,
    parkingBusinessKey: isSupportedBusinessKey(commercialParking.parkingCode) ? commercialParking.parkingCode : null,
    phoneNormalized: cart.phone_normalized,
  });

  if (windowState.status === "unverifiable" || !isSupportedBusinessKey(windowState.businessKey)) {
    return { error: jsonError("No fue posible verificar el negocio de la conversacion de WhatsApp.", 409, "business_key_unverifiable"), ok: false as const };
  }

  return { businessKey: windowState.businessKey, ok: true as const };
}

async function parseRequest(request: NextRequest) {
  let payload: MediaConfigRequest;

  try {
    payload = (await request.json()) as MediaConfigRequest;
  } catch {
    return { error: jsonError("Solicitud invalida.", 400, "invalid_json"), ok: false as const };
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !hasOnlyAllowedPayloadKeys(payload)) {
    return { error: jsonError("Solicitud invalida.", 400, "unknown_payload_field"), ok: false as const };
  }

  const templateName = safeText(payload.template_name);
  const language = safeText(payload.language);

  if (!templateName || !language) {
    return { error: jsonError("Debes indicar una plantilla e idioma validos.", 400, "invalid_template_identity"), ok: false as const };
  }

  return { language, media: payload.media, ok: true as const, templateName };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) return admin.error;

  const { id } = await context.params;
  const cartId = id.trim();
  if (!cartId) return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");

  const business = await resolveBusiness(admin.supabase, cartId);
  if (!business.ok) return business.error;

  const parsed = await parseRequest(request);
  if (!parsed.ok) return parsed.error;

  let templates;

  try {
    templates = await fetchMetaWhatsappTemplatesForBusiness(business.businessKey);
  } catch {
    return jsonError("No se pudieron validar las plantillas de WhatsApp.", 500, "meta_templates_unavailable");
  }

  const approvedTemplate = templates.find(
    (template) => template.name === parsed.templateName
      && template.language === parsed.language
      && template.status === "APPROVED",
  );

  if (!approvedTemplate) {
    return jsonError("La plantilla no esta aprobada o disponible para este negocio.", 409, "template_not_available");
  }

  const requiredMedia = approvedTemplate.parameters.find((parameter) => (
    parameter.component === "HEADER"
      && parameter.required
      && !parameter.needsInput
      && (parameter.type === "image" || parameter.type === "video" || parameter.type === "document")
  ));

  if (!requiredMedia) {
    return jsonError("La plantilla no requiere multimedia configurable.", 409, "template_media_not_required");
  }

  const expectedFormat = requiredMedia.type.toUpperCase() as "DOCUMENT" | "IMAGE" | "VIDEO";
  const validation = await validateRecoveryWhatsappTemplateMediaSelection(parsed.media, expectedFormat);

  if (!validation.ok) {
    return jsonError(validation.message, 400, validation.code);
  }

  const driveFileId = validation.media.source === "google_drive" ? driveFileIdFromUrl(validation.media.link) : null;

  const { error } = await admin.supabase
    .from("recovery_whatsapp_template_media_config")
    .upsert(
      {
        business_key: business.businessKey,
        component_type: "HEADER",
        drive_file_id: driveFileId,
        label: validation.media.label,
        language: parsed.language,
        media_format: validation.media.format,
        media_id: validation.media.id,
        media_source: validation.media.source,
        media_url: validation.media.link,
        template_name: parsed.templateName,
        updated_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        validation_error: null,
        validation_status: "valid",
      },
      {
        onConflict: "business_key,template_name,language,component_type",
      },
    );

  if (error) {
    return jsonError("No se pudo guardar la imagen del template.", 500, "template_media_config_save_failed");
  }

  return NextResponse.json({
    media: {
      ...validation.media,
      previewUrl: validation.media.source === "google_drive"
        ? mediaPreviewUrl(cartId, driveFileId)
        : validation.media.link,
    },
    ok: true,
  });
}
