import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  DASHBOARD_LAST_MONTH_ACTION,
  DASHBOARD_LAST_MONTH_AGENT,
  DASHBOARD_LAST_MONTH_JOB_TYPE,
  DASHBOARD_LAST_MONTH_PERIOD,
  DASHBOARD_LAST_MONTH_PRIORITY,
  DASHBOARD_LAST_MONTH_REQUESTED_SOURCE,
  DASHBOARD_TARGET_WORKER_ID,
} from "@/lib/orquestador/dashboard-last-month";
import {
  BANCO_PACKS_PRIORITY,
  BANCO_PACKS_REQUESTED_SOURCE,
  BANCO_PACKS_TARGET_WORKER_ID,
  BANCO_PACKS_UPDATE_ACTION,
  BANCO_PACKS_UPDATE_JOB_TYPE,
} from "@/lib/orquestador/banco-packs-actualizar-packs";
import {
  BANCO_RESERVAS_LAST_WEEK_JOB_TYPE,
  BANCO_RESERVAS_LAST_WEEK_MODE,
  BANCO_RESERVAS_PRIORITY,
  BANCO_RESERVAS_REQUESTED_SOURCE,
  BANCO_RESERVAS_TARGET_WORKER_ID,
} from "@/lib/orquestador/banco-reservas-last-week";
import {
  safeEventRow,
  safeJobRow,
  safeJobTypeRow,
  safeWorkerRow,
  sanitizeOperationalText,
  type OrchestratorEvent,
  type OrchestratorJob,
  type OrchestratorJobType,
  type OrchestratorWorker,
  type RawEventRow,
  type RawJobRow,
  type RawJobTypeRow,
  type RawWorkerRow,
} from "@/lib/orquestador/types";
import type { RawCompositeRunJobRow } from "@/lib/orquestador/composite-runs";
import type { RecoveryCandidateJob, RecoveryResult } from "@/lib/orquestador/liveness";
import type { ActualizarDatosStep } from "@/lib/orquestador/actualizar-datos-operacionales";
import {
  mapJobTechnicalDetail,
  type JobTechnicalDetailViewModel,
  type RawJobTechnicalDetailRow,
} from "@/lib/orquestador/job-technical-detail";

import type { OperationalDashboardQuery } from "@/lib/dashboard/operacional";
import { collectOccupancyRpcPages } from "@/lib/dashboard/ocupacion";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type OrquestadorResult<T> = {
  data: T[];
  error: boolean;
};

type OrquestadorSingleResult<T> = {
  data: T | null;
  error: boolean;
};

type OperationalUpdateRpcRow = RawCompositeRunJobRow & {
  created: boolean;
  existing: boolean;
};

type OperationalUpdateRpcResult = {
  created: boolean;
  existing: boolean;
  rows: RawCompositeRunJobRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return (typeof value === "number" && Number.isFinite(value)) || value === null;
}

function isJsonRecordOrNull(value: unknown): value is Record<string, unknown> | null {
  return isRecord(value) || value === null;
}

function normalizeJobTechnicalDetailRpcResult(data: unknown): RawJobTechnicalDetailRow | null {
  if (!isRecord(data)) {
    return null;
  }

  if (
    typeof data.id !== "string" ||
    typeof data.job_type !== "string" ||
    typeof data.status !== "string" ||
    !isStringOrNull(data.requested_source) ||
    !isStringOrNull(data.target_worker_id) ||
    !isStringOrNull(data.locked_by_worker_id) ||
    !isNumberOrNull(data.attempts) ||
    !isNumberOrNull(data.max_attempts) ||
    typeof data.created_at !== "string" ||
    !isStringOrNull(data.started_at) ||
    !isStringOrNull(data.finished_at) ||
    !isStringOrNull(data.error_message) ||
    !isJsonRecordOrNull(data.result)
  ) {
    return null;
  }

  return {
    id: data.id,
    job_type: data.job_type,
    status: data.status,
    requested_source: data.requested_source,
    target_worker_id: data.target_worker_id,
    locked_by_worker_id: data.locked_by_worker_id,
    attempts: data.attempts,
    max_attempts: data.max_attempts,
    created_at: data.created_at,
    started_at: data.started_at,
    finished_at: data.finished_at,
    error_message: data.error_message,
    result: data.result,
  };
}

