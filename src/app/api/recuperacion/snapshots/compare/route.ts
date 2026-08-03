import { NextResponse, type NextRequest } from "next/server";

import {
  getRecoverySnapshotComparison,
  isValidRecoverySnapshotWeekStart,
} from "@/lib/recuperacion/recovery-snapshot-comparison";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError("No se pudo validar el acceso.", 500), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403), ok: false as const };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminForApi();

  if (!auth.ok) return auth.error;

  const weekStart = request.nextUrl.searchParams.get("weekStart") ?? "";

  if (!weekStart || !isValidRecoverySnapshotWeekStart(weekStart)) {
    return jsonError("Parametro weekStart invalido.", 400);
  }

  try {
    const comparison = await getRecoverySnapshotComparison(weekStart);

    return NextResponse.json({
      comparison,
      ok: true,
    });
  } catch {
    return jsonError("No se pudo cargar la comparacion historica.", 500);
  }
}
