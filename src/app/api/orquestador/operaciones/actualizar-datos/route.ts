export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  ACTUALIZAR_DATOS_OPERACIONALES_KIND,
  ACTUALIZAR_DATOS_STEPS,
  OPERACIONES_SEQUENCE_TOTAL,
  OPERACIONES_TARGET_WORKER_ID,
  actualizarDatosReadinessMessage,
  getActualizarDatosReadiness,
  mapActualizarDatosRun,
  type ActualizarDatosReadinessCode,
} from "@/lib/orquestador/actualizar-datos-operacionales";
import {
  createCompositeJobStep,
  listOrchestratorJobsForGuard,
  listOrchestratorJobTypes,
  listOrchestratorWorkers,
} from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function publicReadinessError(code: ActualizarDatosReadinessCode) {
  return jsonError(actualizarDatosReadinessMessage(code), code === "job_type_missing" ? 404 : 409);
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
    return { code: "job_type_missing" as const, ok: false };
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
  if (!firstCheck.ok) {
    return publicReadinessError(firstCheck.code);
  }

  const secondCheck = await loadReadiness();
  if (!secondCheck.ok) {
    return publicReadinessError(secondCheck.code);
  }

  const runId = randomUUID();
  const firstStep = ACTUALIZAR_DATOS_STEPS[0];
  const { data, error } = await createCompositeJobStep({
    compositeKind: ACTUALIZAR_DATOS_OPERACIONALES_KIND,
    compositeRunId: runId,
    requestedBy: admin.user.id,
    sequenceTotal: OPERACIONES_SEQUENCE_TOTAL,
    step: firstStep,
  });

  if (error || !data) {
    return jsonError("No fue posible iniciar la actualizacion de datos operacionales.", 500);
  }

  return NextResponse.json(
    {
      ok: true,
      run: mapActualizarDatosRun([data], runId),
    },
    { status: 201 },
  );
}
