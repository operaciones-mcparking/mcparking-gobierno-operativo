export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  OPERACIONES_TARGET_WORKER_ID,
  actualizarDatosReadinessMessage,
  getActualizarDatosReadiness,
  mapActualizarDatosRun,
  type ActualizarDatosReadinessCode,
} from "@/lib/orquestador/actualizar-datos-operacionales";
import {
  listOrchestratorJobsForGuard,
  listOrchestratorJobTypes,
  listOrchestratorWorkers,
  startOperationalUpdateRun,
} from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ...(code ? { code } : {}), error: message, ok: false }, { status });
}

function publicReadinessError(code: ActualizarDatosReadinessCode) {
  return jsonError(actualizarDatosReadinessMessage(code), code === "job_type_missing" ? 404 : 409, code);
}

function hasExactConfirmation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "confirm" && (value as { confirm?: unknown }).confirm === true;
}

async function loadReadiness() {
  const [jobTypes, workers, jobs] = await Promise.all([
    listOrchestratorJobTypes(),
    listOrchestratorWorkers(),
    listOrchestratorJobsForGuard(),
  ]);

  if (jobTypes.error || workers.error || jobs.error) {
    return null;
  }

  return getActualizarDatosReadiness({
    jobTypes: jobTypes.data,
    jobs: jobs.data,
    worker: workers.data.find((worker) => worker.worker_id === OPERACIONES_TARGET_WORKER_ID),
  });
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
  if (body.trim().length === 0) {
    return jsonError("La solicitud requiere confirmacion explicita.", 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonError("La solicitud requiere confirmacion explicita.", 400);
  }

  if (!hasExactConfirmation(payload)) {
    return jsonError("La solicitud requiere confirmacion explicita.", 400);
  }

  const firstCheck = await loadReadiness();
  if (!firstCheck) {
    return jsonError("No fue posible validar la disponibilidad del orquestador.", 500);
  }
  if (!firstCheck.ok) {
    return publicReadinessError(firstCheck.code);
  }

  const secondCheck = await loadReadiness();
  if (!secondCheck) {
    return jsonError("No fue posible validar la disponibilidad del orquestador.", 500);
  }
  if (!secondCheck.ok) {
    return publicReadinessError(secondCheck.code);
  }

  const started = await startOperationalUpdateRun(admin.user.id);
  if (started.error || !started.data || started.data.rows.length === 0) {
    return jsonError("No fue posible iniciar la actualizacion de datos operacionales.", 500);
  }

  const runId = started.data.rows[0].composite_run_id;
  const run = mapActualizarDatosRun(started.data.rows, runId);

  if (started.data.existing && !started.data.created) {
    return NextResponse.json(
      {
        activeRunId: runId,
        code: "operational_update_already_running",
        error: "Ya existe una actualizacion operacional en curso.",
        ok: false,
        run,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      run,
    },
    { status: 201 },
  );
}
