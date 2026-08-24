import { NextResponse, type NextRequest } from "next/server";

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
  id: string;
  parking_code: string | null;
  phone_normalized: string | null;
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

async function loadCart(supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, cartId: string) {
  const { data, error } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,phone_normalized,parking_code")
    .eq("id", cartId)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo cargar el carrito solicitado.", 500, "cart_load_failed"), ok: false as const };
  if (!data) return { error: jsonError("Carrito no encontrado.", 404, "cart_not_found"), ok: false as const };

  return { cart: data as CartTemplateSourceRow, ok: true as const };
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

  const windowState = await getWhatsappFreeformWindowForCart(admin.supabase, cartResult.cart.id);

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
    const templates = metaTemplates
      .map((template) => decorateRecoveryTemplateForBusiness(businessKey, template))
      .map((template) => ({
        category: template.category,
        isFavorite: favoriteKeys.has(template.key),
        key: template.key,
        label: template.label,
        language: template.language,
        name: template.name,
        preview: template.preview,
        status: template.status,
        variables: template.variables,
      }));

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