function emptyResult<T>(): OrquestadorResult<T> {
  return { data: [], error: true };
}

function singleError<T>(): OrquestadorSingleResult<T> {
  return { data: null, error: true };
}

export function createOrquestadorSupabaseAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function listOrchestratorWorkers(): Promise<OrquestadorResult<OrchestratorWorker>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_workers")) as {
      data: RawWorkerRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeWorkerRow), error: false };
  } catch {
    return emptyResult();
  }
}

export async function listOrchestratorJobs(limit = 20): Promise<OrquestadorResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_jobs", { p_limit: Math.max(1, Math.min(Math.trunc(limit), 100)) })) as {
      data: RawJobRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeJobRow), error: false };
  } catch {
    return emptyResult();
  }
}

export async function listOrchestratorJobsPage(input: {
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
  limit?: number;
} = {}): Promise<OrquestadorResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_jobs_page", {
      p_before_created_at: input.beforeCreatedAt ?? null,
      p_before_id: input.beforeId ?? null,
      p_limit: Math.max(1, Math.min(Math.trunc(input.limit ?? 50), 100)),
    })) as { data: RawJobRow[] | null; error: { message?: string } | null };

    return error ? emptyResult() : { data: (data ?? []).map(safeJobRow), error: false };
  } catch {
    return emptyResult();
  }
}

export async function getOrchestratorJobById(jobId: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_get_job_by_id", {
      p_job_id: jobId,
    })) as { data: RawJobRow[] | null; error: { message?: string } | null };

    if (error) return singleError();
    const row = data?.[0] ?? null;
    return { data: row ? safeJobRow(row) : null, error: false };
  } catch {
    return singleError();
  }
}
export async function listOrchestratorJobsForGuard(): Promise<OrquestadorResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_jobs", { p_limit: 1000 })) as {
      data: RawJobRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeJobRow), error: false };
  } catch {
    return emptyResult();
  }
}
export async function listOrchestratorEvents(): Promise<OrquestadorResult<OrchestratorEvent>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_events", { p_limit: 50 })) as {
      data: RawEventRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeEventRow), error: false };
  } catch {
    return emptyResult();
  }
}

export async function listOrchestratorJobTypes(): Promise<OrquestadorResult<OrchestratorJobType>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_job_types")) as {
      data: RawJobTypeRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeJobTypeRow), error: false };
  } catch {
    return emptyResult();
  }
}
export async function getOrchestratorJobTechnicalDetail(jobId: string): Promise<OrquestadorSingleResult<JobTechnicalDetailViewModel>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_get_job_technical_detail", {
      p_job_id: jobId,
    })) as {
      data: unknown;
      error: { message?: string } | null;
    };
    if (error) {
      return singleError();
    }

    if (data === null) {
      return { data: null, error: false };
    }

    const row = normalizeJobTechnicalDetailRpcResult(data);

    return row ? { data: mapJobTechnicalDetail(row), error: false } : singleError();
  } catch {
    return singleError();
  }
}
export async function getOrchestratorJobType(jobType: string): Promise<OrquestadorSingleResult<OrchestratorJobType>> {
  const { data, error } = await listOrchestratorJobTypes();

  if (error) {
    return singleError();
  }

  return { data: data.find((item) => item.job_type === jobType) ?? null, error: false };
}

export async function createWorkerHealthCheckJob(requestedBy: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: "worker_health_check",
      p_requested_by: requestedBy,
      p_requested_source: "web",
      p_target_worker_id: null,
      p_priority: 100,
      p_payload: {},
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? { data: null, error: true } : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}

