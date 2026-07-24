export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { createWorkerHealthCheckJob } from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function safeJobResponse(job: NonNullable<Awaited<ReturnType<typeof createWorkerHealthCheckJob>>["data"]>) {
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

  const { data, error } = await createWorkerHealthCheckJob(admin.user.id);

  if (error || !data) {
    return jsonError("No fue posible crear la prueba del worker.", 500);
  }

  return NextResponse.json({
    job: safeJobResponse(data),
    ok: true,
  });
}