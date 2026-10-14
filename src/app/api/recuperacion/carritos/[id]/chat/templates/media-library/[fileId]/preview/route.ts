import { NextResponse, type NextRequest } from "next/server";

import { fetchRecoveryWhatsappTemplateDrivePreview } from "@/lib/recuperacion/whatsapp-template-media-library";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    fileId: string;
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

  const { fileId, id } = await context.params;
  if (!id.trim() || !fileId.trim()) return jsonError("Solicitud invalida.", 400, "invalid_request");

  const preview = await fetchRecoveryWhatsappTemplateDrivePreview(fileId.trim());
  if (!preview.ok) return jsonError("No se pudo cargar la miniatura.", 404, preview.code);

  return new NextResponse(preview.body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": preview.contentType,
    },
  });
}
