import "server-only";

import { createClient } from "@supabase/supabase-js";
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
  type OrchestratorEvent,
  type OrchestratorJob,
  type OrchestratorJobType,
  type OrchestratorWorker,
  type RawEventRow,
  type RawJobRow,
  type RawJobTypeRow,
  type RawWorkerRow,
} from "@/lib/orquestador/types";

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

export async function listOrchestratorJobs(): Promise<OrquestadorResult<OrchestratorJob>> {
  try {
    const supabase = createOrquestadorSupabaseAdminClient();
    const { data, error } = (await supabase.rpc("orchestrator_list_jobs", { p_limit: 20 })) as {
      data: RawJobRow[] | null;
      error: { message: string } | null;
    };

    return error ? emptyResult() : { data: (data ?? []).map(safeJobRow), error: false };
  } catch {
    return emptyResult();
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