export async function createSourceConnectionCheckJob(requestedBy: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: "source_connection_check",
      p_requested_by: requestedBy,
      p_requested_source: "web",
      p_target_worker_id: null,
      p_priority: 100,
      p_payload: {},
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? singleError() : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}
export async function createBancoReservasLastWeekJob(requestedBy: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: BANCO_RESERVAS_LAST_WEEK_JOB_TYPE,
      p_requested_by: requestedBy,
      p_requested_source: BANCO_RESERVAS_REQUESTED_SOURCE,
      p_target_worker_id: BANCO_RESERVAS_TARGET_WORKER_ID,
      p_priority: BANCO_RESERVAS_PRIORITY,
      p_payload: { modo: BANCO_RESERVAS_LAST_WEEK_MODE },
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? singleError() : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}
export async function createBancoPacksUpdateJob(requestedBy: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: BANCO_PACKS_UPDATE_JOB_TYPE,
      p_requested_by: requestedBy,
      p_requested_source: BANCO_PACKS_REQUESTED_SOURCE,
      p_target_worker_id: BANCO_PACKS_TARGET_WORKER_ID,
      p_priority: BANCO_PACKS_PRIORITY,
      p_payload: { action: BANCO_PACKS_UPDATE_ACTION },
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? singleError() : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}
export async function createDashboardLastMonthJob(requestedBy: string): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: DASHBOARD_LAST_MONTH_JOB_TYPE,
      p_requested_by: requestedBy,
      p_requested_source: DASHBOARD_LAST_MONTH_REQUESTED_SOURCE,
      p_target_worker_id: DASHBOARD_TARGET_WORKER_ID,
      p_priority: DASHBOARD_LAST_MONTH_PRIORITY,
      p_payload: {
        agent: DASHBOARD_LAST_MONTH_AGENT,
        action: DASHBOARD_LAST_MONTH_ACTION,
        periodo: DASHBOARD_LAST_MONTH_PERIOD,
      },
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? singleError() : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}
export async function createCompositeJobStep(input: {
  compositeKind: string;
  compositeRunId: string;
  requestedBy: string;
  sequenceTotal: number;
  step: ActualizarDatosStep;
}): Promise<OrquestadorSingleResult<RawCompositeRunJobRow>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_composite_job_step", {
      p_composite_kind: input.compositeKind,
      p_composite_run_id: input.compositeRunId,
      p_job_type: input.step.jobType,
      p_payload: input.step.payload,
      p_priority: input.step.priority,
      p_requested_by: input.requestedBy,
      p_requested_source: input.step.requestedSource,
      p_sequence_index: input.step.sequenceIndex,
      p_sequence_total: input.sequenceTotal,
      p_target_worker_id: input.step.targetWorkerId,
      p_not_before: new Date().toISOString(),
    })) as {
      data: RawCompositeRunJobRow | null;
      error: { message: string } | null;
    };

    return error || !data ? singleError() : { data, error: false };
  } catch {
    return singleError();
  }
}

function mapOperationalUpdateRpcRows(data: OperationalUpdateRpcRow[] | null): OperationalUpdateRpcResult | null {
  if (!data || data.length === 0) {
    return null;
  }

  return {
    created: data.some((row) => row.created),
    existing: data.some((row) => row.existing),
    rows: data.map(({ created: _created, existing: _existing, ...row }) => row),
  };
}

export async function startOperationalUpdateRun(requestedBy: string): Promise<OrquestadorSingleResult<OperationalUpdateRpcResult>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_start_operational_update", {
      p_not_before: new Date().toISOString(),
      p_requested_by: requestedBy,
    })) as {
      data: OperationalUpdateRpcRow[] | null;
      error: { message: string } | null;
    };

    const result = mapOperationalUpdateRpcRows(data);
    return error || !result ? singleError() : { data: result, error: false };
  } catch {
    return singleError();
  }
}

