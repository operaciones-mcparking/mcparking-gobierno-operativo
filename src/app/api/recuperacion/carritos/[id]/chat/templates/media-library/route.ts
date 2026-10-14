import { NextResponse, type NextRequest } from "next/server";

import { listRecoveryWhatsappTemplateMediaLibrary } from "@/lib/recuperacion/whatsapp-template-media-library";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
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

  return { ok: true as const };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) return admin.error;

  const { id } = await context.params;
  const cartId = id.trim();
  if (!cartId) return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");

  return NextResponse.json({
    folderId: "1vEGvf5_SVamZek5xQ2FlfCMcatzQSxW9",
    items: listRecoveryWhatsappTemplateMediaLibrary().map((item) => ({
      ...item,
      previewUrl: `/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/templates/media-library/${encodeURIComponent(item.driveFileId)}/preview`,
    })),
    ok: true,
  });
}
