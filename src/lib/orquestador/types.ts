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
  payload?: JsonRecord | null;
  result?: JsonRecord | null;
  error_message?: string | null;
  attempts?: number | null;
  max_attempts?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
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
};

export type OrchestratorJob = {
  id: string;
  job_type: string;
  status: string;
  worker_id: string | null;
  attempts: number | null;
  max_attempts: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type OrchestratorEvent = {
  id: number;
  job_id: string;
  worker_id: string | null;
  event_type: string;
  message: string | null;
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

export function safeWorkerRow(row: RawWorkerRow): OrchestratorWorker {
  return {
    worker_id: row.worker_id,
    display_name: sanitizeOperationalText(row.display_name) ?? null,
    status: row.status,
    locked_job_id: row.current_job_id,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function safeJobRow(row: RawJobRow): OrchestratorJob {
  return {
    id: row.id,
    job_type: row.job_type,
    status: row.status,
    worker_id: row.locked_by_worker_id ?? row.target_worker_id ?? null,
    attempts: row.attempts ?? null,
    max_attempts: row.max_attempts ?? null,
    error_message: sanitizeOperationalText(row.error_message),
    created_at: row.created_at,
    started_at: row.started_at ?? null,
    finished_at: row.finished_at ?? null,
  };
}

export function safeEventRow(row: RawEventRow): OrchestratorEvent {
  return {
    id: row.id,
    job_id: row.job_id,
    worker_id: row.worker_id,
    event_type: row.event_type,
    message: sanitizeOperationalText(row.message),
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