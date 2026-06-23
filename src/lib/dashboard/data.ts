import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProcessGap = {
  process_id: string;
  process_name: string;
  criticality: string;
  documentation_status: string;
  missing_owner_role: boolean;
  missing_owner_person: boolean;
  missing_backup_role: boolean;
  documentation_gap: boolean;
};

export type ProcessResponsibility = {
  process_id: string;
  process_name: string;
  subprocess_name: string | null;
  responsibility_type: string;
  role_name: string;
  current_person_name: string | null;
  responsibility_criticality: string;
  impact_percent: number | null;
};

export type RoleBottleneck = {
  role_id: string;
  role_name: string;
  role_level: string;
  is_corporate: boolean;
  is_local: boolean;
  process_count: number;
  critical_process_count: number;
  owner_responsibility_count: number;
  approver_responsibility_count: number;
  system_count: number;
  missing_backup_person: boolean;
};

export type PersonBottleneck = {
  person_id: string;
  person_name: string;
  role_count: number;
  process_count: number;
  critical_process_count: number;
  system_count: number;
  backup_assignment_count: number;
};

export type ProcessSystem = {
  process_id: string;
  process_name: string;
  subprocess_name: string | null;
  system_id: string;
  system_name: string;
  system_status: string;
  owner_role_name: string | null;
  owner_person_name: string | null;
  notes: string | null;
};

export type ProcessCatalogItem = {
  process_id: string;
  process_name: string;
  definition: string | null;
  objective: string | null;
  expected_result: string | null;
  criticality: string;
  status: string;
  documentation_status: string;
  is_replicable: boolean;
  is_global: boolean;
  area_name: string | null;
  company_name: string;
  owner_company_name: string;
  operating_company_name: string | null;
  subprocess_count: number;
  responsibility_count: number;
  system_count: number;
};

export type ProcessMatrixRow = {
  process_id: string;
  process_name: string;
  owner_company_name: string | null;
  operating_company_name: string | null;
  subprocess_id: string;
  subprocess_name: string;
  subprocess_description: string | null;
  sort_order: number | null;
  criticality: string;
  owner_role_name: string | null;
  owner_role_company_name: string | null;
  owner_person_name: string | null;
  user_role_name: string | null;
  user_role_company_name: string | null;
  user_person_name: string | null;
  support_role_name: string | null;
  support_role_company_name: string | null;
  support_person_name: string | null;
  impact_percent: number | null;
  backup_role_name: string | null;
  backup_role_company_name: string | null;
  backup_person_name: string | null;
  systems: string | null;
  risks: string | null;
  controls: string | null;
};

export type ProcessBottleneck = {
  process_id: string;
  process_name: string;
  alert_type: string;
  subject_name: string;
  impact_percent: number;
  is_gap: boolean;
};

export type CompanyServiceNetworkRow = {
  provider_company_id: string;
  provider_company_name: string;
  client_company_id: string;
  client_company_name: string;
  relationship_type: string;
  relationship_description: string | null;
  relationship_status: string;
  process_count: number;
  processes: string | null;
};

export async function getProcessCatalog() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_process_catalog")
    .select("*")
    .order("criticality", { ascending: true })
    .order("process_name");

  return { data: (data ?? []) as ProcessCatalogItem[], error };
}

export async function getProcessCatalogItem(processId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_process_catalog")
    .select("*")
    .eq("process_id", processId)
    .maybeSingle();

  return { data: data as ProcessCatalogItem | null, error };
}

export async function getProcessMatrix(processId?: string) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("v_process_subprocess_matrix")
    .select("*")
    .order("process_name")
    .order("sort_order", { nullsFirst: false })
    .order("subprocess_name");

  if (processId) {
    query = query.eq("process_id", processId);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as ProcessMatrixRow[], error };
}

export async function getProcessBottlenecks(processId?: string) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("v_process_bottlenecks")
    .select("*")
    .order("alert_type")
    .order("impact_percent", { ascending: false });

  if (processId) {
    query = query.eq("process_id", processId);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as ProcessBottleneck[], error };
}

export async function getProcessGaps() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_process_gaps")
    .select("*")
    .order("process_name");

  return { data: (data ?? []) as ProcessGap[], error };
}

export async function getProcessResponsibilities() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_process_responsibilities")
    .select(
      "process_id, process_name, subprocess_name, responsibility_type, role_name, current_person_name, responsibility_criticality, impact_percent",
    )
    .order("process_name")
    .order("subprocess_name")
    .order("responsibility_type");

  return { data: (data ?? []) as ProcessResponsibility[], error };
}

export async function getRoleBottlenecks() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_role_bottlenecks")
    .select("*")
    .order("critical_process_count", { ascending: false })
    .order("process_count", { ascending: false })
    .order("role_name");

  return { data: (data ?? []) as RoleBottleneck[], error };
}

export async function getPersonBottlenecks() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_person_bottlenecks")
    .select("*")
    .order("critical_process_count", { ascending: false })
    .order("role_count", { ascending: false })
    .order("person_name");

  return { data: (data ?? []) as PersonBottleneck[], error };
}

export async function getProcessSystems() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_process_systems")
    .select("*")
    .order("process_name")
    .order("subprocess_name")
    .order("system_name");

  return { data: (data ?? []) as ProcessSystem[], error };
}

export async function getCompanyServiceNetwork() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_company_service_network")
    .select("*")
    .order("provider_company_name")
    .order("client_company_name");

  return { data: (data ?? []) as CompanyServiceNetworkRow[], error };
}
