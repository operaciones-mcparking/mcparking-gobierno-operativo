import { createSupabaseServerClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import type {
  CountryContextOption,
  SiteContextOption,
} from "@/components/dashboard/context-selector";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export type DashboardContext = {
  countryId?: string | null;
  siteId?: string | null;
};

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

export type ActiveRoleBottleneck = RoleBottleneck & {
  role_status: string;
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

export type ActivePersonBottleneck = PersonBottleneck & {
  person_status: string;
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
  process_type: "strategic" | "operational" | "support";
  criticality: string;
  status: string;
  documentation_status: string;
  is_replicable: boolean;
  is_global: boolean;
  area_name: string | null;
  company_name: string;
  owner_company_id: string | null;
  owner_company_name: string;
  operating_company_id: string | null;
  operating_company_name: string | null;
  country_id: string | null;
  country_name: string | null;
  country_code: string | null;
  owner_site_id: string | null;
  owner_site_name: string | null;
  operating_site_id: string | null;
  operating_site_name: string | null;
  owner_company_type: string | null;
  operating_company_type: string | null;
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

export type ProcessStageOwnerRole = {
  process_id: string;
  subprocess_id: string;
  role_id: string;
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
  provider_company_type: string | null;
  client_company_type: string | null;
  provider_country_name: string | null;
  provider_country_code: string | null;
  client_country_name: string | null;
  client_country_code: string | null;
};

export type RoleDictionaryItem = {
  role_id: string;
  role_code: string | null;
  role_name: string;
  role_description: string | null;
  role_level: string;
  responsibilities: string[] | null;
  is_corporate: boolean;
  is_local: boolean;
  sort_order: number | null;
  org_parent_role_id: string | null;
  org_parent_role_name: string | null;
  org_parent_role_code: string | null;
  org_column: number | null;
  org_row: number | null;
  role_status: string;
  area_id: string | null;
  area_name: string | null;
  company_id: string | null;
  company_name: string | null;
  country_id: string | null;
  country_name: string | null;
  country_code: string | null;
  site_id: string | null;
  site_name: string | null;
  current_person_id: string | null;
  current_person_name: string | null;
};

export type AreaDirectoryItem = {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  country_id: string | null;
};

export type PersonDirectoryItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  country_id: string | null;
  site_id: string | null;
};

export type RoleGovernanceProcessItem = {
  role_id: string;
  process_key: string;
  status: string;
};

export type RoleAccessSuggestion = {
  id: string;
  role_id: string;
  role_name: string;
  role_code: string | null;
  area_id: string | null;
  company_id: string | null;
  company_name: string | null;
  role_country_id: string | null;
  role_site_id: string | null;
  access_role_id: string;
  access_role_name: string;
  access_role_code: string;
  scope_type: "global" | "country" | "company" | "site";
  notes: string | null;
  status: string;
};

export type RecoveryImportHistoryItem = {
  id: string;
  file_name: string;
  import_type: string;
  status: string;
  rows_total: number;
  imported_rows: number;
  valid_purchase_rows: number;
  valid_purchase_amount: number;
  created_at: string;
  confirmed_at: string | null;
};

export type RecoveryAttributionKpis = {
  high_confidence_cases: number;
  low_confidence_cases: number;
  medium_confidence_cases: number;
  monto_24h: number;
  monto_48h: number;
  monto_7d: number;
  recuperados_24h: number;
  recuperados_48h: number;
  recuperados_7d: number;
  tasa_7d: number;
  total_carritos: number;
};

export type RecoveryAttributionBreakdownItem = {
  label: string;
  amount: number;
  count: number;
  percentage?: number;
  recovery_rate?: number;
  segment_total?: number;
};

export type RecoveryAttributionBreakdown = {
  by_confidence: RecoveryAttributionBreakdownItem[];
  by_parking: RecoveryAttributionBreakdownItem[];
  by_type: RecoveryAttributionBreakdownItem[];
  total_recovered: number;
};

export type RecentRecoveryAttributionCase = {
  cart_form_datetime: string | null;
  cart_type: string | null;
  confidence: string | null;
  email: string | null;
  hours_to_purchase: number | null;
  match_type: string | null;
  message_sent: boolean | null;
  parking_code: string | null;
  phone: string | null;
  purchase_amount: number | null;
  purchase_created_at: string | null;
  recovered_24h: boolean | null;
  recovered_48h: boolean | null;
  recovered_7d: boolean | null;
};

export type RecoveryCartAuditRow = {
  cart_form_datetime: string | null;
  cart_type: string | null;
  confidence: string | null;
  email: string | null;
  hours_to_purchase: number | null;
  message_sent: boolean | null;
  parking_code: string | null;
  phone: string | null;
  purchase_amount: number | null;
  purchase_created_at: string | null;
  recovered: boolean;
};

export async function getOperationalContextOptions() {
  noStore();

  const supabase = createSupabaseServerClient();
  const authSupabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  const [countries, sites] = await Promise.all([
    supabase.from("countries").select("id,name,code").order("name"),
    supabase
      .from("sites")
      .select("id,name,city,site_type,country_id,companies(name)")
      .neq("site_type", "client_site")
      .order("name"),
  ]);

  let allowedSiteIds: Set<string> | null = null;

  if (user) {
    const { data: profile } = await authSupabase
      .from("user_profiles")
      .select("app_role,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      allowedSiteIds = new Set();
    } else if (profile.app_role !== "admin") {
      const { data: accessRows } = await authSupabase
        .from("user_site_access")
        .select("site_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      allowedSiteIds = new Set((accessRows ?? []).map((row) => row.site_id).filter(Boolean));
    }
  }

  const mappedSites = (sites.data ?? [])
    .filter((site) => !allowedSiteIds || allowedSiteIds.has(site.id))
    .map((site) => {
      const company = Array.isArray(site.companies) ? site.companies[0] : site.companies;

      return {
        city: site.city ?? null,
        company_name: company?.name ?? null,
        country_id: site.country_id ?? null,
        id: site.id,
        name: site.name,
        site_type: site.site_type ?? null,
      };
    });

  const visibleCountryIds = new Set(mappedSites.map((site) => site.country_id).filter(Boolean));
  const mappedCountries = allowedSiteIds
    ? (countries.data ?? []).filter((country) => visibleCountryIds.has(country.id))
    : (countries.data ?? []);

  return {
    countries: mappedCountries as CountryContextOption[],
    error: countries.error ?? sites.error,
    sites: mappedSites as SiteContextOption[],
  };
}

export async function getProcessCatalog(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("v_process_catalog")
    .select("*")
    .order("criticality", { ascending: true })
    .order("process_name");

  if (context.countryId) {
    query = query.eq("country_id", context.countryId);
  }

  if (context.siteId) {
    query = query.or(`owner_site_id.eq.${context.siteId},operating_site_id.eq.${context.siteId}`);
  }

  const { data, error } = await query;

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

export async function getProcessStageOwnerRoles(processIds: string[] = []) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("process_roles")
    .select("process_id,subprocess_id,role_id")
    .eq("responsibility_type", "owner")
    .not("subprocess_id", "is", null);

  if (processIds.length > 0) {
    query = query.in("process_id", processIds);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as ProcessStageOwnerRole[], error };
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

export async function getActiveRoleBottlenecks() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_active_role_bottlenecks")
    .select("*")
    .order("critical_process_count", { ascending: false })
    .order("process_count", { ascending: false })
    .order("role_name");

  return { data: (data ?? []) as ActiveRoleBottleneck[], error };
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

export async function getActivePersonBottlenecks() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_active_person_bottlenecks")
    .select("*")
    .order("critical_process_count", { ascending: false })
    .order("role_count", { ascending: false })
    .order("person_name");

  return { data: (data ?? []) as ActivePersonBottleneck[], error };
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

export async function getRoleDictionary(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("v_role_dictionary")
    .select("*")
    .order("sort_order", { nullsFirst: false })
    .order("role_name");

  if (context.countryId) {
    query = query.or(`country_id.is.null,country_id.eq.${context.countryId}`);
  }

  if (context.siteId) {
    query = query.or(`site_id.is.null,site_id.eq.${context.siteId}`);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as RoleDictionaryItem[], error };
}

export async function getArchivedRoleDictionary(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();
  const { data: roles, error } = await supabase
    .from("roles")
    .select(
      "id,role_code,name,description,level,responsibilities,is_corporate,is_local,sort_order,org_parent_role_id,org_column,org_row,status,area_id,country_id,site_id",
    )
    .eq("status", "archived")
    .order("sort_order", { nullsFirst: false })
    .order("name");

  if (error) {
    return { data: [] as RoleDictionaryItem[], error };
  }

  const roleRows = roles ?? [];
  const areaIds = Array.from(
    new Set(roleRows.map((role) => role.area_id).filter((id): id is string => Boolean(id))),
  );
  const siteIds = Array.from(
    new Set(roleRows.map((role) => role.site_id).filter((id): id is string => Boolean(id))),
  );
  const roleIds = roleRows.map((role) => role.id);

  const [areasResult, sitesResult, assignmentsResult] = await Promise.all([
    areaIds.length > 0
      ? supabase
          .from("areas")
          .select("id,name,company_id,companies(id,name,country_id)")
          .in("id", areaIds)
      : Promise.resolve({ data: [], error: null }),
    siteIds.length > 0
      ? supabase.from("sites").select("id,name").in("id", siteIds)
      : Promise.resolve({ data: [], error: null }),
    roleIds.length > 0
      ? supabase
          .from("person_roles")
          .select("role_id,person_id,created_at,people(id,name)")
          .in("role_id", roleIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (areasResult.error) return { data: [] as RoleDictionaryItem[], error: areasResult.error };
  if (sitesResult.error) return { data: [] as RoleDictionaryItem[], error: sitesResult.error };
  if (assignmentsResult.error) return { data: [] as RoleDictionaryItem[], error: assignmentsResult.error };

  const areaMap = new Map((areasResult.data ?? []).map((area) => [area.id, area]));
  const siteMap = new Map((sitesResult.data ?? []).map((site) => [site.id, site]));
  const assignmentMap = new Map<string, { person_id: string | null; person_name: string | null }>();

  for (const assignment of assignmentsResult.data ?? []) {
    if (!assignment.role_id || assignmentMap.has(assignment.role_id)) continue;

    const person = Array.isArray(assignment.people) ? assignment.people[0] : assignment.people;
    assignmentMap.set(assignment.role_id, {
      person_id: assignment.person_id ?? null,
      person_name: person?.name ?? null,
    });
  }

  const mapped = roleRows
    .map((role) => {
      const area = role.area_id ? areaMap.get(role.area_id) : null;
      const company = Array.isArray(area?.companies) ? area?.companies[0] : area?.companies;
      const site = role.site_id ? siteMap.get(role.site_id) : null;
      const assignment = assignmentMap.get(role.id);
      const countryId = role.country_id ?? company?.country_id ?? null;

      return {
        area_id: role.area_id,
        area_name: area?.name ?? null,
        company_id: company?.id ?? null,
        company_name: company?.name ?? null,
        country_code: null,
        country_id: countryId,
        country_name: null,
        current_person_id: assignment?.person_id ?? null,
        current_person_name: assignment?.person_name ?? null,
        is_corporate: Boolean(role.is_corporate),
        is_local: Boolean(role.is_local),
        org_column: role.org_column,
        org_parent_role_code: null,
        org_parent_role_id: role.org_parent_role_id,
        org_parent_role_name: null,
        org_row: role.org_row,
        responsibilities: role.responsibilities ?? [],
        role_code: role.role_code,
        role_description: role.description,
        role_id: role.id,
        role_level: role.level,
        role_name: role.name,
        role_status: role.status,
        site_id: role.site_id,
        site_name: site?.name ?? null,
        sort_order: role.sort_order,
      } satisfies RoleDictionaryItem;
    })
    .filter((role) => {
      if (context.countryId && role.country_id && role.country_id !== context.countryId) return false;
      if (context.siteId && role.site_id && role.site_id !== context.siteId) return false;
      return true;
    });

  return { data: mapped, error: null };
}

export async function getRoleAccessSuggestions(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("v_functional_role_access_suggestions")
    .select("*")
    .eq("status", "active")
    .order("role_name")
    .order("access_role_name");

  if (context.countryId) {
    query = query.or(`role_country_id.is.null,role_country_id.eq.${context.countryId}`);
  }

  if (context.siteId) {
    query = query.or(`role_site_id.is.null,role_site_id.eq.${context.siteId}`);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as RoleAccessSuggestion[], error };
}

export async function getAreaDirectory(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();

  let siteCompanyId: string | null = null;

  if (context.siteId) {
    const { data: site } = await supabase
      .from("sites")
      .select("company_id")
      .eq("id", context.siteId)
      .maybeSingle();

    siteCompanyId = site?.company_id ?? null;
  }

  let query = supabase
    .from("areas")
    .select("id,name,company_id,companies!inner(name,country_id)")
    .order("name");

  if (context.countryId) {
    query = query.eq("companies.country_id", context.countryId);
  }

  if (siteCompanyId) {
    query = query.eq("company_id", siteCompanyId);
  }

  const { data, error } = await query;

  const mapped = (data ?? []).map((area) => {
    const company = Array.isArray(area.companies) ? area.companies[0] : area.companies;
    return {
      company_id: area.company_id ?? null,
      country_id: company?.country_id ?? null,
      company_name: company?.name ?? null,
      id: area.id,
      name: area.name,
    };
  }) as AreaDirectoryItem[];

  return { data: mapped, error };
}

export async function getPersonDirectory(context: DashboardContext = {}) {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("people")
    .select("id,name,email,phone,status,country_id,site_id")
    .order("name");

  if (context.countryId) {
    query = query.or(`country_id.is.null,country_id.eq.${context.countryId}`);
  }

  if (context.siteId) {
    query = query.or(`site_id.is.null,site_id.eq.${context.siteId}`);
  }

  const { data, error } = await query;

  return { data: (data ?? []) as PersonDirectoryItem[], error };
}

export async function getRoleGovernanceProcesses() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_governance_processes")
    .select("role_id,process_key,status")
    .eq("status", "active");

  return { data: (data ?? []) as RoleGovernanceProcessItem[], error };
}

export async function getRecoveryImportHistory(limit = 10) {
  noStore();

  const supabase = await createSupabaseAuthServerClient();
  const { data: batches, error: batchesError } = await supabase
    .from("recovery_import_batches")
    .select("id,import_type,file_name,status,rows_total,valid_purchase_rows,valid_purchase_amount,created_at,confirmed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (batchesError) {
    return { data: [] as RecoveryImportHistoryItem[], error: batchesError };
  }

  const importedRowsByBatch = new Map<string, number>();

  if ((batches ?? []).length > 0) {
    const importedRowCounts = await Promise.all(
      (batches ?? []).map(async (batch) => {
        const table =
          batch.import_type === "incomplete_bookings_csv"
            ? "recovery_incomplete_bookings_import"
            : "recovery_bookings_import";
        const { count, error } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("batch_id", batch.id);

        return { batchId: batch.id, count: count ?? 0, error };
      }),
    );

    const importedRowsError = importedRowCounts.find((result) => result.error)?.error;

    if (importedRowsError) {
      return { data: [] as RecoveryImportHistoryItem[], error: importedRowsError };
    }

    for (const result of importedRowCounts) {
      importedRowsByBatch.set(result.batchId, result.count);
    }
  }

  const data = (batches ?? []).map((batch) => ({
    confirmed_at: batch.confirmed_at,
    created_at: batch.created_at,
    file_name: batch.file_name,
    id: batch.id,
    import_type: batch.import_type,
    imported_rows: importedRowsByBatch.get(batch.id) ?? 0,
    rows_total: batch.rows_total,
    status: batch.status,
    valid_purchase_amount: Number(batch.valid_purchase_amount ?? 0),
    valid_purchase_rows: batch.valid_purchase_rows,
  }));

  return { data, error: null };
}

export async function getRecoveryAttributionKpis() {
  noStore();

  const supabase = await createSupabaseAuthServerClient();
  const [
    { count: totalCarts, error: totalCartsError },
    { data: attributionCases, error: attributionError },
  ] = await Promise.all([
    supabase
      .from("recovery_incomplete_bookings_import")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("v_recovery_attribution_cases")
      .select("recovered_24h,recovered_48h,recovered_7d,purchase_amount,confidence"),
  ]);

  if (totalCartsError) {
    return { data: null as RecoveryAttributionKpis | null, error: totalCartsError };
  }

  if (attributionError) {
    return { data: null as RecoveryAttributionKpis | null, error: attributionError };
  }

  const cases = attributionCases ?? [];
  const recuperados24h = cases.filter((item) => item.recovered_24h).length;
  const recuperados48h = cases.filter((item) => item.recovered_48h).length;
  const recuperados7d = cases.filter((item) => item.recovered_7d).length;
  const monto24h = cases.reduce(
    (total, item) => total + (item.recovered_24h ? Number(item.purchase_amount ?? 0) : 0),
    0,
  );
  const monto48h = cases.reduce(
    (total, item) => total + (item.recovered_48h ? Number(item.purchase_amount ?? 0) : 0),
    0,
  );
  const monto7d = cases.reduce((total, item) => total + Number(item.purchase_amount ?? 0), 0);
  const totalCarritos = totalCarts ?? 0;

  return {
    data: {
      high_confidence_cases: cases.filter((item) => item.confidence === "high").length,
      low_confidence_cases: cases.filter((item) => item.confidence === "low").length,
      medium_confidence_cases: cases.filter((item) => item.confidence === "medium").length,
      monto_24h: monto24h,
      monto_48h: monto48h,
      monto_7d: monto7d,
      recuperados_24h: recuperados24h,
      recuperados_48h: recuperados48h,
      recuperados_7d: recuperados7d,
      tasa_7d: totalCarritos > 0 ? (recuperados7d / totalCarritos) * 100 : 0,
      total_carritos: totalCarritos,
    },
    error: null,
  };
}

export async function getRecoveryAttributionBreakdown() {
  noStore();

  const supabase = await createSupabaseAuthServerClient();
  const [
    { data: attributionCases, error: attributionError },
    { data: cartSegments, error: cartSegmentsError },
  ] = await Promise.all([
    supabase
      .from("v_recovery_attribution_cases")
      .select("cart_type,parking_code,purchase_amount,confidence"),
    supabase
      .from("recovery_incomplete_bookings_import")
      .select("type,parking_code"),
  ]);

  if (attributionError) {
    return { data: null as RecoveryAttributionBreakdown | null, error: attributionError };
  }

  if (cartSegmentsError) {
    return { data: null as RecoveryAttributionBreakdown | null, error: cartSegmentsError };
  }

  const cases = attributionCases ?? [];
  const carts = cartSegments ?? [];
  const totalRecovered = cases.length;
  const totalsByType = new Map<string, number>();
  const totalsByParking = new Map<string, number>();

  for (const cart of carts) {
    const typeKey = cart.type ?? "Sin tipo";
    const parkingKey = cart.parking_code ?? "Sin parking";
    totalsByType.set(typeKey, (totalsByType.get(typeKey) ?? 0) + 1);
    totalsByParking.set(parkingKey, (totalsByParking.get(parkingKey) ?? 0) + 1);
  }

  function buildGroup(
    keyForCase: (item: (typeof cases)[number]) => string,
    preferredOrder: string[] = [],
    segmentTotals?: Map<string, number>,
  ): RecoveryAttributionBreakdownItem[] {
    const grouped = new Map<string, { amount: number; count: number }>();

    for (const item of cases) {
      const key = keyForCase(item);
      const current = grouped.get(key) ?? { amount: 0, count: 0 };
      current.amount += Number(item.purchase_amount ?? 0);
      current.count += 1;
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([label, value]) => {
        const segmentTotal = segmentTotals?.get(label);

        return {
          amount: value.amount,
          count: value.count,
          label,
          percentage: totalRecovered > 0 ? (value.count / totalRecovered) * 100 : 0,
          recovery_rate: segmentTotal && segmentTotal > 0 ? (value.count / segmentTotal) * 100 : undefined,
          segment_total: segmentTotal,
        };
      })
      .sort((left, right) => {
        const leftIndex = preferredOrder.indexOf(left.label);
        const rightIndex = preferredOrder.indexOf(right.label);

        if (leftIndex !== -1 || rightIndex !== -1) {
          return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
        }

        return right.count - left.count;
      });
  }

  return {
    data: {
      by_confidence: buildGroup((item) => item.confidence ?? "Sin confianza", ["high", "medium", "low"]),
      by_parking: buildGroup((item) => item.parking_code ?? "Sin parking", [], totalsByParking),
      by_type: buildGroup((item) => item.cart_type ?? "Sin tipo", ["abandoned", "canceled"], totalsByType),
      total_recovered: totalRecovered,
    },
    error: null,
  };
}

export async function getRecentRecoveryAttributionCases(limit = 20) {
  noStore();

  type AttributionCaseRow = RecentRecoveryAttributionCase & {
    cart_id: string | null;
    purchase_id: string | null;
  };

  type ContactRow = {
    email_normalized: string | null;
    id: string;
    phone_normalized: string | null;
  };

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase
    .from("v_recovery_attribution_cases")
    .select(
      "cart_id,purchase_id,cart_type,parking_code,message_sent,cart_form_datetime,purchase_created_at,purchase_amount,hours_to_purchase,confidence,match_type,recovered_24h,recovered_48h,recovered_7d",
    )
    .order("purchase_created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [] as RecentRecoveryAttributionCase[], error };
  }

  const rows = (data ?? []) as AttributionCaseRow[];
  const cartIds = Array.from(new Set(rows.map((item) => item.cart_id).filter(Boolean))) as string[];
  const purchaseIds = Array.from(new Set(rows.map((item) => item.purchase_id).filter(Boolean))) as string[];

  const [cartContactsResult, purchaseContactsResult] = await Promise.all([
    cartIds.length > 0
      ? supabase
          .from("recovery_incomplete_bookings_import")
          .select("id,email_normalized,phone_normalized")
          .in("id", cartIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null }),
    purchaseIds.length > 0
      ? supabase
          .from("recovery_bookings_import")
          .select("id,email_normalized,phone_normalized")
          .in("id", purchaseIds)
      : Promise.resolve({ data: [] as ContactRow[], error: null }),
  ]);

  if (cartContactsResult.error) {
    return { data: [] as RecentRecoveryAttributionCase[], error: cartContactsResult.error };
  }

  if (purchaseContactsResult.error) {
    return { data: [] as RecentRecoveryAttributionCase[], error: purchaseContactsResult.error };
  }

  const cartContacts = new Map(
    ((cartContactsResult.data ?? []) as ContactRow[]).map((item) => [item.id, item]),
  );
  const purchaseContacts = new Map(
    ((purchaseContactsResult.data ?? []) as ContactRow[]).map((item) => [item.id, item]),
  );

  const enrichedRows = rows.map((item) => {
    const cartContact = item.cart_id ? cartContacts.get(item.cart_id) : undefined;
    const purchaseContact = item.purchase_id ? purchaseContacts.get(item.purchase_id) : undefined;
    const { cart_id: _cartId, purchase_id: _purchaseId, ...safeItem } = item;

    return {
      ...safeItem,
      email: cartContact?.email_normalized ?? purchaseContact?.email_normalized ?? null,
      phone: cartContact?.phone_normalized ?? purchaseContact?.phone_normalized ?? null,
    };
  });

  return { data: enrichedRows, error: null };
}

export async function getRecoveryCartAuditRows(limit = 300) {
  noStore();

  type CartAuditSourceRow = {
    email_normalized: string | null;
    form_datetime: string | null;
    id: string;
    message_sent: boolean | null;
    parking_code: string | null;
    phone_normalized: string | null;
    type: string | null;
  };

  type AttributionByCartRow = {
    cart_id: string | null;
    confidence: string | null;
    hours_to_purchase: number | null;
    purchase_amount: number | null;
    purchase_created_at: string | null;
  };

  const supabase = await createSupabaseAuthServerClient();
  const { data: carts, error: cartsError } = await supabase
    .from("recovery_incomplete_bookings_import")
    .select("id,type,email_normalized,phone_normalized,parking_code,message_sent,form_datetime")
    .order("form_datetime", { ascending: false })
    .limit(limit);

  if (cartsError) {
    return { data: [] as RecoveryCartAuditRow[], error: cartsError };
  }

  const cartRows = (carts ?? []) as CartAuditSourceRow[];
  const cartIds = Array.from(new Set(cartRows.map((item) => item.id).filter(Boolean)));

  const { data: attributions, error: attributionsError } =
    cartIds.length > 0
      ? await supabase
          .from("v_recovery_attribution_cases")
          .select("cart_id,purchase_created_at,purchase_amount,hours_to_purchase,confidence")
          .in("cart_id", cartIds)
      : { data: [] as AttributionByCartRow[], error: null };

  if (attributionsError) {
    return { data: [] as RecoveryCartAuditRow[], error: attributionsError };
  }

  const attributionsByCartId = new Map(
    ((attributions ?? []) as AttributionByCartRow[])
      .filter((item) => item.cart_id)
      .map((item) => [item.cart_id as string, item]),
  );

  const auditRows = cartRows.map((cart) => {
    const attribution = attributionsByCartId.get(cart.id);

    return {
      cart_form_datetime: cart.form_datetime,
      cart_type: cart.type,
      confidence: attribution?.confidence ?? null,
      email: cart.email_normalized,
      hours_to_purchase: attribution?.hours_to_purchase ?? null,
      message_sent: cart.message_sent,
      parking_code: cart.parking_code,
      phone: cart.phone_normalized,
      purchase_amount: attribution?.purchase_amount ?? null,
      purchase_created_at: attribution?.purchase_created_at ?? null,
      recovered: Boolean(attribution),
    };
  });

  return { data: auditRows, error: null };
}
