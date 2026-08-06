import {
  ACTUALIZAR_DATOS_OPERACIONALES_KIND,
  ACTUALIZAR_DATOS_OPERACIONALES_LABELS,
  mapCompositeRunJobs,
  type CompositeRunViewModel,
  type RawCompositeRunJobRow,
} from "@/lib/orquestador/composite-runs";
import type { OrchestratorJob, OrchestratorJobType, OrchestratorWorker } from "@/lib/orquestador/types";

export const OPERACIONES_TARGET_WORKER_ID = "pc_operaciones_01";
export const OPERACIONES_SEQUENCE_TOTAL = 3;
export const OPERACIONES_HEARTBEAT_MAX_AGE_MS = 120_000;
export const OPERACIONES_ACTIVE_JOB_STATUSES = new Set(["queued", "claimed", "running"]);

export type ActualizarDatosStep = {
  jobType: "banco_reservas_actualizar" | "banco_packs_actualizar_sin_consumos" | "dashboard_actualizar_metricas";
  label: string;
  payload: Record<string, string>;
  priority: 90 | 91 | 92;
  requestedSource:
    | "web_orchestrator_operaciones_last_month_reservas"
    | "web_orchestrator_operaciones_last_month_packs"
    | "web_orchestrator_operaciones_last_month_dashboard";
  sequenceIndex: 1 | 2 | 3;
  targetWorkerId: "pc_operaciones_01";
};

export const ACTUALIZAR_DATOS_STEPS: readonly ActualizarDatosStep[] = [
  {
    jobType: "banco_reservas_actualizar",
    label: ACTUALIZAR_DATOS_OPERACIONALES_LABELS[1],
    payload: { modo: "last-week" },
    priority: 90,
    requestedSource: "web_orchestrator_operaciones_last_month_reservas",
    sequenceIndex: 1,
    targetWorkerId: OPERACIONES_TARGET_WORKER_ID,
  },
  {
    jobType: "banco_packs_actualizar_sin_consumos",
    label: ACTUALIZAR_DATOS_OPERACIONALES_LABELS[2],
    payload: { action: "actualizar-packs" },
    priority: 91,
    requestedSource: "web_orchestrator_operaciones_last_month_packs",
    sequenceIndex: 2,
    targetWorkerId: OPERACIONES_TARGET_WORKER_ID,
  },
  {
    jobType: "dashboard_actualizar_metricas",
    label: ACTUALIZAR_DATOS_OPERACIONALES_LABELS[3],
    payload: {
      action: "actualizar-metricas",
      agent: "dashboard",
      periodo: "last-week",
    },
    priority: 92,
    requestedSource: "web_orchestrator_operaciones_last_month_dashboard",
    sequenceIndex: 3,
    targetWorkerId: OPERACIONES_TARGET_WORKER_ID,
  },
] as const;

export type ActualizarDatosReadinessCode =
  | "ready"
  | "job_type_disabled"
  | "job_type_missing"
  | "worker_missing"
  | "worker_offline"
  | "worker_busy"
  | "active_queue";

export type ActualizarDatosReadiness = {
  code: ActualizarDatosReadinessCode;
  ok: boolean;
};

export function isActualizarDatosRunId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getActualizarDatosStep(sequenceIndex: number) {
  return ACTUALIZAR_DATOS_STEPS.find((step) => step.sequenceIndex === sequenceIndex) ?? null;
}

export function isActualizarDatosHeartbeatRecent(lastSeenAt: string | null | undefined, nowMs = Date.now()) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenMs = new Date(lastSeenAt).getTime();
  return Number.isFinite(lastSeenMs) && nowMs - lastSeenMs <= OPERACIONES_HEARTBEAT_MAX_AGE_MS;
}

export function isActualizarDatosActiveJob(job: Pick<OrchestratorJob, "status">) {
  return OPERACIONES_ACTIVE_JOB_STATUSES.has(job.status);
}

