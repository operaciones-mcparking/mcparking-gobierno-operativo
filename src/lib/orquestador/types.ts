type JsonRecord = Record<string, unknown>;

export type RawWorkerRow = {
  worker_id: string;
  display_name: string | null;
  status: string;
  current_job_id: string | null;
  last_seen_at: string | null;
  metadata?: JsonRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RawJobRow = {
  id: string;
  job_type: string;
  status: string;
  requested_source?: string | null;
  target_worker_id?: string | null;
  locked_by_worker_id?: string | null;
  priority?: number | null;
  payload?: JsonRecord | null;
  result?: JsonRecord | null;
  error_message?: string | null;
  attempts?: number | null;
  max_attempts?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  last_heartbeat_at?: string | null;
  composite_run_id?: string | null;
  composite_kind?: string | null;
  sequence_index?: number | null;
  sequence_total?: number | null;
  created_at: string;
};

export type RawEventRow = {
  id: number;
  job_id: string;
  worker_id: string | null;
  event_type: string;
  message: string | null;
  data?: JsonRecord | null;
  created_at: string;
};

export type RawJobTypeRow = {
  job_type: string;
  display_name: string;
  description: string | null;
  agent_key?: string | null;
  enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OrchestratorWorker = {
  worker_id: string;
  display_name: string | null;
  status: string;
  locked_job_id: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  currentJobId: string | null;
  instanceId: string | null;
  startedAt: string | null;
};

export type HealthCheckResult = {
  ok: boolean;
  worker_id: string | null;
  checked_at: string | null;
  dry_run: boolean | null;
  real_execution_allowed: boolean | null;
};

export type SourceConnectionResult = {
  ok: boolean;
  source_key: string | null;
  checked_at: string | null;
  duration_ms: number | null;
  read_only: boolean | null;
  worker_id: string | null;
};

export type BancoReservasLastWeekResult = {
  ok: boolean | null;
  duration_seconds: number | null;
  modo: "last-week" | null;
  returncode: number | null;
  timed_out: boolean | null;
};

export type BancoPacksUpdateResult = {
  ok: boolean | null;
  action: "actualizar-packs" | null;
  dry_run: boolean | null;
  message: string | null;
  duration_seconds: number | null;
  returncode: number | null;
  timed_out: boolean | null;
  rows_total?: number | null;
  rows_inserted?: number | null;
  rows_updated?: number | null;
  rows_unchanged?: number | null;
};

export type DashboardMetricsResult = {
  ok: boolean | null;
  dry_run: boolean | null;
  message: string | null;
  duration_seconds: number | null;
  periodo: "last-month" | null;
  returncode: number | null;
  timed_out: boolean | null;
  rows_written?: number | null;
  dates_processed?: number | null;
};

export type OrchestratorJob = {
  id: string;
  job_type: string;
  status: string;
  worker_id: string | null;
  lastHeartbeatAt: string | null;
  requestedSource: string | null;
  priority: number | null;
  compositeRunId: string | null;
  compositeKind: string | null;
  sequenceIndex: number | null;
  sequenceTotal: number | null;
  attempts: number | null;
  max_attempts: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  banco_packs_update_result?: BancoPacksUpdateResult | null;
  dashboard_metrics_result?: DashboardMetricsResult | null;
  banco_reservas_last_week_result?: BancoReservasLastWeekResult | null;
  health_check_result?: HealthCheckResult | null;
  source_connection_result?: SourceConnectionResult | null;
};

export type OrchestratorEvent = {
  id: number;
  job_id: string;
  worker_id: string | null;
  event_type: string;
  message: string | null;
  stage: string | null;
  substage: string | null;
  created_at: string;
};

export type OrchestratorJobType = {
  job_type: string;
  name: string;
  description: string | null;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
};

const fallbackMessage = "Error operacional registrado.";
const localPathPattern = /\b[A-Z]:\\[^\s]+/i;
const stackTracePattern = /\bat\s+.+\(.+\)|Traceback \(most recent call last\):|^\s*at\s+/m;

export function sanitizeOperationalText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (
    !normalized ||
    localPathPattern.test(normalized) ||
    stackTracePattern.test(normalized) ||
    (normalized.startsWith("{") && normalized.endsWith("}")) ||
    (normalized.startsWith("[") && normalized.endsWith("]"))
  ) {
    return fallbackMessage;
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157).trimEnd()}...` : normalized;
}

function safeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function safeString(value: unknown) {
  return typeof value === "string" ? sanitizeOperationalText(value) : null;
}

function safeTimestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) {
    return null;
  }
  return value;
}

function safeMetadataString(metadata: JsonRecord | null | undefined, key: string) {
  const value = safeString(metadata?.[key]);
  return value && value.length <= 200 ? value : null;
}
function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeHealthCheckResult(jobType: string, result: JsonRecord | null | undefined): HealthCheckResult | null {
  if (jobType !== "worker_health_check" || !result) {
    return null;
  }

  return {
    ok: result.ok === true,
    worker_id: safeString(result.worker_id),
    checked_at: safeString(result.checked_at),
    dry_run: safeBoolean(result.dry_run),
    real_execution_allowed: safeBoolean(result.real_execution_allowed),
  };
}

function safeSourceConnectionResult(jobType: string, result: JsonRecord | null | undefined): SourceConnectionResult | null {
  if (jobType !== "source_connection_check" || !result) {
    return null;
  }

  return {
    ok: result.ok === true,
    source_key: safeString(result.source_key),
    checked_at: safeString(result.checked_at),
    duration_ms: safeNumber(result.duration_ms),
    read_only: safeBoolean(result.read_only),
    worker_id: safeString(result.worker_id),
  };
}

function safeBancoReservasLastWeekResult(jobType: string, result: JsonRecord | null | undefined): BancoReservasLastWeekResult | null {
  if (jobType !== "banco_reservas_actualizar" || !result) {
    return null;
  }

  const returncode = safeNumber(result.returncode);

  return {
    ok: safeBoolean(result.ok) ?? (returncode === null ? null : returncode === 0),
    duration_seconds: safeNumber(result.duration_seconds),
    modo: result.modo === "last-week" ? "last-week" : null,
    returncode,
    timed_out: safeBoolean(result.timed_out),
  };
}
function safeBancoPacksUpdateResult(jobType: string, result: JsonRecord | null | undefined): BancoPacksUpdateResult | null {
  if (jobType !== "banco_packs_actualizar_sin_consumos" || !result) {
    return null;
  }

  const returncode = safeNumber(result.returncode);

  return {
    ok: safeBoolean(result.ok) ?? (returncode === null ? null : returncode === 0),
    action: "actualizar-packs",
    dry_run: safeBoolean(result.dry_run),
    message: safeString(result.message),
    duration_seconds: safeNumber(result.duration_seconds),
    returncode,
    timed_out: safeBoolean(result.timed_out),
    rows_total: safeNumber(result.rows_total),
    rows_inserted: safeNumber(result.rows_inserted),
    rows_updated: safeNumber(result.rows_updated),
    rows_unchanged: safeNumber(result.rows_unchanged),
  };
}

function safeDashboardMetricsResult(jobType: string, result: JsonRecord | null | undefined): DashboardMetricsResult | null {
  if (jobType !== "dashboard_actualizar_metricas" || !result) {
    return null;
  }

  const returncode = safeNumber(result.returncode);

  return {
    ok: safeBoolean(result.ok) ?? (returncode === null ? null : returncode === 0),
    dry_run: safeBoolean(result.dry_run),
    message: safeString(result.message),
    duration_seconds: safeNumber(result.duration_seconds),
    periodo: result.periodo === "last-month" ? "last-month" : null,
    returncode,
    timed_out: safeBoolean(result.timed_out),
    rows_written: safeNumber(result.rows_written),
    dates_processed: safeNumber(result.dates_processed),
  };
}
function durationSeconds(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const startMs = new Date(startedAt).getTime();
  const finishMs = new Date(finishedAt).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) {
    return null;
  }

  return Math.round((finishMs - startMs) / 1000);
}

export function safeWorkerRow(row: RawWorkerRow): OrchestratorWorker {
  return {
    worker_id: row.worker_id,
    display_name: sanitizeOperationalText(row.display_name) ?? null,
    status: row.status,
    locked_job_id: row.current_job_id,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    currentJobId: row.current_job_id,
    instanceId: safeMetadataString(row.metadata, "instance_id"),
    startedAt: safeTimestamp(row.metadata?.started_at),
  };
}

export function safeJobRow(row: RawJobRow): OrchestratorJob {
  return {
    id: row.id,
    job_type: row.job_type,
    status: row.status,
    worker_id: row.locked_by_worker_id ?? row.target_worker_id ?? null,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
    requestedSource: sanitizeOperationalText(row.requested_source),
    priority: row.priority ?? null,
    compositeRunId: row.composite_run_id ?? null,
    compositeKind: row.composite_kind ?? null,
    sequenceIndex: row.sequence_index ?? null,
    sequenceTotal: row.sequence_total ?? null,
    attempts: row.attempts ?? null,
    max_attempts: row.max_attempts ?? null,
    error_message: sanitizeOperationalText(row.error_message),
    created_at: row.created_at,
    started_at: row.started_at ?? null,
    finished_at: row.finished_at ?? null,
    duration_seconds: durationSeconds(row.started_at, row.finished_at),
    banco_packs_update_result: safeBancoPacksUpdateResult(row.job_type, row.result),
    dashboard_metrics_result: safeDashboardMetricsResult(row.job_type, row.result),
    banco_reservas_last_week_result: safeBancoReservasLastWeekResult(row.job_type, row.result),
    health_check_result: safeHealthCheckResult(row.job_type, row.result),
    source_connection_result: safeSourceConnectionResult(row.job_type, row.result),
  };
}

export function safeEventRow(row: RawEventRow): OrchestratorEvent {
  return {
    id: row.id,
    job_id: row.job_id,
    worker_id: row.worker_id,
    event_type: row.event_type,
    message: sanitizeOperationalText(row.message),
    stage: safeString(row.data?.stage),
    substage: safeString(row.data?.substage),
    created_at: row.created_at,
  };
}

export function safeJobTypeRow(row: RawJobTypeRow): OrchestratorJobType {
  return {
    job_type: row.job_type,
    name: row.display_name,
    description: sanitizeOperationalText(row.description),
    enabled: row.enabled,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}