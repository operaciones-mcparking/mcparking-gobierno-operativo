type JsonRecord = Record<string, unknown>;

export type ReservasOperationalSummary = {
  mode: string | null;
  date_from: string | null;
  started_at: string | null;
  ended_at: string | null;
  internal_duration_seconds: number | null;
  total_valid: number | null;
  inserted: number | null;
  updated: number | null;
  unchanged: number | null;
  errors: number | null;
  sources: {
    MCP: number | null;
    MCP_BORRADOR: number | null;
    OKP: number | null;
  };
};

export type JobTechnicalDetailViewModel = {
  id: string;
  short_id: string;
  job_type: string;
  job_label: string;
  status: string;
  requested_source: string | null;
  worker_id: string | null;
  attempts: number | null;
  max_attempts: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  returncode: number | null;
  timed_out: boolean | null;
  execution_mode: string | null;
  safe_error: string | null;
  operational_summary: ReservasOperationalSummary | null;
  safe_log_lines: string[];
  technical_output_available: boolean;
};

export type RawJobTechnicalDetailRow = {
  id: string;
  job_type: string;
  status: string;
  requested_source: string | null;
  target_worker_id: string | null;
  locked_by_worker_id: string | null;
  attempts: number | null;
  max_attempts: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  result: JsonRecord | null;
};

const jobLabels: Record<string, string> = {
  banco_packs_actualizar_sin_consumos: "Actualizar Banco de Packs",
  banco_reservas_actualizar: "Actualizar Reservas",
  dashboard_actualizar_metricas: "Actualizar metricas Dashboard",
  source_connection_check: "Comprobar conexion a fuente",
  worker_health_check: "Probar worker",
};

const localPathPattern = /\b[A-Z]:\\[^\s"'<>]+/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneCandidatePattern = /(?<![\d:])\+?\d[\d\s().-]{7,}\d(?![\d:])/g;
const sensitiveLinePattern = /\b(password|passwd|secret|token|api[_-]?key|service[_-]?role|connection string|dsn)\b/i;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? sanitizeTechnicalText(value, 180) : null;
}

function safeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function shouldSanitizePhoneCandidate(value: string) {
  if (value.includes(":")) {
    return false;
  }

  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 9 || digits.length > 15) {
    return false;
  }

  if (/^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(trimmed) || /^\d{2}-\d{2}-\d{2,4}(?:\s|$)/.test(trimmed)) {
    return false;
  }

  return /^\+?56/.test(trimmed) || /^56/.test(digits) || /^9/.test(digits) || digits.length >= 10;
}

