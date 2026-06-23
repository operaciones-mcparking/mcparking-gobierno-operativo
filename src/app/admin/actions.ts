"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optionalValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  return raw.length > 0 ? raw : null;
}

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function numberValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  return raw.length > 0 ? Number(raw) : null;
}

function values(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function done(message: string, path = "/admin"): never {
  revalidatePath("/");
  revalidatePath("/admin");
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}

function fail(message: string, path = "/admin"): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function runInsert(
  table: string,
  payload: Record<string, unknown>,
  message: string,
  onConflict?: string,
) {
  const supabase = createSupabaseServerClient();
  const query = onConflict
    ? supabase.from(table).upsert(payload, { onConflict })
    : supabase.from(table).insert(payload);
  const { error } = await query;

  if (error) {
    fail(error.message);
  }

  done(message);
}

export async function addArea(formData: FormData) {
  await runInsert(
    "areas",
    {
      company_id: value(formData, "company_id"),
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
    },
    "Area guardada",
    "company_id,name",
  );
}

export async function addProcess(formData: FormData) {
  await runInsert(
    "processes",
    {
      company_id: value(formData, "company_id"),
      area_id: optionalValue(formData, "area_id"),
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      objective: optionalValue(formData, "objective"),
      expected_result: optionalValue(formData, "expected_result"),
      criticality: value(formData, "criticality"),
      documentation_status: value(formData, "documentation_status"),
      is_replicable: checkbox(formData, "is_replicable"),
      is_global: checkbox(formData, "is_global"),
    },
    "Proceso guardado",
    "company_id,name",
  );
}

export async function addSubprocess(formData: FormData) {
  await runInsert(
    "subprocesses",
    {
      process_id: value(formData, "process_id"),
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      frequency: optionalValue(formData, "frequency"),
      criticality: value(formData, "criticality"),
    },
    "Subproceso guardado",
    "process_id,name",
  );
}

export async function addSubprocessToProcess(formData: FormData) {
  const processId = value(formData, "process_id");
  const returnTo = `/procesos/${processId}/editar`;
  const supabase = createSupabaseServerClient();
  const criticality = value(formData, "criticality");
  const impactPercent = numberValue(formData, "impact_percent");
  const { data, error } = await supabase
    .from("subprocesses")
    .insert({
      process_id: processId,
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      frequency: optionalValue(formData, "frequency"),
      criticality,
      sort_order: numberValue(formData, "sort_order"),
      impact_percent: impactPercent,
    })
    .select("id")
    .single();

  if (error) {
    fail(error.message, returnTo);
  }

  const roleUpdates = [
    {
      responsibilityType: "owner",
      roleId: optionalValue(formData, "owner_role_id"),
      impactPercent,
    },
    {
      responsibilityType: "user",
      roleId: optionalValue(formData, "user_role_id"),
      impactPercent,
    },
    {
      responsibilityType: "consulted",
      roleId: optionalValue(formData, "support_role_id"),
      impactPercent: null,
    },
    {
      responsibilityType: "backup",
      roleId: optionalValue(formData, "backup_role_id"),
      impactPercent: null,
    },
  ];

  for (const update of roleUpdates) {
    const roleError = await replaceProcessRole({
      criticality,
      impactPercent: update.impactPercent,
      processId,
      responsibilityType: update.responsibilityType,
      roleId: update.roleId,
      subprocessId: data.id,
    });

    if (roleError) {
      fail(roleError.message, returnTo);
    }
  }

  const supportError = await replaceSubprocessSupport({
    controlName: optionalValue(formData, "control_name"),
    processId,
    riskName: optionalValue(formData, "risk_name"),
    riskSeverity: criticality,
    subprocessId: data.id,
    systemIds: values(formData, "system_ids"),
  });

  if (supportError) {
    fail(supportError.message, returnTo);
  }

  done("Etapa agregada", returnTo);
}

export async function addRole(formData: FormData) {
  await runInsert(
    "roles",
    {
      area_id: optionalValue(formData, "area_id"),
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      level: value(formData, "level"),
      is_corporate: checkbox(formData, "is_corporate"),
      is_local: checkbox(formData, "is_local"),
    },
    "Rol guardado",
    "area_id,name",
  );
}

export async function addPerson(formData: FormData) {
  await runInsert(
    "people",
    {
      name: value(formData, "name"),
      email: optionalValue(formData, "email"),
      phone: optionalValue(formData, "phone"),
    },
    "Persona guardada",
  );
}

export async function assignPersonRole(formData: FormData) {
  await runInsert(
    "person_roles",
    {
      person_id: value(formData, "person_id"),
      role_id: value(formData, "role_id"),
      company_id: value(formData, "company_id"),
      site_id: optionalValue(formData, "site_id"),
      is_primary: checkbox(formData, "is_primary"),
      is_backup: checkbox(formData, "is_backup"),
      start_date: value(formData, "start_date") || new Date().toISOString().slice(0, 10),
    },
    "Persona asignada a rol",
  );
}

export async function addSystem(formData: FormData) {
  await runInsert(
    "systems",
    {
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      owner_role_id: optionalValue(formData, "owner_role_id"),
    },
    "Sistema guardado",
    "name",
  );
}

export async function assignProcessRole(formData: FormData) {
  await runInsert(
    "process_roles",
    {
      process_id: value(formData, "process_id"),
      subprocess_id: optionalValue(formData, "subprocess_id"),
      role_id: value(formData, "role_id"),
      responsibility_type: value(formData, "responsibility_type"),
      impact_percent: numberValue(formData, "impact_percent"),
      criticality: value(formData, "criticality"),
      is_required: checkbox(formData, "is_required"),
      notes: optionalValue(formData, "notes"),
    },
    "Rol asociado a proceso",
  );
}

export async function assignProcessSystem(formData: FormData) {
  await runInsert(
    "process_systems",
    {
      process_id: value(formData, "process_id"),
      subprocess_id: optionalValue(formData, "subprocess_id"),
      system_id: value(formData, "system_id"),
      notes: optionalValue(formData, "notes"),
    },
    "Sistema asociado a proceso",
  );
}

export async function updateProcessBasics(formData: FormData) {
  const processId = value(formData, "process_id");
  const returnTo = `/procesos/${processId}/editar`;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("processes")
    .update({
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      objective: optionalValue(formData, "objective"),
      expected_result: optionalValue(formData, "expected_result"),
      criticality: value(formData, "criticality"),
      status: value(formData, "status"),
      documentation_status: value(formData, "documentation_status"),
    })
    .eq("id", processId);

  if (error) {
    fail(error.message, returnTo);
  }

  done("Proceso actualizado", returnTo);
}

export async function reorderSubprocesses(processId: string, orderedIds: string[]) {
  const supabase = createSupabaseServerClient();

  for (const [index, subprocessId] of orderedIds.entries()) {
    const { error } = await supabase
      .from("subprocesses")
      .update({ sort_order: index + 1 })
      .eq("id", subprocessId)
      .eq("process_id", processId);

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath(`/procesos/${processId}`);
  revalidatePath(`/procesos/${processId}/editar`);
  revalidatePath("/procesos");

  return { error: null };
}

export async function updateSubprocessImpacts(
  processId: string,
  impacts: Array<{ subprocessId: string; impactPercent: number }>,
) {
  const supabase = createSupabaseServerClient();

  for (const impact of impacts) {
    const { error: subprocessError } = await supabase
      .from("subprocesses")
      .update({ impact_percent: impact.impactPercent })
      .eq("id", impact.subprocessId)
      .eq("process_id", processId);

    if (subprocessError) {
      return { error: subprocessError.message };
    }

    const { error } = await supabase
      .from("process_roles")
      .update({ impact_percent: impact.impactPercent })
      .eq("process_id", processId)
      .eq("subprocess_id", impact.subprocessId)
      .in("responsibility_type", ["owner", "user"]);

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath(`/procesos/${processId}`);
  revalidatePath(`/procesos/${processId}/editar`);
  revalidatePath("/procesos");

  return { error: null };
}

async function replaceProcessRole({
  criticality,
  impactPercent,
  processId,
  responsibilityType,
  roleId,
  subprocessId,
}: {
  criticality: string;
  impactPercent: number | null;
  processId: string;
  responsibilityType: string;
  roleId: string | null;
  subprocessId: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error: deleteError } = await supabase
    .from("process_roles")
    .delete()
    .eq("process_id", processId)
    .eq("subprocess_id", subprocessId)
    .eq("responsibility_type", responsibilityType);

  if (deleteError) {
    return deleteError;
  }

  if (!roleId) {
    return null;
  }

  const { data: roleCompany, error: roleCompanyError } = await supabase
    .from("roles")
    .select("areas(company_id)")
    .eq("id", roleId)
    .maybeSingle();

  if (roleCompanyError) {
    return roleCompanyError;
  }

  const area = Array.isArray(roleCompany?.areas) ? roleCompany?.areas[0] : roleCompany?.areas;
  let roleCompanyId = area?.company_id ?? null;

  if (!roleCompanyId) {
    const { data: process, error: processError } = await supabase
      .from("processes")
      .select("operating_company_id, company_id")
      .eq("id", processId)
      .maybeSingle();

    if (processError) {
      return processError;
    }

    roleCompanyId = process?.operating_company_id ?? process?.company_id ?? null;
  }

  const { error } = await supabase.from("process_roles").insert({
    process_id: processId,
    subprocess_id: subprocessId,
    role_id: roleId,
    role_company_id: roleCompanyId,
    responsibility_type: responsibilityType,
    impact_percent: impactPercent,
    criticality,
    is_required: true,
  });

  return error;
}

async function replaceSubprocessSupport({
  controlName,
  processId,
  riskName,
  riskSeverity,
  subprocessId,
  systemIds,
}: {
  controlName: string | null;
  processId: string;
  riskName: string | null;
  riskSeverity: string;
  subprocessId: string;
  systemIds: string[];
}) {
  const supabase = createSupabaseServerClient();
  const { error: deleteSystemError } = await supabase
    .from("process_systems")
    .delete()
    .eq("process_id", processId)
    .eq("subprocess_id", subprocessId);

  if (deleteSystemError) {
    return deleteSystemError;
  }

  if (systemIds.length > 0) {
    const { error: systemError } = await supabase.from("process_systems").insert(
      systemIds.map((systemId) => ({
        process_id: processId,
        subprocess_id: subprocessId,
        system_id: systemId,
      })),
    );

    if (systemError) {
      return systemError;
    }
  }

  const { data: existingRisks, error: existingRiskError } = await supabase
    .from("risks")
    .select("id")
    .eq("process_id", processId)
    .eq("subprocess_id", subprocessId);

  if (existingRiskError) {
    return existingRiskError;
  }

  const existingRiskIds = (existingRisks ?? []).map((risk) => risk.id);

  if (existingRiskIds.length > 0) {
    const { error: deleteControlError } = await supabase
      .from("controls")
      .delete()
      .in("risk_id", existingRiskIds);

    if (deleteControlError) {
      return deleteControlError;
    }
  }

  const { error: deleteRiskError } = await supabase
    .from("risks")
    .delete()
    .eq("process_id", processId)
    .eq("subprocess_id", subprocessId);

  if (deleteRiskError) {
    return deleteRiskError;
  }

  if (!riskName) {
    return null;
  }

  const { data: risk, error: riskError } = await supabase
    .from("risks")
    .insert({
      process_id: processId,
      subprocess_id: subprocessId,
      name: riskName,
      severity: riskSeverity,
    })
    .select("id")
    .single();

  if (riskError) {
    return riskError;
  }

  if (!controlName) {
    return null;
  }

  const { error: controlError } = await supabase.from("controls").insert({
    process_id: processId,
    risk_id: risk.id,
    name: controlName,
  });

  return controlError;
}

export async function updateSubprocessDetail(formData: FormData) {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const returnTo = `/procesos/${processId}/editar`;
  const supabase = createSupabaseServerClient();
  const criticality = value(formData, "criticality");
  const impactPercent = numberValue(formData, "impact_percent");
  const allImpacts = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("impact_all:"))
    .map(([key, raw]) => ({
      subprocessId: key.replace("impact_all:", ""),
      impactPercent: typeof raw === "string" && raw.trim().length > 0 ? Number(raw) : 0,
    }));

  const { error: subprocessError } = await supabase
    .from("subprocesses")
    .update({
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      frequency: optionalValue(formData, "frequency"),
      criticality,
      sort_order: numberValue(formData, "sort_order"),
      impact_percent: impactPercent,
    })
    .eq("id", subprocessId)
    .eq("process_id", processId);

  if (subprocessError) {
    fail(subprocessError.message, returnTo);
  }

  for (const impact of allImpacts) {
    const { error: impactSubprocessError } = await supabase
      .from("subprocesses")
      .update({ impact_percent: impact.impactPercent })
      .eq("id", impact.subprocessId)
      .eq("process_id", processId);

    if (impactSubprocessError) {
      fail(impactSubprocessError.message, returnTo);
    }

    const { error: impactRoleError } = await supabase
      .from("process_roles")
      .update({ impact_percent: impact.impactPercent })
      .eq("process_id", processId)
      .eq("subprocess_id", impact.subprocessId)
      .in("responsibility_type", ["owner", "user"]);

    if (impactRoleError) {
      fail(impactRoleError.message, returnTo);
    }
  }

  const roleUpdates = [
    {
      responsibilityType: "owner",
      roleId: optionalValue(formData, "owner_role_id"),
      impactPercent,
    },
    {
      responsibilityType: "user",
      roleId: optionalValue(formData, "user_role_id"),
      impactPercent,
    },
    {
      responsibilityType: "consulted",
      roleId: optionalValue(formData, "support_role_id"),
      impactPercent: null,
    },
    {
      responsibilityType: "backup",
      roleId: optionalValue(formData, "backup_role_id"),
      impactPercent: null,
    },
  ];

  for (const update of roleUpdates) {
    const error = await replaceProcessRole({
      criticality,
      impactPercent: update.impactPercent,
      processId,
      responsibilityType: update.responsibilityType,
      roleId: update.roleId,
      subprocessId,
    });

    if (error) {
      fail(error.message, returnTo);
    }
  }

  const supportError = await replaceSubprocessSupport({
    controlName: optionalValue(formData, "control_name"),
    processId,
    riskName: optionalValue(formData, "risk_name"),
    riskSeverity: criticality,
    subprocessId,
    systemIds: values(formData, "system_ids"),
  });

  if (supportError) {
    fail(supportError.message, returnTo);
  }

  done("Etapa actualizada", returnTo);
}

export async function deleteSubprocess(formData: FormData) {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const returnTo = `/procesos/${processId}/editar`;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("subprocesses")
    .delete()
    .eq("id", subprocessId)
    .eq("process_id", processId);

  if (error) {
    fail(error.message, returnTo);
  }

  done("Etapa eliminada", returnTo);
}
