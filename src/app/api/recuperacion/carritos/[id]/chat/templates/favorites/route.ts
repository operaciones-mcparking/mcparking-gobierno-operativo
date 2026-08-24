import { NextResponse, type NextRequest } from "next/server";

import { fetchMetaWhatsappTemplatesForBusiness } from "@/lib/recuperacion/meta-whatsapp-templates";
import { getWhatsappFreeformWindowForCart, type RecoveryWhatsappBusinessKey } from "@/lib/recuperacion/whatsapp-freeform-window";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type FavoriteRequest = {
  language?: unknown;
  template_name?: unknown;
};

const ALLOWED_PAYLOAD_KEYS = new Set(["language", "template_name"]);

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOnlyAllowedPayloadKeys(value: FavoriteRequest) {
  return Object.keys(value).every((key) => ALLOWED_PAYLOAD_KEYS.has(key));
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

function isSupportedBusinessKey(value: unknown): value is RecoveryWhatsappBusinessKey {
  return value === "MPV" || value === "EAP";
}

async function resolveBusiness(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  cartId: string,
) {
  const { data: cart, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,phone_normalized")
    .eq("id", cartId)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo cargar el carrito solicitado.", 500, "cart_load_failed"), ok: false as const };
  if (!cart) return { error: jsonError("Carrito no encontrado.", 404, "cart_not_found"), ok: false as const };
  if (!cart.phone_normalized) {
    return { error: jsonError("El carrito no tiene telefono normalizado.", 409, "business_key_unverifiable"), ok: false as const };
  }

  const windowState = await getWhatsappFreeformWindowForCart(supabase, cart.id);

  if (windowState.status === "unverifiable" || !isSupportedBusinessKey(windowState.businessKey)) {
    return {
      error: jsonError("No fue posible verificar el negocio de la conversacion de WhatsApp.", 409, "business_key_unverifiable"),
      ok: false as const,
    };
  }

  return { businessKey: windowState.businessKey, ok: true as const };
}

async function parseRequest(request: NextRequest) {
  let payload: FavoriteRequest;

  try {
    payload = (await request.json()) as FavoriteRequest;
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

  return { language, ok: true as const, templateName };
}

async function resolveRequest(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) return admin;

  const { id } = await context.params;
  const cartId = id.trim();

  if (!cartId) {
    return { error: jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id"), ok: false as const };
  }

  const business = await resolveBusiness(admin.supabase, cartId);

  if (!business.ok) return business;

  const parsed = await parseRequest(request);

  if (!parsed.ok) return parsed;

  return {
    businessKey: business.businessKey,
    language: parsed.language,
    ok: true as const,
    supabase: admin.supabase,
    templateName: parsed.templateName,
    userId: admin.userId,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const resolved = await resolveRequest(request, context);

  if (!resolved.ok) return resolved.error;

  let templates;

  try {
    templates = await fetchMetaWhatsappTemplatesForBusiness(resolved.businessKey);
  } catch {
    return jsonError("No se pudieron validar las plantillas de WhatsApp.", 500, "meta_templates_unavailable");
  }

  const approvedTemplate = templates.find(
    (template) => template.name === resolved.templateName
      && template.language === resolved.language
      && template.status === "APPROVED",
  );

  if (!approvedTemplate) {
    return jsonError("La plantilla no esta aprobada o disponible para este negocio.", 409, "template_not_available");
  }

  const { error } = await resolved.supabase
    .from("recovery_whatsapp_template_favorites")
    .upsert(
      {
        business_key: resolved.businessKey,
        language: resolved.language,
        template_name: resolved.templateName,
        user_id: resolved.userId,
      },
      {
        ignoreDuplicates: true,
        onConflict: "user_id,business_key,template_name,language",
      },
    );

  if (error) {
    return jsonError("No se pudo agregar la plantilla a Favoritas.", 500, "favorite_create_failed");
  }

  return NextResponse.json({ isFavorite: true, ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const resolved = await resolveRequest(request, context);

  if (!resolved.ok) return resolved.error;

  const { error } = await resolved.supabase
    .from("recovery_whatsapp_template_favorites")
    .delete()
    .eq("user_id", resolved.userId)
    .eq("business_key", resolved.businessKey)
    .eq("template_name", resolved.templateName)
    .eq("language", resolved.language);

  if (error) {
    return jsonError("No se pudo quitar la plantilla de Favoritas.", 500, "favorite_delete_failed");
  }

  return NextResponse.json({ isFavorite: false, ok: true });
}
