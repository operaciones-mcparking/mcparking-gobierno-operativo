import type { OrchestratorJob, OrchestratorJobType, OrchestratorWorker } from "@/lib/orquestador/types";

export const BANCO_PACKS_UPDATE_JOB_TYPE = "banco_packs_actualizar_sin_consumos";
export const BANCO_PACKS_UPDATE_ACTION = "actualizar-packs";
export const BANCO_PACKS_TARGET_WORKER_ID = "pc_operaciones_01";
export const BANCO_PACKS_REQUESTED_SOURCE = "web_orchestrator_banco_packs_actualizar_packs";
export const BANCO_PACKS_PRIORITY = 1;
export const BANCO_PACKS_HEARTBEAT_MAX_AGE_MS = 120_000;

export const BANCO_PACKS_ACTIVE_JOB_STATUSES = new Set(["queued", "claimed", "running"]);

export type BancoPacksUpdateReadinessCode = "ready" | "job_type_disabled" | "job_type_missing" | "worker_missing" | "worker_offline" | "worker_busy" | "active_queue";

export type BancoPacksUpdateReadiness = {
  code: BancoPacksUpdateReadinessCode;
  ok: boolean;
};

export function isBancoPacksActiveJob(job: Pick<OrchestratorJob, "status">) {
  return BANCO_PACKS_ACTIVE_JOB_STATUSES.has(job.status);
}

export function isBancoPacksWorkerHeartbeatRecent(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenMs = new Date(lastSeenAt).getTime();
  return Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= BANCO_PACKS_HEARTBEAT_MAX_AGE_MS;
}

export function getBancoPacksUpdateReadiness(input: {
  jobType: OrchestratorJobType | null | undefined;
  jobs: Pick<OrchestratorJob, "status">[];
  nowMs?: number;
  worker: Pick<OrchestratorWorker, "last_seen_at" | "locked_job_id" | "status" | "worker_id"> | null | undefined;
}): BancoPacksUpdateReadiness {
  if (!input.jobType) {
    return { code: "job_type_missing", ok: false };
  }

  if (!input.jobType.enabled) {
    return { code: "job_type_disabled", ok: false };
  }

  if (!input.worker || input.worker.worker_id !== BANCO_PACKS_TARGET_WORKER_ID) {
    return { code: "worker_missing", ok: false };
  }

  if (!isBancoPacksWorkerHeartbeatRecent(input.worker.last_seen_at, input.nowMs)) {
    return { code: "worker_offline", ok: false };
  }

  if (input.worker.status !== "idle") {
    return { code: "worker_busy", ok: false };
  }

  if (input.worker.locked_job_id) {
    return { code: "worker_busy", ok: false };
  }

  if (input.jobs.some(isBancoPacksActiveJob)) {
    return { code: "active_queue", ok: false };
  }

  return { code: "ready", ok: true };
}

export function bancoPacksReadinessMessage(code: BancoPacksUpdateReadinessCode) {
  if (code === "ready") return "Listo";
  if (code === "job_type_disabled") return "No disponible";
  if (code === "job_type_missing") return "No disponible";
  if (code === "worker_missing") return "Worker fuera de linea";
  if (code === "worker_offline") return "Worker fuera de linea";
  if (code === "worker_busy") return "Worker ocupado";
  if (code === "active_queue") return "Otra operacion activa";
  return "No disponible";
}