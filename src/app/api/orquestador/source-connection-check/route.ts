export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { createSourceConnectionCheckJob, getOrchestratorJobType } from "@/lib/orquestador/supabase-admin";

const sourceConnectionJobType = "source_connection_check";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function safeJobResponse(job: NonNullable<Awaited<ReturnType<typeof createSourceConnectionCheckJob>>["data"]>) {
  return {
    createdAt: job.created_at,
    id: job.id,
    jobType: job.job_type,
    status: job.status,
  };
}

export async function POST(request: NextRequest) {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  if (request.nextUrl.searchParams.size > 0) {
    return jsonError("Esta accion no acepta parametros.", 400);
  }

  const body = await request.text();
  if (body.trim().length > 0) {
    return jsonError("La solicitud no debe incluir contenido.", 400);
  }

  const jobType = await getOrchestratorJobType(sourceConnectionJobType);

  if (jobType.error) {
    return jsonError("No fue posible validar la prueba de conexion.", 500);
  }

  if (!jobType.data) {
    return jsonError("La prueba de conexion no esta registrada.", 404);
  }

  if (!jobType.data.enabled) {
    return jsonError("La prueba de conexion esta deshabilitada.", 409);
  }

  const { data, error } = await createSourceConnectionCheckJob(admin.user.id);

  if (error || !data) {
    return jsonError("No fue posible crear la prueba de conexion.", 500);
  }

  return NextResponse.json({
    job: safeJobResponse(data),
    ok: true,
  });
}