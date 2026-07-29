import type { OrchestratorJob, OrchestratorJobType, OrchestratorWorker } from "@/lib/orquestador/types";

export const DASHBOARD_LAST_MONTH_JOB_TYPE = "dashboard_actualizar_metricas";
export const DASHBOARD_LAST_MONTH_AGENT = "dashboard";
export const DASHBOARD_LAST_MONTH_ACTION = "actualizar-metricas";
export const DASHBOARD_LAST_MONTH_PERIOD = "last-month";
export const DASHBOARD_TARGET_WORKER_ID = "pc_operaciones_01";
export const DASHBOARD_LAST_MONTH_REQUESTED_SOURCE = "web_orchestrator_dashboard_last_month";
export const DASHBOARD_LAST_MONTH_PRIORITY = 1;
export const DASHBOARD_HEARTBEAT_MAX_AGE_MS = 120_000;

export const DASHBOARD_ACTIVE_JOB_STATUSES = new Set(["queued", "claimed", "running"]);

export type DashboardLastMonthReadinessCode = "ready" | "job_type_disabled" | "job_type_missing" | "worker_missing" | "worker_offline" | "worker_busy" | "active_queue";

export type DashboardLastMonthReadiness = {
  code: DashboardLastMonthReadinessCode;
  ok: boolean;
};

export function isDashboardActiveJob(job: Pick<OrchestratorJob, "status">) {
  return DASHBOARD_ACTIVE_JOB_STATUSES.has(job.status);
}

export function isDashboardWorkerHeartbeatRecent(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenMs = new Date(lastSeenAt).getTime();
  return Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= DASHBOARD_HEARTBEAT_MAX_AGE_MS;
}

export function getDashboardLastMonthReadiness(input: {
  jobType: OrchestratorJobType | null | undefined;
  jobs: Pick<OrchestratorJob, "status">[];
  nowMs?: number;
  worker: Pick<OrchestratorWorker, "last_seen_at" | "locked_job_id" | "status" | "worker_id"> | null | undefined;
}): DashboardLastMonthReadiness {
  if (!input.jobType) {
    return { code: "job_type_missing", ok: false };
  }

  if (!input.jobType.enabled) {
    return { code: "job_type_disabled", ok: false };
  }

  if (!input.worker || input.worker.worker_id !== DASHBOARD_TARGET_WORKER_ID) {
    return { code: "worker_missing", ok: false };
  }

  if (!isDashboardWorkerHeartbeatRecent(input.worker.last_seen_at, input.nowMs)) {
    return { code: "worker_offline", ok: false };
  }

  if (input.worker.status !== "idle") {
    return { code: "worker_busy", ok: false };
  }

  if (input.worker.locked_job_id) {
    return { code: "worker_busy", ok: false };
  }

  if (input.jobs.some(isDashboardActiveJob)) {
    return { code: "active_queue", ok: false };
  }

  return { code: "ready", ok: true };
}

export function dashboardLastMonthReadinessMessage(code: DashboardLastMonthReadinessCode) {
  if (code === "ready") return "Listo";
  if (code === "job_type_disabled") return "No disponible";
  if (code === "job_type_missing") return "No disponible";
  if (code === "worker_missing") return "Worker fuera de linea";
  if (code === "worker_offline") return "Worker fuera de linea";
  if (code === "worker_busy") return "Worker ocupado";
  if (code === "active_queue") return "Otra operacion activa";
  return "No disponible";
}