function sanitizePhoneCandidates(value: string) {
  return value.replace(phoneCandidatePattern, (candidate) => (shouldSanitizePhoneCandidate(candidate) ? "[telefono]" : candidate));
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

export function sanitizeTechnicalText(value: string, maxLength = 180) {
  const singleLine = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

  if (!singleLine || sensitiveLinePattern.test(singleLine)) {
    return null;
  }

  const withoutEmail = singleLine
    .replace(localPathPattern, "[ruta local]")
    .replace(emailPattern, "[email]");
  const sanitized = sanitizePhoneCandidates(withoutEmail);

  if (!sanitized || sanitized === "{}" || sanitized === "[]") {
    return null;
  }

  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 3).trimEnd()}...` : sanitized;
}

function safeLogLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return null;
  }

  return sanitizeTechnicalText(trimmed, 180);
}

export function safeTechnicalLogLines(output: string | null | undefined, limit = 40) {
  if (!output) {
    return [];
  }

  const lines: string[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const sanitized = safeLogLine(rawLine);
    if (sanitized) {
      lines.push(sanitized);
    }
    if (lines.length >= limit) {
      break;
    }
  }

  return lines;
}

function readPath(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function metricValueAtPaths(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function stringValueAtPaths(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim()) {
      return sanitizeTechnicalText(value, 120);
    }
  }
  return null;
}

function collectJsonCandidatesFromText(value: string) {
  const candidates: unknown[] = [];
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push(index);
      continue;
    }

    if (char === "}" && stack.length > 0) {
      const start = stack.pop();
      if (start !== undefined && stack.length === 0) {
        try {
          candidates.push(JSON.parse(value.slice(start, index + 1)));
        } catch {
          // Ignore malformed log fragments.
        }
      }
    }
  }

  return candidates;
}

export function findJsonObjects(value: unknown): unknown[] {
  if (typeof value === "string") {
    return collectJsonCandidatesFromText(value);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findJsonObjects(item));
  }

  if (isRecord(value)) {
    return [value, ...Object.values(value).flatMap((item) => findJsonObjects(item))];
  }

  return [];
}

function extractReservaMetrics(candidate: unknown): ReservasOperationalSummary | null {
  const root = isRecord(candidate) && isRecord(candidate.datos) ? candidate.datos : candidate;

  const summary: ReservasOperationalSummary = {
    mode: stringValueAtPaths(root, [["modo"], ["mode"]]),
    date_from: stringValueAtPaths(root, [["fecha_desde"], ["date_from"]]),
    started_at: stringValueAtPaths(root, [["started_at"], ["inicio"]]),
    ended_at: stringValueAtPaths(root, [["ended_at"], ["fin"]]),
    internal_duration_seconds: metricValueAtPaths(root, [["duracion_segundos"], ["duration_seconds"]]),
    total_valid: metricValueAtPaths(root, [["validacion", "total_validas"], ["total_validas"], ["total_valid"]]),
    inserted: metricValueAtPaths(root, [["upsert", "insertadas"], ["insertadas"], ["inserted"]]),
    updated: metricValueAtPaths(root, [["upsert", "actualizadas"], ["actualizadas"], ["updated"]]),
    unchanged: metricValueAtPaths(root, [["upsert", "sin_cambios"], ["sin_cambios"], ["unchanged"]]),
    errors: metricValueAtPaths(root, [["errores"], ["errors"], ["validacion", "errores"]]),
    sources: {
      MCP: metricValueAtPaths(root, [["fuentes", "MCP", "leidas"], ["sources", "MCP"]]),
      MCP_BORRADOR: metricValueAtPaths(root, [["fuentes", "MCP_BORRADOR", "leidas"], ["sources", "MCP_BORRADOR"]]),
      OKP: metricValueAtPaths(root, [["fuentes", "OKP", "leidas"], ["sources", "OKP"]]),
    },
  };

  const hasMetric = [
    summary.mode,
    summary.date_from,
    summary.started_at,
    summary.ended_at,
    summary.internal_duration_seconds,
    summary.total_valid,
    summary.inserted,
    summary.updated,
    summary.unchanged,
    summary.errors,
    summary.sources.MCP,
    summary.sources.MCP_BORRADOR,
    summary.sources.OKP,
  ].some((value) => value !== null);

  return hasMetric ? summary : null;
}

function firstReservaSummary(candidates: unknown[]) {
  for (const candidate of [...candidates].reverse()) {
    const summary = extractReservaMetrics(candidate);
    if (summary) {
      return summary;
    }
  }
  return null;
}

function getStringResultField(result: JsonRecord | null, field: string) {
  const value = result?.[field];
  return typeof value === "string" ? value : null;
}

function getExecutionMode(result: JsonRecord | null) {
  const explicitMode = safeString(result?.execution_mode);
  if (explicitMode) {
    return explicitMode;
  }

  const dryRun = safeBoolean(result?.dry_run);
  if (dryRun === true) return "dry-run";
  if (dryRun === false) return "real";
  return null;
}

export function mapJobTechnicalDetail(row: RawJobTechnicalDetailRow): JobTechnicalDetailViewModel {
  const result = row.result;
  const stdout = getStringResultField(result, "stdout");
  const stderr = getStringResultField(result, "stderr");
  const jsonCandidates = findJsonObjects(result);
  const outputAvailable = Boolean(stdout || stderr || result);
  const operationalSummary = row.job_type === "banco_reservas_actualizar" ? firstReservaSummary(jsonCandidates) : null;
  const resultDuration = safeNumber(result?.duration_seconds);

  return {
    id: row.id,
    short_id: row.id.slice(0, 8),
    job_type: row.job_type,
    job_label: jobLabels[row.job_type] ?? row.job_type,
    status: row.status,
    requested_source: safeString(row.requested_source),
    worker_id: row.locked_by_worker_id ?? row.target_worker_id ?? null,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    duration_seconds: resultDuration ?? durationSeconds(row.started_at, row.finished_at),
    returncode: safeNumber(result?.returncode),
    timed_out: safeBoolean(result?.timed_out),
    execution_mode: getExecutionMode(result),
    safe_error: safeString(row.error_message),
    operational_summary: operationalSummary,
    safe_log_lines: [...safeTechnicalLogLines(stdout, 30), ...safeTechnicalLogLines(stderr, 10)].slice(0, 40),
    technical_output_available: outputAvailable,
  };
}
