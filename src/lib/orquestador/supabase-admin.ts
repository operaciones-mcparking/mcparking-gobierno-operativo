import "server-only";

import { createClient } from "@supabase/supabase-js";
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

function emptyResult<T>(): OrquestadorResult<T> {
  return { data: [], error: true };
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