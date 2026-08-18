export const dynamic = "force-dynamic";

// Legacy compatibility: autonomous SQL advancement is authoritative.

import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  OPERACIONES_ACTIVE_JOB_STATUSES,
  OPERACIONES_SEQUENCE_TOTAL,
  OPERACIONES_TARGET_WORKER_ID,
  actualizarDatosReadinessMessage,
  getActualizarDatosReadiness,
  getLastExistingStep,
  getNextStepToCreate,
  hasExpectedActualizarDatosRunContract,
  isActualizarDatosRunId,
  mapActualizarDatosRun,
  type ActualizarDatosReadinessCode,
} from "@/lib/orquestador/actualizar-datos-operacionales";
import {
  createOperationalUpdateStepIfMissing,
  listCompositeRunJobs,
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

function hasExactRunId(value: unknown): value is { run_id: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "run_id" && typeof (value as { run_id?: unknown }).run_id === "string";
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
    return jsonError("La solicitud requiere un run_id valido.", 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonError("La solicitud requiere un run_id valido.", 400);
  }

  if (!hasExactRunId(payload) || !isActualizarDatosRunId(payload.run_id)) {
    return jsonError("La solicitud requiere un run_id valido.", 400);
  }

  const runId = payload.run_id;
  const existing = await listCompositeRunJobs(runId);

  if (existing.error) {
    return jsonError("No fue posible consultar la ejecucion compuesta.", 500);
  }

  if (existing.data.length === 0) {
    return jsonError("Ejecucion compuesta no encontrada.", 404);
  }

  if (!hasExpectedActualizarDatosRunContract(existing.data)) {
    return jsonError("Ejecucion compuesta no encontrada.", 404);
  }

  const lastStep = getLastExistingStep(existing.data);
  if (!lastStep || OPERACIONES_ACTIVE_JOB_STATUSES.has(lastStep.status) || lastStep.status === "failed" || lastStep.status === "cancelled" || lastStep.sequence_index >= OPERACIONES_SEQUENCE_TOTAL) {
    return NextResponse.json({
      ok: true,
      run: mapActualizarDatosRun(existing.data, runId),
    });
  }

  const nextStep = getNextStepToCreate(existing.data);
  if (!nextStep) {
    return NextResponse.json({
      ok: true,
      run: mapActualizarDatosRun(existing.data, runId),
    });
  }

  const firstCheck = await loadReadiness();
  if (!firstCheck.ok) {
    return publicReadinessError(firstCheck.code);
  }

  const secondCheck = await loadReadiness();
  if (!secondCheck.ok) {
    return publicReadinessError(secondCheck.code);
  }

  const created = await createOperationalUpdateStepIfMissing({
    compositeRunId: runId,
    requestedBy: admin.user.id,
    step: nextStep,
  });

  if (created.error || !created.data || created.data.rows.length === 0) {
    return jsonError("No fue posible avanzar la ejecucion compuesta.", 500);
  }

  const rowsByStep = new Map(existing.data.map((row) => [row.sequence_index, row]));
  for (const row of created.data.rows) {
    rowsByStep.set(row.sequence_index, row);
  }

  return NextResponse.json(
    {
      ok: true,
      run: mapActualizarDatosRun([...rowsByStep.values()], runId),
    },
    { status: created.data.created ? 201 : 200 },
  );
}