export async function findActiveOperationalUpdateRunJobs(): Promise<OrquestadorResult<RawCompositeRunJobRow>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_get_active_operational_update_jobs")) as {
      data: RawCompositeRunJobRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: data ?? [], error: false };
  } catch {
    return emptyResult();
  }
}

export async function createOperationalUpdateStepIfMissing(input: {
  compositeRunId: string;
  requestedBy: string;
  step: ActualizarDatosStep;
}): Promise<OrquestadorSingleResult<OperationalUpdateRpcResult>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_operational_update_step_if_missing", {
      p_composite_run_id: input.compositeRunId,
      p_job_type: input.step.jobType,
      p_not_before: new Date().toISOString(),
      p_payload: input.step.payload,
      p_priority: input.step.priority,
      p_requested_by: input.requestedBy,
      p_requested_source: input.step.requestedSource,
      p_sequence_index: input.step.sequenceIndex,
      p_target_worker_id: input.step.targetWorkerId,
    })) as {
      data: OperationalUpdateRpcRow[] | null;
      error: { message: string } | null;
    };

    const result = mapOperationalUpdateRpcRows(data);
    return error || !result ? singleError() : { data: result, error: false };
  } catch {
    return singleError();
  }
}

export async function listCompositeRunJobs(runId: string): Promise<OrquestadorResult<RawCompositeRunJobRow>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_composite_run_jobs", {
      p_composite_run_id: runId,
    })) as {
      data: RawCompositeRunJobRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: data ?? [], error: false };
  } catch {
    return emptyResult();
  }
}

export type RetrySourceJob = {
  id: string;
  jobType: string;
  status: string;
  targetWorkerId: string | null;
  priority: number | null;
  requestedSource: string | null;
  payload: Record<string, unknown>;
  compositeRunId: string | null;
  compositeKind: string | null;
  sequenceIndex: number | null;
  sequenceTotal: number | null;
};

function recoveryCandidate(value: unknown): RecoveryCandidateJob | null {
  if (!isRecord(value)) return null;
  const jobId = typeof value.job_id === "string" ? value.job_id : typeof value.id === "string" ? value.id : null;
  const lockedByWorkerId = typeof value.locked_by_worker_id === "string" ? value.locked_by_worker_id : null;
  if (!jobId || typeof value.status !== "string") return null;
  return { jobId, lockedByWorkerId, status: value.status };
}

function recoveryCandidates(value: unknown) {
  return Array.isArray(value) ? value.map(recoveryCandidate).filter((item): item is RecoveryCandidateJob => Boolean(item)) : [];
}

function mapRecoveryResult(value: unknown): RecoveryResult | null {
  if (!isRecord(value) || typeof value.dry_run !== "boolean") return null;
  return {
    dryRun: value.dry_run,
    workerBefore: isRecord(value.worker_before) ? value.worker_before : null,
    workerAfter: isRecord(value.worker_after) ? value.worker_after : null,
    candidateJobs: recoveryCandidates(value.candidate_jobs),
    updatedJobs: recoveryCandidates(value.updated_jobs),
    eventsInserted: typeof value.events_inserted === "number" ? value.events_inserted : 0,
    activeJobsAfter: typeof value.active_jobs_after === "number" ? value.active_jobs_after : 0,
    message: typeof value.message === "string" ? sanitizeOperationalText(value.message) : null,
  };
}

export async function listOrchestratorJobEvents(jobId: string, limit = 50): Promise<OrquestadorResult<OrchestratorEvent>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_job_events", {
      p_job_id: jobId,
      p_limit: Math.max(1, Math.min(Math.trunc(limit), 200)),
    })) as { data: RawEventRow[] | null; error: { message?: string } | null };
    return error ? emptyResult() : { data: (data ?? []).map(safeEventRow), error: false };
  } catch {
    return emptyResult();
  }
}

