import { NextResponse, type NextRequest } from "next/server";

import { validateRecoveryWhatsappTemplateMediaSelection } from "@/lib/recuperacion/whatsapp-template-media-library";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ code, error: message, ok: false }, { status });
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

  return { ok: true as const };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminForApi();

  if (!admin.ok) return admin.error;

  const { id } = await context.params;
  if (!id.trim()) return jsonError("Debes indicar un carrito valido.", 400, "invalid_cart_id");

  let payload: { expectedFormat?: unknown; media?: unknown };

  try {
    payload = (await request.json()) as { expectedFormat?: unknown; media?: unknown };
  } catch {
    return jsonError("Debes enviar JSON valido.", 400, "invalid_payload");
  }

  const expectedFormat = typeof payload.expectedFormat === "string" ? payload.expectedFormat.trim().toUpperCase() : "";
  if (expectedFormat !== "IMAGE" && expectedFormat !== "VIDEO" && expectedFormat !== "DOCUMENT") {
    return jsonError("Debes indicar el formato multimedia esperado.", 400, "invalid_media_format");
  }

  const validation = await validateRecoveryWhatsappTemplateMediaSelection(payload.media, expectedFormat);

  if (!validation.ok) {
    return jsonError(validation.message, 400, validation.code);
  }

  const previewUrl = validation.media.source === "google_drive"
    ? mediaPreviewUrl(id.trim(), driveFileIdFromUrl(validation.media.link))
    : validation.media.link;

  return NextResponse.json({
    media: {
      ...validation.media,
      previewUrl,
    },
    ok: true,
  });
}
