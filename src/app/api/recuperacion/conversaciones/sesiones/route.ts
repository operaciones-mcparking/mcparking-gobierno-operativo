import { NextResponse, type NextRequest } from "next/server";

import { getRecoveryConversationSessionPage } from "@/lib/recuperacion/recovery-conversation-sessions";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function integerParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("No autenticado.", 401), ok: false as const };

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: jsonError("No se pudo validar el acceso.", 500), ok: false as const };
  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403), ok: false as const };
  }

  return { ok: true as const, supabase };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.error;

  const page = integerParam(request.nextUrl.searchParams.get("page"), 1);
  const pageSize = integerParam(request.nextUrl.searchParams.get("pageSize"), 50);

  try {
    const result = await getRecoveryConversationSessionPage(admin.supabase, { page, pageSize });

    return NextResponse.json({ ...result, ok: true });
  } catch {
    return jsonError("No se pudieron cargar las sesiones de conversaciones.", 500);
  }
}