export async function recoverOrchestratorStuckWorker(input: {
  workerId: string;
  recentHours: number;
  reason: string;
  dryRun: boolean;
}): Promise<OrquestadorSingleResult<RecoveryResult>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_recover_stuck_worker", {
      p_worker_id: input.workerId,
      p_recent_hours: input.recentHours,
      p_reason: input.reason,
      p_dry_run: input.dryRun,
    })) as { data: unknown; error: { message?: string } | null };
    const result = mapRecoveryResult(data);
    return error || !result ? singleError() : { data: result, error: false };
  } catch {
    return singleError();
  }
}

export async function getOrchestratorJobForRetry(jobId: string): Promise<OrquestadorSingleResult<RetrySourceJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_get_job_for_retry", { p_job_id: jobId })) as {
      data: unknown;
      error: { message?: string } | null;
    };
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !isRecord(row) || typeof row.id !== "string" || typeof row.job_type !== "string" || typeof row.status !== "string" || !isRecord(row.payload)) {
      return singleError();
    }
    return {
      data: {
        id: row.id,
        jobType: row.job_type,
        status: row.status,
        targetWorkerId: typeof row.target_worker_id === "string" ? row.target_worker_id : null,
        priority: typeof row.priority === "number" ? row.priority : null,
        requestedSource: typeof row.requested_source === "string" ? row.requested_source : null,
        payload: row.payload,
        compositeRunId: typeof row.composite_run_id === "string" ? row.composite_run_id : null,
        compositeKind: typeof row.composite_kind === "string" ? row.composite_kind : null,
        sequenceIndex: typeof row.sequence_index === "number" ? row.sequence_index : null,
        sequenceTotal: typeof row.sequence_total === "number" ? row.sequence_total : null,
      },
      error: false,
    };
  } catch {
    return singleError();
  }
}
export async function createRetryOrchestratorJob(input: {
  source: RetrySourceJob;
  requestedBy: string;
}): Promise<OrquestadorSingleResult<OrchestratorJob>> {
  if (input.source.priority === null) return singleError();
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_create_job", {
      p_job_type: input.source.jobType,
      p_requested_by: input.requestedBy,
      p_requested_source: "retry_web_orchestrator",
      p_target_worker_id: input.source.targetWorkerId,
      p_priority: input.source.priority,
      p_payload: input.source.payload,
      p_not_before: new Date().toISOString(),
    })) as { data: RawJobRow | null; error: { message?: string } | null };
    return error || !data ? singleError() : { data: safeJobRow(data), error: false };
  } catch {
    return singleError();
  }
}
export async function getOperationalDashboardRpcData(query: OperationalDashboardQuery): Promise<OrquestadorSingleResult<unknown>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_dashboard_get_operacional", {
      p_from: query.from,
      p_to: query.to,
      p_date: query.date,
      p_parking_codigo: query.parking_codigo,
      p_sistema_grupo: query.sistema_grupo,
      p_source_run_id: query.source_run_id,
    })) as {
      data: unknown;
      error: { message: string } | null;
    };

    return error ? singleError() : { data, error: false };
  } catch {
    return singleError();
  }
}

async function getOccupancyRpcData(
  rpcName: "orchestrator_ocupacion_list_fisica" | "orchestrator_ocupacion_list_comercial",
  from: string,
  to: string,
): Promise<OrquestadorResult<unknown>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const data = await collectOccupancyRpcPages<unknown>(async (rangeFrom, rangeTo) => {
      const result = await supabase.rpc(rpcName, { p_desde: from, p_hasta: to }).range(rangeFrom, rangeTo);
      return { data: result.data as unknown[] | null, error: result.error };
    });
    return data === null ? emptyResult() : { data, error: false };
  } catch {
    return emptyResult();
  }
}

export async function getPhysicalOccupancyRpcData(from: string, to: string): Promise<OrquestadorResult<unknown>> {
  return getOccupancyRpcData("orchestrator_ocupacion_list_fisica", from, to);
}

export async function getCommercialOccupancyRpcData(from: string, to: string): Promise<OrquestadorResult<unknown>> {
  return getOccupancyRpcData("orchestrator_ocupacion_list_comercial", from, to);
}
