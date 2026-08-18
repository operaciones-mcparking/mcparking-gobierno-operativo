import { NextResponse } from "next/server";

import { canUseStructurePermission, structurePermissions } from "@/lib/auth/access";
import { getProcessMasterReadModel } from "@/lib/procesos/process-master-read-model";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type RouteContext = {
  params: Promise<{ processId: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const { processId } = await context.params;
  if (!uuidPattern.test(processId)) return jsonError("Identificador de proceso invalido.", 400);

  const supabase = await createSupabaseAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("No autenticado.", 401);

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || !profile || profile.status !== "active") {
    return jsonError("No autorizado.", 403);
  }
  if (!(await canUseStructurePermission(structurePermissions.view))) {
    return jsonError("No autorizado.", 403);
  }

  const result = await getProcessMasterReadModel(processId);
  if (!result.data) return jsonError("Proceso no encontrado.", 404);
  if (result.error) return jsonError("No se pudo cargar la ficha del proceso.", 500);

  return NextResponse.json(
    { data: result.data },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}