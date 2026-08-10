export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { hasExpectedActualizarDatosRunContract, mapActualizarDatosRun } from "@/lib/orquestador/actualizar-datos-operacionales";
import { findActiveOperationalUpdateRunJobs } from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET() {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const active = await findActiveOperationalUpdateRunJobs();
  if (active.error) {
    return jsonError("No fue posible consultar la actualizacion operacional activa.", 500);
  }

  if (active.data.length === 0) {
    return NextResponse.json({ active: false, ok: true });
  }

  if (!hasExpectedActualizarDatosRunContract(active.data)) {
    return jsonError("No fue posible consultar la actualizacion operacional activa.", 500);
  }

  const runId = active.data[0].composite_run_id;
  return NextResponse.json({
    active: true,
    ok: true,
    run: mapActualizarDatosRun(active.data, runId),
  });
}
