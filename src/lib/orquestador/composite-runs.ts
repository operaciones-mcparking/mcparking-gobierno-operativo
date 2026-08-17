import { sanitizeOperationalText } from "@/lib/orquestador/types";

export type CompositeRunStatus = "ready" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export type CompositeRunStepStatus =
  | "pending"
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export type RawCompositeRunJobRow = {
  id: string;
  job_type: string;
  status: string;
  requested_source: string | null;
  target_worker_id: string | null;
  locked_by_worker_id: string | null;
  priority: number | null;
  attempts: number | null;
  max_attempts: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string | null;
  composite_run_id: string;
  composite_kind: string;
  sequence_index: number;
  sequence_total: number;
};

export type CompositeRunStepViewModel = {
  step: number;
  total_steps: number;
  label: string;
  job_id: string | null;
  job_type: string;
  status: CompositeRunStepStatus;
  worker_id: string | null;
  attempts: number | null;
  priority: number | null;
  started_at: string | null;
  finished_at: string | null;
  last_heartbeat_at: string | null;
  duration_seconds: number | null;
  safe_message: string | null;
  safe_error: string | null;
};

export type CompositeRunViewModel = {
  run_id: string;
  kind: string;
  status: CompositeRunStatus;
  current_step: number | null;
  total_steps: number;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  steps: CompositeRunStepViewModel[];
};

export type CompositeRunMapOptions = {
  kind?: string;
  labels?: Record<number, string>;
  runId?: string;
  totalSteps?: number;
};

export const ACTUALIZAR_DATOS_OPERACIONALES_KIND = "actualizar_datos_operacionales_last_month";

export const ACTUALIZAR_DATOS_OPERACIONALES_LABELS: Record<number, string> = {
  1: "Actualizar Reservas ultimo mes",
  2: "Actualizar Banco de Packs",
  3: "Actualizar metricas Dashboard ultimo mes",
};

const activeStatuses = new Set(["queued", "claimed", "running"]);
const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

export function shortCompositeJobId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "-";
}

export function calculateCompositeDurationSeconds(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const startedMs = new Date(startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();

  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return null;
  }

  return Math.round((finishedMs - startedMs) / 1000);
}

function normalizeStepStatus(value: string | null | undefined): CompositeRunStepStatus {
  if (value === "queued" || value === "claimed" || value === "running" || value === "succeeded" || value === "failed" || value === "cancelled") {
    return value;
  }

  return "pending";
}

function labelForStep(kind: string, step: number, labels?: Record<number, string>) {
  if (labels?.[step]) {
    return labels[step];
  }

  if (kind === ACTUALIZAR_DATOS_OPERACIONALES_KIND && ACTUALIZAR_DATOS_OPERACIONALES_LABELS[step]) {
    return ACTUALIZAR_DATOS_OPERACIONALES_LABELS[step];
  }

  return `Paso ${step}`;
}

function firstIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0) ?? null;
}

function lastIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function calculateRunStatus(steps: CompositeRunStepViewModel[], hasRows: boolean): CompositeRunStatus {
  if (!hasRows) {
    return "ready";
  }

  if (steps.some((step) => step.status === "cancelled")) {
    return "cancelled";
  }

  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.length > 0 && steps.every((step) => step.status === "succeeded")) {
    return "succeeded";
  }

  if (steps.some((step) => activeStatuses.has(step.status))) {
    return "running";
  }

  return "waiting";
}

function calculateCurrentStep(steps: CompositeRunStepViewModel[], status: CompositeRunStatus) {
  if (status === "succeeded" || status === "ready") {
    return null;
  }

  const activeStep = steps.find((step) => activeStatuses.has(step.status));
  if (activeStep) {
    return activeStep.step;
  }

  const stoppedStep = steps.find((step) => step.status === "failed" || step.status === "cancelled");
  if (stoppedStep) {
    return stoppedStep.step;
  }

  return steps.find((step) => step.status !== "succeeded")?.step ?? null;
}

export function mapCompositeRunJobs(rows: RawCompositeRunJobRow[], options: CompositeRunMapOptions = {}): CompositeRunViewModel {
  const orderedRows = [...rows].sort((a, b) => a.sequence_index - b.sequence_index);
  const firstRow = orderedRows[0] ?? null;
  const kind = options.kind ?? firstRow?.composite_kind ?? "";
  const runId = options.runId ?? firstRow?.composite_run_id ?? "";
  const totalSteps = Math.max(
    options.totalSteps ?? 0,
    ...orderedRows.map((row) => row.sequence_total),
    ...orderedRows.map((row) => row.sequence_index),
  );
  const rowsByStep = new Map<number, RawCompositeRunJobRow>();

  for (const row of orderedRows) {
    if (!rowsByStep.has(row.sequence_index)) {
      rowsByStep.set(row.sequence_index, row);
    }
  }

  const terminalStopIndex = orderedRows
    .filter((row) => row.status === "failed" || row.status === "cancelled")
    .map((row) => row.sequence_index)
    .sort((a, b) => a - b)
    .at(0) ?? null;

  const steps = Array.from({ length: totalSteps }, (_, index) => {
    const stepNumber = index + 1;
    const row = rowsByStep.get(stepNumber) ?? null;
    const isBlocked = terminalStopIndex !== null && stepNumber > terminalStopIndex;
    const status = isBlocked ? "blocked" : normalizeStepStatus(row?.status);

    return {
      step: stepNumber,
      total_steps: totalSteps,
      label: labelForStep(kind, stepNumber, options.labels),
      job_id: row?.id ?? null,
      job_type: row?.job_type ?? "",
      status,
      worker_id: row?.locked_by_worker_id ?? row?.target_worker_id ?? null,
      attempts: row?.attempts ?? null,
      priority: row?.priority ?? null,
      started_at: row?.started_at ?? null,
      finished_at: row?.finished_at ?? null,
      last_heartbeat_at: row?.last_heartbeat_at ?? null,
      duration_seconds: calculateCompositeDurationSeconds(row?.started_at, row?.finished_at),
      safe_message: row?.requested_source ? sanitizeOperationalText(row.requested_source) : null,
      safe_error: sanitizeOperationalText(row?.error_message),
    } satisfies CompositeRunStepViewModel;
  });

  const status = calculateRunStatus(steps, orderedRows.length > 0);
  const startedAt = firstIso(orderedRows.map((row) => row.started_at ?? row.created_at));
  const finishedAt = terminalStatuses.has(status) ? lastIso(orderedRows.map((row) => row.finished_at)) : null;

  return {
    run_id: runId,
    kind,
    status,
    current_step: calculateCurrentStep(steps, status),
    total_steps: totalSteps,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_seconds: calculateCompositeDurationSeconds(startedAt, finishedAt),
    steps,
  };
}
