export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  hasExpectedActualizarDatosRunContract,
  isActualizarDatosRunId,
  mapActualizarDatosRun,
} from "@/lib/orquestador/actualizar-datos-operacionales";
import { listCompositeRunJobs } from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const { runId } = await params;
  if (!isActualizarDatosRunId(runId)) {
    return jsonError("Ejecucion compuesta no encontrada.", 404);
  }

  const jobs = await listCompositeRunJobs(runId);
  if (jobs.error) {
    return jsonError("No fue posible consultar la ejecucion compuesta.", 500);
  }

  if (jobs.data.length === 0 || !hasExpectedActualizarDatosRunContract(jobs.data)) {
    return jsonError("Ejecucion compuesta no encontrada.", 404);
  }

  return NextResponse.json({
    ok: true,
    run: mapActualizarDatosRun(jobs.data, runId),
  });
}
