import { NextResponse, type NextRequest } from "next/server";

import { resolveRecoveryCommercialParking } from "@/lib/recuperacion/commercial-parking";
import { fetchMetaWhatsappTemplatesForBusiness } from "@/lib/recuperacion/meta-whatsapp-templates";
import { getWhatsappFreeformWindowForCart, type RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import { decorateRecoveryTemplateForBusiness } from "@/lib/recuperacion/whatsapp-recovery-template-catalog";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CartTemplateSourceRow = {
  booking_id: string | null;
  cms_url: string | null;
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
};

type TemplateMediaConfigRow = {
  business_key: string;
  component_type: string;
  drive_file_id: string | null;
  label: string | null;
  language: string;
  media_format: "DOCUMENT" | "IMAGE" | "VIDEO";
  media_id: string | null;
  media_source: "google_drive" | "https_url" | "meta_media_id";
  media_url: string | null;
  template_name: string;
  validation_error: string | null;
  validation_status: "valid" | "invalid";
};

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
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

  return { ok: true as const, supabase, userId: user.id };
}

function businessLabel(businessKey: RecoveryWhatsappBusinessKey) {
  return businessKey === "MPV" ? "MPV" : "EAP";
}

function isSupportedBusinessKey(value: unknown): value is RecoveryWhatsappBusinessKey {
  return value === "MPV" || value === "EAP";
}

function mediaPreviewUrl(cartId: string, driveFileId: string | null) {
  return driveFileId
    ? `/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/templates/media-library/${encodeURIComponent(driveFileId)}/preview`
    : null;
}

async function loadCart(supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, cartId: string) {
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

  return {
    cart: {
      ...cart,
      parking_code: commercialParking.parkingCode,
    },
    ok: true as const,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const { id } = await context.params;
  const cartId = id.trim();

  if (!cartId) {
    return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");
  }

  const cartResult = await loadCart(admin.supabase, cartId);

  if (!cartResult.ok) {
    return cartResult.error;
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

  try {
    const metaTemplates = await fetchMetaWhatsappTemplatesForBusiness(businessKey);
    const { data: favoriteRows, error: favoritesError } = await admin.supabase
      .from("recovery_whatsapp_template_favorites")
      .select("template_name,language")
      .eq("user_id", admin.userId)
      .eq("business_key", businessKey);

    if (favoritesError) {
      return jsonError("No se pudieron cargar las plantillas favoritas.", 500, "template_favorites_load_failed");
    }

    const favoriteKeys = new Set(
      (favoriteRows ?? []).map((favorite) => favorite.template_name + ":" + favorite.language),
    );
    const { data: mediaConfigRows, error: mediaConfigError } = await admin.supabase
      .from("recovery_whatsapp_template_media_config")
      .select("business_key,template_name,language,component_type,media_format,media_source,drive_file_id,media_url,media_id,label,validation_status,validation_error")
      .eq("business_key", businessKey)
      .eq("component_type", "HEADER");

    const mediaConfigByKey = new Map<string, TemplateMediaConfigRow>();

    if (!mediaConfigError) {
      for (const row of (mediaConfigRows ?? []) as TemplateMediaConfigRow[]) {
        mediaConfigByKey.set(`${row.template_name}:${row.language}`, row);
      }
    }

    const templates = metaTemplates
      .map((template) => decorateRecoveryTemplateForBusiness(businessKey, template))
      .map((template) => {
        const savedMedia = mediaConfigByKey.get(template.key) ?? null;
        const validSavedMedia = savedMedia?.validation_status === "valid" ? savedMedia : null;

        return {
          category: template.category,
          compatibility: validSavedMedia && template.compatibility.status === "blocked"
            ? { reasons: [], status: "supported" as const }
            : template.compatibility,
          isFavorite: favoriteKeys.has(template.key),
          key: template.key,
          label: template.label,
          language: template.language,
          mediaSelection: validSavedMedia
            ? {
                format: validSavedMedia.media_format,
                id: validSavedMedia.media_id,
                label: validSavedMedia.label,
                link: validSavedMedia.media_url,
                previewUrl: validSavedMedia.media_source === "google_drive"
                  ? mediaPreviewUrl(cartId, validSavedMedia.drive_file_id)
                  : validSavedMedia.media_url,
                source: validSavedMedia.media_source,
              }
            : null,
          name: template.name,
          parameterFormat: template.parameterFormat,
          parameters: template.parameters,
          preview: template.preview,
          media: {
            configured: Boolean(template.sendMedia || validSavedMedia),
            format: validSavedMedia?.media_format ?? template.preview.previewMedia?.format ?? template.sendMedia?.format ?? null,
            previewOnly: Boolean(template.preview.previewMedia) && !template.sendMedia && !validSavedMedia,
            required: template.parameters.some((parameter) => (
              parameter.component === "HEADER"
                && parameter.required
                && !parameter.needsInput
                && (parameter.type === "image" || parameter.type === "video" || parameter.type === "document")
            )),
            source: validSavedMedia?.media_source ?? template.sendMedia?.source ?? null,
            validationError: savedMedia?.validation_status === "invalid" ? savedMedia.validation_error : null,
          },
          status: template.status,
          variables: template.variables,
        };
      });

    return NextResponse.json({
      business: {
        key: businessKey,
        label: businessLabel(businessKey),
      },
      ok: true,
      templates,
    });
  } catch {
    return jsonError("No se pudieron cargar templates de WhatsApp.", 500, "meta_templates_unavailable");
  }
}
