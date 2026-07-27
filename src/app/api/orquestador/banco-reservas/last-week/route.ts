export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  BANCO_RESERVAS_LAST_WEEK_JOB_TYPE,
  BANCO_RESERVAS_TARGET_WORKER_ID,
  getBancoReservasReadiness,
  type BancoReservasReadinessCode,
} from "@/lib/orquestador/banco-reservas-last-week";
import {
  createBancoReservasLastWeekJob,
  listOrchestratorJobsForGuard,
  listOrchestratorJobTypes,
  listOrchestratorWorkers,
} from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function publicReadinessError(code: BancoReservasReadinessCode) {
  if (code === "job_type_disabled") {
    return jsonError("La actualizacion del Banco de Reservas esta deshabilitada.", 409);
  }

  if (code === "worker_missing" || code === "worker_offline") {
    return jsonError("El worker no esta disponible para ejecutar la actualizacion.", 409);
  }

  if (code === "worker_busy") {
    return jsonError("El worker esta ocupado.", 409);
  }

  if (code === "active_queue") {
    return jsonError("Existe otra operacion activa en el orquestador.", 409);
  }

  return jsonError("No fue posible iniciar la actualizacion del Banco de Reservas.", code === "job_type_missing" ? 404 : 500);
}

function safeJobResponse(job: NonNullable<Awaited<ReturnType<typeof createBancoReservasLastWeekJob>>["data"]>) {
  return {
    id: job.id,
    job_type: job.job_type,
    status: job.status,
  };
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

  return getBancoReservasReadiness({
    jobType: jobTypes.data.find((jobType) => jobType.job_type === BANCO_RESERVAS_LAST_WEEK_JOB_TYPE),
    jobs: jobs.data,
    worker: workers.data.find((worker) => worker.worker_id === BANCO_RESERVAS_TARGET_WORKER_ID),
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

  const { data, error } = await createBancoReservasLastWeekJob(admin.user.id);

  if (error || !data) {
    return jsonError("No fue posible iniciar la actualizacion del Banco de Reservas.", 500);
  }

  return NextResponse.json({
    job: safeJobResponse(data),
    ok: true,
  });
}