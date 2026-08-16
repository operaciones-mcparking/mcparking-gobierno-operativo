import "server-only";

import type {
  ProcessMasterControl,
  ProcessMasterMetric,
  ProcessMasterResponsibleRole,
  ProcessMasterRisk,
} from "@/app/procesos/process-master/process-master-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RoleAssignmentRow = {
  role_id: string;
  sort_order: number | null;
};

type OfficialRoleRow = {
  company_id: string;
  role_id: string;
  role_name: string;
};

async function getResponsibleRoleMap(
  assignmentsByParent: Map<string, RoleAssignmentRow[]>,
  companyId: string,
) {
  const roleIds = [...new Set([...assignmentsByParent.values()].flatMap((rows) => rows.map((row) => row.role_id)))];
  if (!roleIds.length) return new Map<string, ProcessMasterResponsibleRole[]>();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("v_role_dictionary")
    .select("role_id,role_name,company_id")
    .in("role_id", roleIds)
    .eq("role_status", "active")
    .eq("company_id", companyId);
  if (error) throw new Error("No se pudieron cargar los roles responsables oficiales.");

  const roleById = new Map(((data ?? []) as OfficialRoleRow[]).map((role) => [role.role_id, role.role_name]));
  return new Map(
    [...assignmentsByParent.entries()].map(([parentId, rows]) => [
      parentId,
      rows
        .flatMap((row): ProcessMasterResponsibleRole[] => {
          const roleName = roleById.get(row.role_id);
          return roleName ? [{ role_id: row.role_id, role_name: roleName, sort_order: row.sort_order ?? 0 }] : [];
        })
        .sort((left, right) => left.sort_order - right.sort_order || left.role_name.localeCompare(right.role_name)),
    ]),
  );
}

export async function getProcessMetricsForMaster(processId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: processRow, error: processError } = await supabase.from("processes").select("company_id").eq("id", processId).maybeSingle();
  if (processError || !processRow) return { data: [] as ProcessMasterMetric[], error: new Error("No se pudo validar la empresa del proceso.") };
  const { data: metricRows, error: metricError } = await supabase
    .from("metrics")
    .select("id,name,formula,target,frequency,owner_role_id,sort_order")
    .eq("process_id", processId)
    .is("subprocess_id", null)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (metricError) return { data: [] as ProcessMasterMetric[], error: new Error("No se pudieron cargar los indicadores.") };

  const metricIds = (metricRows ?? []).map((row) => row.id as string);
  const assignmentsByMetric = new Map<string, RoleAssignmentRow[]>();
  if (metricIds.length) {
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("metric_responsible_roles")
      .select("metric_id,role_id,sort_order")
      .in("metric_id", metricIds)
      .order("sort_order", { ascending: true });
    if (assignmentError) return { data: [] as ProcessMasterMetric[], error: new Error("No se pudieron cargar los responsables de indicadores.") };
    for (const row of assignmentRows ?? []) {
      const current = assignmentsByMetric.get(row.metric_id as string) ?? [];
      current.push({ role_id: row.role_id as string, sort_order: row.sort_order as number | null });
      assignmentsByMetric.set(row.metric_id as string, current);
    }
  }

  try {
    const responsibleRoles = await getResponsibleRoleMap(assignmentsByMetric, processRow.company_id as string);
    return {
      data: (metricRows ?? []).map((row, index): ProcessMasterMetric => ({
        formula: row.formula as string | null,
        frequency: row.frequency as string | null,
        id: row.id as string,
        name: row.name as string,
        owner_person_name: null,
        owner_role_id: row.owner_role_id as string | null,
        owner_role_name: null,
        responsible_roles: responsibleRoles.get(row.id as string) ?? [],
        sort_order: (row.sort_order as number | null) ?? index + 1,
        target: row.target as string | null,
      })),
      error: null,
    };
  } catch (error) {
    return { data: [] as ProcessMasterMetric[], error: error as Error };
  }
}

export async function getProcessRisksForMaster(processId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: processRow, error: processError } = await supabase.from("processes").select("company_id").eq("id", processId).maybeSingle();
  if (processError || !processRow) return { data: [] as ProcessMasterRisk[], error: new Error("No se pudo validar la empresa del proceso.") };
  const { data: riskRows, error: riskError } = await supabase
    .from("risks")
    .select("id,name,risk_type")
    .eq("process_id", processId)
    .is("subprocess_id", null)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (riskError) return { data: [] as ProcessMasterRisk[], error: new Error("No se pudieron cargar los riesgos y oportunidades.") };

  const riskIds = (riskRows ?? []).map((row) => row.id as string);
  const controlsByRisk = new Map<string, Array<Record<string, unknown>>>();
  const assignmentsByControl = new Map<string, RoleAssignmentRow[]>();
  if (riskIds.length) {
    const { data: controlRows, error: controlError } = await supabase
      .from("controls")
      .select("id,risk_id,name,evidence,owner_role_id")
      .eq("process_id", processId)
      .in("risk_id", riskIds)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (controlError) return { data: [] as ProcessMasterRisk[], error: new Error("No se pudieron cargar los controles.") };

    for (const row of controlRows ?? []) {
      const current = controlsByRisk.get(row.risk_id as string) ?? [];
      current.push(row as Record<string, unknown>);
      controlsByRisk.set(row.risk_id as string, current);
    }

    const controlIds = (controlRows ?? []).map((row) => row.id as string);
    if (controlIds.length) {
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("control_responsible_roles")
        .select("control_id,role_id,sort_order")
        .in("control_id", controlIds)
        .order("sort_order", { ascending: true });
      if (assignmentError) return { data: [] as ProcessMasterRisk[], error: new Error("No se pudieron cargar los responsables de controles.") };
      for (const row of assignmentRows ?? []) {
        const current = assignmentsByControl.get(row.control_id as string) ?? [];
        current.push({ role_id: row.role_id as string, sort_order: row.sort_order as number | null });
        assignmentsByControl.set(row.control_id as string, current);
      }
    }
  }

  try {
    const responsibleRoles = await getResponsibleRoleMap(assignmentsByControl, processRow.company_id as string);
    return {
      data: (riskRows ?? []).map((risk): ProcessMasterRisk => ({
        controls: (controlsByRisk.get(risk.id as string) ?? []).map((control): ProcessMasterControl => ({
          evidence: control.evidence as string | null,
          id: control.id as string,
          name: control.name as string,
          owner_person_name: null,
          owner_role_id: control.owner_role_id as string | null,
          owner_role_name: null,
          responsible_roles: responsibleRoles.get(control.id as string) ?? [],
        })),
        id: risk.id as string,
        name: risk.name as string,
        risk_type: risk.risk_type === "opportunity" ? "opportunity" : "risk",
      })),
      error: null,
    };
  } catch (error) {
    return { data: [] as ProcessMasterRisk[], error: error as Error };
  }
}
