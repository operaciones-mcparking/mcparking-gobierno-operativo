export const compositeKind = "actualizar_datos_operacionales_last_month";
export const compositeRunId = "9f7c4a5b-1d2e-4c3a-9b8a-123456789abc";

const baseTime = "2026-07-29T12:00:00.000Z";

function row(step, overrides = {}) {
  return {
    attempts: null,
    composite_kind: compositeKind,
    composite_run_id: compositeRunId,
    created_at: baseTime,
    error_message: null,
    finished_at: null,
    id: `0000000${step}-aaaa-bbbb-cccc-00000000000${step}`,
    job_type: ["banco_reservas_actualizar", "banco_packs_actualizar_sin_consumos", "dashboard_actualizar_metricas"][step - 1] ?? "job_desconocido",
    locked_by_worker_id: null,
    max_attempts: 1,
    requested_source: `web_orchestrator_step_${step}`,
    sequence_index: step,
    sequence_total: 3,
    started_at: null,
    status: "queued",
    target_worker_id: "pc_operaciones_01",
    updated_at: baseTime,
    ...overrides,
  };
}

export const fixtures = {
  cancelled: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "cancelled",
    }),
  ],
  failedStep1: [
    row(1, {
      attempts: 1,
      error_message: "Traceback (most recent call last): C:\\sensitive\\path\\worker.py",
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "failed",
    }),
  ],
  failedStep2: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(2, {
      attempts: 1,
      error_message: "{\"stdout\":\"secret\",\"stderr\":\"secret\"}",
      finished_at: "2026-07-29T12:03:00.000Z",
      started_at: "2026-07-29T12:02:00.000Z",
      status: "failed",
    }),
  ],
  missingRow: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(3, {
      started_at: "2026-07-29T12:02:00.000Z",
      status: "running",
    }),
  ],
  notStarted: [],
  outOfOrder: [
    row(3, {
      finished_at: "2026-07-29T12:05:00.000Z",
      started_at: "2026-07-29T12:04:00.000Z",
      status: "succeeded",
    }),
    row(1, {
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(2, {
      finished_at: "2026-07-29T12:03:00.000Z",
      started_at: "2026-07-29T12:02:00.000Z",
      status: "succeeded",
    }),
  ],
  step1Running: [
    row(1, {
      attempts: 1,
      locked_by_worker_id: "pc_operaciones_01",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "running",
    }),
  ],
  step2Running: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(2, {
      attempts: 1,
      locked_by_worker_id: "pc_operaciones_01",
      started_at: "2026-07-29T12:02:00.000Z",
      status: "running",
    }),
  ],
  step3Running: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(2, {
      attempts: 1,
      finished_at: "2026-07-29T12:03:00.000Z",
      started_at: "2026-07-29T12:02:00.000Z",
      status: "succeeded",
    }),
    row(3, {
      attempts: 1,
      locked_by_worker_id: "pc_operaciones_01",
      started_at: "2026-07-29T12:04:00.000Z",
      status: "running",
    }),
  ],
  succeeded: [
    row(1, {
      attempts: 1,
      finished_at: "2026-07-29T12:01:00.000Z",
      started_at: "2026-07-29T12:00:00.000Z",
      status: "succeeded",
    }),
    row(2, {
      attempts: 1,
      finished_at: "2026-07-29T12:03:00.000Z",
      started_at: "2026-07-29T12:02:00.000Z",
      status: "succeeded",
    }),
    row(3, {
      attempts: 1,
      finished_at: "2026-07-29T12:05:00.000Z",
      started_at: "2026-07-29T12:04:00.000Z",
      status: "succeeded",
    }),
  ],
};