export function getActualizarDatosReadiness(input: {
  jobTypes: OrchestratorJobType[];
  jobs: Pick<OrchestratorJob, "status">[];
  nowMs?: number;
  worker: Pick<OrchestratorWorker, "last_seen_at" | "locked_job_id" | "status" | "worker_id"> | null | undefined;
}): ActualizarDatosReadiness {
  const jobTypesByName = new Map(input.jobTypes.map((jobType) => [jobType.job_type, jobType]));

  for (const step of ACTUALIZAR_DATOS_STEPS) {
    const jobType = jobTypesByName.get(step.jobType);
    if (!jobType) {
      return { code: "job_type_missing", ok: false };
    }

    if (!jobType.enabled) {
      return { code: "job_type_disabled", ok: false };
    }
  }

  if (!input.worker || input.worker.worker_id !== OPERACIONES_TARGET_WORKER_ID) {
    return { code: "worker_missing", ok: false };
  }

  if (!isActualizarDatosHeartbeatRecent(input.worker.last_seen_at, input.nowMs)) {
    return { code: "worker_offline", ok: false };
  }

  if (input.worker.status !== "idle" || input.worker.locked_job_id) {
    return { code: "worker_busy", ok: false };
  }

  if (input.jobs.some(isActualizarDatosActiveJob)) {
    return { code: "active_queue", ok: false };
  }

  return { code: "ready", ok: true };
}

export function mapActualizarDatosRun(rows: RawCompositeRunJobRow[], runId: string): CompositeRunViewModel {
  return mapCompositeRunJobs(rows, {
    kind: ACTUALIZAR_DATOS_OPERACIONALES_KIND,
    labels: ACTUALIZAR_DATOS_OPERACIONALES_LABELS,
    runId,
    totalSteps: OPERACIONES_SEQUENCE_TOTAL,
  });
}

export function hasExpectedCompositeKind(rows: RawCompositeRunJobRow[]) {
  return rows.every((row) => row.composite_kind === ACTUALIZAR_DATOS_OPERACIONALES_KIND);
}

export function hasExpectedActualizarDatosRunContract(rows: RawCompositeRunJobRow[]) {
  return rows.every((row) => {
    const expectedStep = getActualizarDatosStep(row.sequence_index);

    return Boolean(
      expectedStep &&
        row.composite_kind === ACTUALIZAR_DATOS_OPERACIONALES_KIND &&
        row.sequence_total === OPERACIONES_SEQUENCE_TOTAL &&
        row.job_type === expectedStep.jobType &&
        row.requested_source === expectedStep.requestedSource &&
        row.target_worker_id === expectedStep.targetWorkerId,
    );
  });
}

export function getLastExistingStep(rows: RawCompositeRunJobRow[]) {
  return [...rows].sort((a, b) => b.sequence_index - a.sequence_index)[0] ?? null;
}

export function getNextStepToCreate(rows: RawCompositeRunJobRow[]) {
  const existing = new Set(rows.map((row) => row.sequence_index));
  const lastStep = getLastExistingStep(rows);

  if (!lastStep || OPERACIONES_ACTIVE_JOB_STATUSES.has(lastStep.status)) {
    return null;
  }

  if (lastStep.status === "failed" || lastStep.status === "cancelled") {
    return null;
  }

  if (lastStep.status !== "succeeded") {
    return null;
  }

  const nextIndex = lastStep.sequence_index + 1;
  if (existing.has(nextIndex)) {
    return null;
  }

  return getActualizarDatosStep(nextIndex);
}

export function actualizarDatosReadinessMessage(code: ActualizarDatosReadinessCode) {
  if (code === "job_type_disabled") return "La actualizacion de datos operacionales esta deshabilitada.";
  if (code === "job_type_missing") return "No fue posible encontrar todos los tipos de job requeridos.";
  if (code === "worker_missing" || code === "worker_offline") return "El worker no esta disponible.";
  if (code === "worker_busy") return "El worker esta ocupado.";
  if (code === "active_queue") return "Existe otra operacion activa en el orquestador.";
  return "No fue posible iniciar la actualizacion de datos operacionales.";
}

export { ACTUALIZAR_DATOS_OPERACIONALES_KIND } from "@/lib/orquestador/composite-runs";
