"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/admin";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdminAccess>>["supabase"];

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

function processTypeValue(formData: FormData) {
  const raw = value(formData, "process_type");

  if (raw === "strategic" || raw === "operational" || raw === "support") {
    return raw;
  }

  return "operational";
}

function generateRoleCode(name: string) {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  const initials = words.map((word) => word[0]).join("").toUpperCase();
  const compact = words.join("").slice(0, 5).toUpperCase();

  return (initials.length >= 2 ? initials : compact).slice(0, 8);
}

function values(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withMessage(path: string, key: "error" | "ok", message: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, message);

  return `${base}?${params.toString()}`;
}

function pathWithoutQuery(path: string) {
  return path.split("?")[0] || path;
}

function internalReturnTo(formData: FormData, fallback: string) {
  const returnTo = value(formData, "return_to");

  if (returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("://")) {
    return returnTo;
  }

  return fallback;
}

function done(message: string, path = "/admin"): never {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(pathWithoutQuery(path));
  redirect(withMessage(path, "ok", message));
}

function fail(message: string, path = "/admin"): never {
  redirect(withMessage(path, "error", message));
}

function revalidateRoleDirectory() {
  revalidatePath("/roles-personas");
  revalidatePath("/estructura");
  revalidatePath("/procesos");
}

function adminDone(message: string): never {
  revalidatePath("/admin");
  redirect(withMessage("/admin", "ok", message));
}

async function requireAdminClient() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    fail(error.message);
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    fail("No tienes permisos para administrar accesos.");
  }

  return supabase;
}

export async function authorizeEmailAccess(formData: FormData) {
  const supabase = await requireAdminClient();
  const email = value(formData, "email").toLowerCase();

  if (!email.includes("@")) {
    fail("Ingresa un correo valido.");
  }

  const { error } = await supabase.from("auth_email_allowlist").upsert(
    {
      app_role: value(formData, "app_role"),
      default_country_id: optionalValue(formData, "default_country_id"),
      default_site_id: optionalValue(formData, "default_site_id"),
      display_name: optionalValue(formData, "display_name"),
      email,
      status: value(formData, "status") || "active",
    },
    { onConflict: "email" },
  );

  if (error) {
    fail(error.message);
  }

  adminDone("Correo autorizado");
}

export async function authorizeDomainAccess(formData: FormData) {
  const supabase = await requireAdminClient();
  const domain = value(formData, "domain").toLowerCase().replace(/^@/, "");

  if (!domain.includes(".")) {
    fail("Ingresa un dominio valido, por ejemplo mcparking.cl.");
  }

  const { error } = await supabase.from("auth_domain_allowlist").upsert(
    {
      app_role: value(formData, "app_role"),
      default_country_id: optionalValue(formData, "default_country_id"),
      default_site_id: optionalValue(formData, "default_site_id"),
      domain,
      status: value(formData, "status") || "active",
    },
    { onConflict: "domain" },
  );

  if (error) {
    fail(error.message);
  }

  adminDone("Dominio autorizado");
}

export async function updateUserAccessProfile(formData: FormData) {
  const supabase = await requireAdminClient();
  const userId = value(formData, "user_id");

  const { error } = await supabase
    .from("user_profiles")
    .update({
      app_role: value(formData, "app_role"),
      default_country_id: optionalValue(formData, "default_country_id"),
      default_site_id: optionalValue(formData, "default_site_id"),
      display_name: value(formData, "display_name"),
      status: value(formData, "status"),
    })
    .eq("user_id", userId);

  if (error) {
    fail(error.message);
  }

  adminDone("Usuario actualizado");
}

export async function grantSiteAccess(formData: FormData) {
  const supabase = await requireAdminClient();
  const siteId = value(formData, "site_id");

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("country_id")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) {
    fail(siteError.message);
  }

  const { error } = await supabase.from("user_site_access").upsert(
    {
      access_level: value(formData, "access_level"),
      country_id: site?.country_id ?? optionalValue(formData, "country_id"),
      site_id: siteId,
      status: value(formData, "status") || "active",
      user_id: value(formData, "user_id"),
    },
    { onConflict: "user_id,site_id" },
  );

  if (error) {
    fail(error.message);
  }

  adminDone("Permiso de sede actualizado");
}

export async function archiveSiteAccess(formData: FormData) {
  const supabase = await requireAdminClient();
  const { error } = await supabase
    .from("user_site_access")
    .update({ status: "archived" })
    .eq("id", value(formData, "access_id"));

  if (error) {
    fail(error.message);
  }

  adminDone("Permiso archivado");
}

async function scopePayload(
  supabase: Awaited<ReturnType<typeof requireAdminClient>>,
  formData: FormData,
) {
  const scopeType = value(formData, "scope_type") || "global";

  if (scopeType === "global") {
    return {
      scope_type: "global",
      country_id: null,
      company_id: null,
      site_id: null,
    };
  }

  if (scopeType === "country") {
    return {
      scope_type: "country",
      country_id: value(formData, "country_id"),
      company_id: null,
      site_id: null,
    };
  }

  if (scopeType === "company") {
    const companyId = value(formData, "company_id");
    const { data: company, error } = await supabase
      .from("companies")
      .select("country_id")
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      fail(error.message);
    }

    return {
      scope_type: "company",
      country_id: value(formData, "country_id") || company?.country_id,
      company_id: companyId,
      site_id: null,
    };
  }

  const siteId = value(formData, "site_id");
  const { data: site, error } = await supabase
    .from("sites")
    .select("company_id,country_id")
    .eq("id", siteId)
    .maybeSingle();

  if (error) {
    fail(error.message);
  }

  return {
    scope_type: "site",
    country_id: value(formData, "country_id") || site?.country_id,
    company_id: value(formData, "company_id") || site?.company_id,
    site_id: siteId,
  };
}

export async function assignAccessRole(formData: FormData) {
  const supabase = await requireAdminClient();
  const payload = await scopePayload(supabase, formData);

  const { error } = await supabase.from("user_access_assignments").insert({
    ...payload,
    access_role_id: value(formData, "access_role_id"),
    end_date: optionalValue(formData, "end_date"),
    person_id: value(formData, "person_id"),
    start_date: value(formData, "start_date") || new Date().toISOString().slice(0, 10),
    status: value(formData, "status") || "active",
  });

  if (error) {
    fail(error.code === "23505" ? "Esa asignacion de acceso ya existe activa." : error.message);
  }

  adminDone("Acceso asignado");
}

export async function assignSuggestedAccessRole(formData: FormData) {
  const supabase = await requireAdminClient();
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const payload = await scopePayload(supabase, formData);

  const { error } = await supabase.from("user_access_assignments").insert({
    ...payload,
    access_role_id: value(formData, "access_role_id"),
    end_date: null,
    person_id: value(formData, "person_id"),
    start_date: new Date().toISOString().slice(0, 10),
    status: "active",
  });

  if (error) {
    fail(
      error.code === "23505"
        ? "Ese acceso sugerido ya existe activo para esta persona."
        : error.message,
      returnTo,
    );
  }

  revalidatePath("/admin");
  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Acceso sugerido asignado"));
}

export async function archiveAccessAssignment(formData: FormData) {
  const supabase = await requireAdminClient();

  const { error } = await supabase
    .from("user_access_assignments")
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      status: "archived",
    })
    .eq("id", value(formData, "assignment_id"));

  if (error) {
    fail(error.message);
  }

  adminDone("Asignacion archivada");
}

export async function updateAccessRolePermissions(formData: FormData) {
  const supabase = await requireAdminClient();
  const accessRoleId = value(formData, "access_role_id");
  const permissionIds = new Set(values(formData, "permission_ids"));

  const { data: existing, error: existingError } = await supabase
    .from("access_role_permissions")
    .select("permission_id")
    .eq("access_role_id", accessRoleId);

  if (existingError) {
    fail(existingError.message);
  }

  const existingIds = new Set((existing ?? []).map((item) => item.permission_id as string));
  const toActivate = [...permissionIds].filter((permissionId) => existingIds.has(permissionId));
  const toInsert = [...permissionIds].filter((permissionId) => !existingIds.has(permissionId));
  const toArchive = [...existingIds].filter((permissionId) => !permissionIds.has(permissionId));

  if (toArchive.length > 0) {
    const { error } = await supabase
      .from("access_role_permissions")
      .update({ status: "archived" })
      .eq("access_role_id", accessRoleId)
      .in("permission_id", toArchive);

    if (error) {
      fail(error.message);
    }
  }

  if (toActivate.length > 0) {
    const { error } = await supabase
      .from("access_role_permissions")
      .update({ status: "active" })
      .eq("access_role_id", accessRoleId)
      .in("permission_id", toActivate);

    if (error) {
      fail(error.message);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("access_role_permissions").insert(
      toInsert.map((permissionId) => ({
        access_role_id: accessRoleId,
        permission_id: permissionId,
        status: "active",
      })),
    );

    if (error) {
      fail(error.message);
    }
  }

  adminDone("Permisos del rol actualizados");
}

async function runInsert(
  supabase: AdminSupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  message: string,
  onConflict?: string,
) {
  const query = onConflict
    ? supabase.from(table).upsert(payload, { onConflict })
    : supabase.from(table).insert(payload);
  const { error } = await query;

  if (error) {
    fail(error.message);
  }

  done(message);
}

async function firstActiveSiteForCompany(
  supabase: AdminSupabaseClient,
  companyId: string | null,
  countryId: string | null,
) {
  if (!companyId) {
    return null;
  }

  let query = supabase
    .from("sites")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name")
    .limit(1);

  if (countryId) {
    query = query.eq("country_id", countryId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function companyOperationalContext(
  supabase: AdminSupabaseClient,
  companyId: string | null,
) {
  if (!companyId) {
    return { companyId: null, countryId: null, siteId: null };
  }

  const { data, error } = await supabase
    .from("companies")
    .select("country_id")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const countryId = data?.country_id ?? null;
  const siteId = await firstActiveSiteForCompany(supabase, companyId, countryId);

  return { companyId, countryId, siteId };
}

async function areaOperationalContext(
  supabase: AdminSupabaseClient,
  areaId: string | null,
) {
  if (!areaId) {
    return { companyId: null, countryId: null, siteId: null };
  }

  const { data, error } = await supabase
    .from("areas")
    .select("company_id")
    .eq("id", areaId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return companyOperationalContext(supabase, data?.company_id ?? null);
}

async function roleOperationalContext(
  supabase: AdminSupabaseClient,
  roleId: string | null,
) {
  if (!roleId) {
    return { companyId: null, countryId: null, siteId: null };
  }

  const { data, error } = await supabase
    .from("roles")
    .select("country_id,site_id,areas(company_id)")
    .eq("id", roleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const area = Array.isArray(data?.areas) ? data?.areas[0] : data?.areas;
  const companyContext = await companyOperationalContext(supabase, area?.company_id ?? null);

  return {
    companyId: companyContext.companyId,
    countryId: data?.country_id ?? companyContext.countryId,
    siteId: data?.site_id ?? companyContext.siteId,
  };
}

async function siteOperationalContext(
  supabase: AdminSupabaseClient,
  siteId: string | null,
) {
  if (!siteId) {
    return { companyId: null, countryId: null, siteId: null };
  }

  const { data, error } = await supabase
    .from("sites")
    .select("company_id,country_id")
    .eq("id", siteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    companyId: data?.company_id ?? null,
    countryId: data?.country_id ?? null,
    siteId,
  };
}

async function requestOperationalContext() {
  const headersList = await headers();
  const referer = headersList.get("referer");

  if (!referer) {
    return { countryId: null, siteId: null };
  }

  try {
    const url = new URL(referer);

    return {
      countryId: url.searchParams.get("country_id"),
      siteId: url.searchParams.get("site_id"),
    };
  } catch {
    return { countryId: null, siteId: null };
  }
}

export async function addArea(formData: FormData) {
  const { supabase } = await requireAdminAccess();

  await runInsert(
    supabase,
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
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const companyId = value(formData, "company_id");
  const explicitSiteId =
    optionalValue(formData, "operating_site_id") ??
    optionalValue(formData, "owner_site_id") ??
    optionalValue(formData, "site_id") ??
    requestContext.siteId;
  const explicitContext = await siteOperationalContext(supabase, explicitSiteId);
  const companyContext = await companyOperationalContext(supabase, companyId);
  const countryId =
    optionalValue(formData, "country_id") ??
    requestContext.countryId ??
    explicitContext.countryId ??
    companyContext.countryId;
  const defaultSiteId = explicitSiteId ?? companyContext.siteId;

  const { error } = await supabase.from("processes").upsert(
    {
      company_id: companyId,
      area_id: optionalValue(formData, "area_id"),
      country_id: countryId,
      owner_company_id: optionalValue(formData, "owner_company_id") ?? companyId,
      operating_company_id: optionalValue(formData, "operating_company_id") ?? companyId,
      owner_site_id: optionalValue(formData, "owner_site_id") ?? defaultSiteId,
      operating_site_id: optionalValue(formData, "operating_site_id") ?? defaultSiteId,
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      objective: optionalValue(formData, "objective"),
      expected_result: optionalValue(formData, "expected_result"),
      criticality: value(formData, "criticality"),
      documentation_status: value(formData, "documentation_status"),
      is_replicable: checkbox(formData, "is_replicable"),
      is_global: checkbox(formData, "is_global"),
    },
    { onConflict: "company_id,name" },
  );

  if (error) {
    fail(error.message);
  }

  done("Proceso guardado");
}

export async function addSubprocess(formData: FormData) {
  const { supabase } = await requireAdminAccess();

  await runInsert(
    supabase,
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
  const { supabase } = await requireAdminAccess();
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
      supabase,
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
    supabase,
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
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const areaId = optionalValue(formData, "area_id");
  const areaContext = await areaOperationalContext(supabase, areaId);

  await runInsert(
    supabase,
    "roles",
    {
      area_id: areaId,
      country_id: requestContext.countryId ?? areaContext.countryId,
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      level: value(formData, "level"),
      is_corporate: checkbox(formData, "is_corporate"),
      is_local: checkbox(formData, "is_local"),
      site_id: requestContext.siteId ?? areaContext.siteId,
    },
    "Rol guardado",
    "area_id,name",
  );
}

export async function addPerson(formData: FormData) {
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const returnTo = internalReturnTo(formData, "/admin");

  const { error } = await supabase.from("people").insert({
    name: value(formData, "name"),
    email: optionalValue(formData, "email"),
    phone: optionalValue(formData, "phone"),
    country_id: requestContext.countryId,
    site_id: requestContext.siteId,
  });

  if (error) {
    fail(error.message, returnTo);
  }

  done("Persona guardada", returnTo);
}

export async function createPersonFromStructure(formData: FormData) {
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();

  const { error } = await supabase.from("people").insert({
    name: value(formData, "name"),
    email: optionalValue(formData, "email"),
    phone: optionalValue(formData, "phone"),
    country_id: requestContext.countryId,
    site_id: requestContext.siteId,
  });

  if (error) {
    return { error: error.message, ok: false };
  }

  revalidatePath("/estructura");

  return { error: null, ok: true };
}

export async function createRoleDictionaryEntry(formData: FormData) {
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const personId = optionalValue(formData, "person_id");
  const areaId = value(formData, "area_id");
  const roleName = value(formData, "name");
  const responsibilities = value(formData, "responsibilities")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const roleContext = await areaOperationalContext(supabase, areaId);
  const currentSiteId = requestContext.siteId ?? roleContext.siteId;
  const currentCountryId = requestContext.countryId ?? roleContext.countryId;

  const { data: roleData, error: roleError } = await supabase
    .from("roles")
    .insert({
      area_id: areaId,
      country_id: currentCountryId,
      description: optionalValue(formData, "description"),
      is_corporate: checkbox(formData, "is_corporate"),
      is_local: checkbox(formData, "is_local"),
      level: value(formData, "level"),
      name: roleName,
      org_column: numberValue(formData, "org_column"),
      org_parent_role_id: optionalValue(formData, "org_parent_role_id"),
      org_row: numberValue(formData, "org_row"),
      responsibilities,
      role_code: generateRoleCode(roleName),
      site_id: currentSiteId,
      sort_order: null,
      status: "active",
    })
    .select("id, areas(company_id)")
    .single();

  if (roleError) {
    fail(roleError.message, returnTo);
  }

  const area = Array.isArray(roleData?.areas) ? roleData?.areas[0] : roleData?.areas;
  const companyId = area?.company_id ?? null;

  if (personId) {
    const { error: assignmentError } = await supabase.from("person_roles").insert({
      company_id: companyId,
      country_id: currentCountryId,
      is_backup: false,
      is_primary: true,
      person_id: personId,
      role_id: roleData.id,
      site_id: currentSiteId,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
    });

    if (assignmentError) {
      fail(assignmentError.message, returnTo);
    }
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Rol creado"));
}

export async function createRoleDictionaryEntryInline(formData: FormData) {
  const personId = optionalValue(formData, "person_id");
  const areaId = value(formData, "area_id");
  const roleName = value(formData, "name");

  if (!areaId) {
    return { error: "Selecciona un area para crear el rol.", ok: false };
  }

  if (!roleName) {
    return { error: "Ingresa el nombre del rol.", ok: false };
  }

  const responsibilities = value(formData, "responsibilities")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const { supabase } = await requireAdminAccess();

  try {
    const requestContext = await requestOperationalContext();
    const roleContext = await areaOperationalContext(supabase, areaId);
    const currentSiteId = requestContext.siteId ?? roleContext.siteId;
    const currentCountryId = requestContext.countryId ?? roleContext.countryId;

    const { data: roleData, error: roleError } = await supabase
      .from("roles")
      .insert({
        area_id: areaId,
        country_id: currentCountryId,
        description: optionalValue(formData, "description"),
        is_corporate: checkbox(formData, "is_corporate"),
        is_local: checkbox(formData, "is_local"),
        level: value(formData, "level"),
        name: roleName,
        org_column: numberValue(formData, "org_column"),
        org_parent_role_id: optionalValue(formData, "org_parent_role_id"),
        org_row: numberValue(formData, "org_row"),
        responsibilities,
        role_code: generateRoleCode(roleName),
        site_id: currentSiteId,
        sort_order: null,
        status: "active",
      })
      .select("id, areas(company_id)")
      .single();

    if (roleError) {
      return { error: roleError.message, ok: false };
    }

    const area = Array.isArray(roleData?.areas) ? roleData?.areas[0] : roleData?.areas;
    const companyId = area?.company_id ?? null;

    if (personId) {
      const { error: assignmentError } = await supabase.from("person_roles").insert({
        company_id: companyId,
        country_id: currentCountryId,
        is_backup: false,
        is_primary: true,
        person_id: personId,
        role_id: roleData.id,
        site_id: currentSiteId,
        start_date: new Date().toISOString().slice(0, 10),
        status: "active",
      });

      if (assignmentError) {
        return { error: assignmentError.message, ok: false };
      }
    }

    revalidateRoleDirectory();

    return { error: null, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo crear el rol.",
      ok: false,
    };
  }
}

export async function assignPersonRole(formData: FormData) {
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const explicitSiteId = optionalValue(formData, "site_id") ?? requestContext.siteId;
  const companyId = value(formData, "company_id");
  const siteContext = await siteOperationalContext(supabase, explicitSiteId);
  const companyContext = await companyOperationalContext(
    supabase,
    siteContext.companyId ?? companyId,
  );

  const { error } = await supabase.from("person_roles").insert({
    person_id: value(formData, "person_id"),
    role_id: value(formData, "role_id"),
    company_id: siteContext.companyId ?? companyId,
    country_id: requestContext.countryId ?? siteContext.countryId ?? companyContext.countryId,
    site_id: explicitSiteId ?? companyContext.siteId,
    is_primary: checkbox(formData, "is_primary"),
    is_backup: checkbox(formData, "is_backup"),
    start_date: value(formData, "start_date") || new Date().toISOString().slice(0, 10),
  });

  if (error) {
    fail(error.message);
  }

  done("Persona asignada a rol");
}

export async function updatePersonBasic(formData: FormData) {
  const personId = value(formData, "person_id");
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const personUpdate: {
    country_id?: string | null;
    email: string | null;
    name: string;
    phone: string | null;
    site_id?: string | null;
  } = {
    email: optionalValue(formData, "email"),
    name: value(formData, "name"),
    phone: optionalValue(formData, "phone"),
  };

  if (requestContext.countryId) {
    personUpdate.country_id = requestContext.countryId;
  }

  if (requestContext.siteId) {
    personUpdate.site_id = requestContext.siteId;
  }

  const { error } = await supabase
    .from("people")
    .update(personUpdate)
    .eq("id", personId);

  if (error) {
    fail(error.message, returnTo);
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Persona actualizada"));
}

export async function archivePerson(formData: FormData) {
  const personId = value(formData, "person_id");
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const { supabase } = await requireAdminAccess();

  const { error: assignmentError } = await supabase
    .from("person_roles")
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      is_primary: false,
      status: "inactive",
    })
    .eq("person_id", personId)
    .eq("status", "active");

  if (assignmentError) {
    fail(assignmentError.message, returnTo);
  }

  const { error } = await supabase
    .from("people")
    .update({ status: "archived" })
    .eq("id", personId);

  if (error) {
    fail(error.message, returnTo);
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Persona archivada"));
}

export async function updateRoleDictionaryEntry(formData: FormData) {
  const roleId = value(formData, "role_id");
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const personId = optionalValue(formData, "person_id");
  const areaId = value(formData, "area_id");
  const roleName = value(formData, "name");
  const responsibilities = value(formData, "responsibilities")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();

  const { data: areaData, error: areaDataError } = await supabase
    .from("areas")
    .select("company_id")
    .eq("id", areaId)
    .maybeSingle();

  if (areaDataError) {
    fail(areaDataError.message, returnTo);
  }

  const companyId = optionalValue(formData, "company_id") ?? areaData?.company_id ?? null;
  const roleContext = await companyOperationalContext(supabase, companyId);
  const currentSiteId = requestContext.siteId ?? roleContext.siteId;
  const currentCountryId = requestContext.countryId ?? roleContext.countryId;

  const { error: roleError } = await supabase
    .from("roles")
    .update({
      area_id: areaId,
      country_id: currentCountryId,
      description: optionalValue(formData, "description"),
      is_corporate: checkbox(formData, "is_corporate"),
      is_local: checkbox(formData, "is_local"),
      level: value(formData, "level"),
      name: roleName,
      org_column: numberValue(formData, "org_column"),
      org_parent_role_id: optionalValue(formData, "org_parent_role_id"),
      org_row: numberValue(formData, "org_row"),
      responsibilities,
      role_code: generateRoleCode(roleName),
      site_id: currentSiteId,
    })
    .eq("id", roleId);

  if (roleError) {
    fail(roleError.message, returnTo);
  }

  const { error: deactivateError } = await supabase
    .from("person_roles")
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      is_primary: false,
      status: "inactive",
    })
    .eq("role_id", roleId)
    .eq("is_primary", true)
    .eq("status", "active");

  if (deactivateError) {
    fail(deactivateError.message, returnTo);
  }

  if (personId) {
    const { error: assignmentError } = await supabase.from("person_roles").insert({
      company_id: companyId,
      country_id: currentCountryId,
      is_backup: false,
      is_primary: true,
      person_id: personId,
      role_id: roleId,
      site_id: currentSiteId,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
    });

    if (assignmentError) {
      fail(assignmentError.message, returnTo);
    }
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Rol actualizado"));
}

export async function updateRoleDictionaryEntryInline(formData: FormData) {
  const roleId = value(formData, "role_id");
  const roleName = value(formData, "name");
  const { supabase } = await requireAdminAccess();

  if (!roleId) {
    return { error: "No se recibio el identificador del rol.", ok: false };
  }

  if (!roleName) {
    return { error: "Ingresa el nombre del rol.", ok: false };
  }

  try {
    const { data: currentRole, error: currentRoleError } = await supabase
      .from("roles")
      .select("area_id,country_id,site_id,areas(company_id)")
      .eq("id", roleId)
      .maybeSingle();

    if (currentRoleError) {
      return { error: currentRoleError.message, ok: false };
    }

    if (!currentRole) {
      return { error: "No se encontro el rol para actualizar.", ok: false };
    }

    const requestContext = await requestOperationalContext();
    const areaId = optionalValue(formData, "area_id") ?? currentRole.area_id;
    const roleContext = await areaOperationalContext(supabase, areaId);
    const currentSiteId = requestContext.siteId ?? roleContext.siteId ?? currentRole.site_id;
    const currentCountryId =
      requestContext.countryId ?? roleContext.countryId ?? currentRole.country_id;
    const responsibilities = value(formData, "responsibilities")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const roleUpdate: Record<string, unknown> = {
      area_id: areaId,
      country_id: currentCountryId,
      description: optionalValue(formData, "description"),
      level: value(formData, "level"),
      name: roleName,
      responsibilities,
      role_code: generateRoleCode(roleName),
      site_id: currentSiteId,
    };

    if (formData.has("is_corporate")) {
      roleUpdate.is_corporate = checkbox(formData, "is_corporate");
    }

    if (formData.has("is_local")) {
      roleUpdate.is_local = checkbox(formData, "is_local");
    }

    if (formData.has("org_parent_role_id")) {
      roleUpdate.org_parent_role_id = optionalValue(formData, "org_parent_role_id");
    }

    const { error: roleError } = await supabase
      .from("roles")
      .update(roleUpdate)
      .eq("id", roleId);

    if (roleError) {
      return { error: roleError.message, ok: false };
    }

    if (formData.has("person_id")) {
      const personId = optionalValue(formData, "person_id");

      const { error: deactivateError } = await supabase
        .from("person_roles")
        .update({
          end_date: new Date().toISOString().slice(0, 10),
          is_primary: false,
          status: "inactive",
        })
        .eq("role_id", roleId)
        .eq("is_primary", true)
        .eq("status", "active");

      if (deactivateError) {
        return { error: deactivateError.message, ok: false };
      }

      if (personId) {
        const area = Array.isArray(currentRole.areas) ? currentRole.areas[0] : currentRole.areas;
        const roleCompanyContext = await companyOperationalContext(
          supabase,
          area?.company_id ?? null,
        );
        const companyId = roleCompanyContext.companyId;

        const { error: assignmentError } = await supabase.from("person_roles").insert({
          company_id: companyId,
          country_id: currentCountryId,
          is_backup: false,
          is_primary: true,
          person_id: personId,
          role_id: roleId,
          site_id: currentSiteId,
          start_date: new Date().toISOString().slice(0, 10),
          status: "active",
        });

        if (assignmentError) {
          return { error: assignmentError.message, ok: false };
        }
      }
    }

    revalidateRoleDirectory();

    return { error: null, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo actualizar el rol.",
      ok: false,
    };
  }
}

export async function archiveRole(formData: FormData) {
  const roleId = value(formData, "role_id");
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const { supabase } = await requireAdminAccess();

  const { error: assignmentError } = await supabase
    .from("person_roles")
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      is_primary: false,
      status: "inactive",
    })
    .eq("role_id", roleId)
    .eq("status", "active");

  if (assignmentError) {
    fail(assignmentError.message, returnTo);
  }

  const { error } = await supabase
    .from("roles")
    .update({ status: "archived" })
    .eq("id", roleId);

  if (error) {
    fail(error.message, returnTo);
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Rol archivado"));
}

export async function archiveRoleInline(formData: FormData) {
  const roleId = value(formData, "role_id");
  const { supabase } = await requireAdminAccess();

  if (!roleId) {
    return { error: "No se recibio el identificador del rol.", ok: false };
  }

  try {
    const { error: assignmentError } = await supabase
      .from("person_roles")
      .update({
        end_date: new Date().toISOString().slice(0, 10),
        is_primary: false,
        status: "inactive",
      })
      .eq("role_id", roleId)
      .eq("status", "active");

    if (assignmentError) {
      return { error: assignmentError.message, ok: false };
    }

    const { error } = await supabase
      .from("roles")
      .update({ status: "archived" })
      .eq("id", roleId);

    if (error) {
      return { error: error.message, ok: false };
    }

    revalidateRoleDirectory();

    return { error: null, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo archivar el rol.",
      ok: false,
    };
  }
}

export async function deleteRole(formData: FormData) {
  const roleId = value(formData, "role_id");
  const returnTo = value(formData, "return_to") || "/roles-personas";
  const { supabase } = await requireAdminAccess();

  if (!roleId) {
    fail("No se recibio el identificador del rol. Refresca la pagina e intenta nuevamente.", returnTo);
  }

  const { data, error } = await supabase.rpc("delete_role_for_mvp", {
    target_role_id: roleId,
  });

  if (error) {
    fail(error.message, returnTo);
  }

  if (data !== true) {
    fail("No se pudo eliminar el rol. Puede que ya no exista o que falte ejecutar la migracion de permisos.", returnTo);
  }

  revalidateRoleDirectory();
  redirect(withMessage(returnTo, "ok", "Rol eliminado"));
}

export async function toggleRoleGovernanceProcess(formData: FormData) {
  const roleId = value(formData, "role_id");
  const processKey = value(formData, "process_key");
  const active = checkbox(formData, "active");
  const returnTo = value(formData, "return_to") || "/estructura";
  const { supabase } = await requireAdminAccess();

  const { error } = await supabase
    .from("role_governance_processes")
    .upsert(
      {
        process_key: processKey,
        role_id: roleId,
        status: active ? "inactive" : "active",
      },
      { onConflict: "role_id,process_key" },
    );

  if (error) {
    fail(error.message, returnTo);
  }

  revalidatePath("/estructura");
  redirect(returnTo);
}

export async function toggleRoleGovernanceProcessInline(
  roleId: string,
  processKey: string,
  currentlyActive: boolean,
) {
  const { supabase } = await requireAdminAccess();

  if (!roleId || !processKey) {
    return { error: "Falta el rol o el proceso para guardar el cambio." };
  }

  const { error } = await supabase
    .from("role_governance_processes")
    .upsert(
      {
        process_key: processKey,
        role_id: roleId,
        status: currentlyActive ? "inactive" : "active",
      },
      { onConflict: "role_id,process_key" },
    );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/estructura");

  return { error: null };
}

export async function addSystem(formData: FormData) {
  const { supabase } = await requireAdminAccess();
  const requestContext = await requestOperationalContext();
  const ownerRoleId = optionalValue(formData, "owner_role_id");
  const roleContext = await roleOperationalContext(supabase, ownerRoleId);

  const { error } = await supabase.from("systems").upsert(
    {
      company_id: roleContext.companyId,
      country_id: requestContext.countryId ?? roleContext.countryId,
      description: optionalValue(formData, "description"),
      name: value(formData, "name"),
      owner_role_id: ownerRoleId,
      site_id: requestContext.siteId ?? roleContext.siteId,
    },
    { onConflict: "name" },
  );

  if (error) {
    fail(error.message);
  }

  done("Sistema guardado");
}

export async function assignProcessRole(formData: FormData) {
  const { supabase } = await requireAdminAccess();

  await runInsert(
    supabase,
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
  const { supabase } = await requireAdminAccess();

  await runInsert(
    supabase,
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
  const { supabase } = await requireAdminAccess();
  const { error } = await supabase
    .from("processes")
    .update({
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      objective: optionalValue(formData, "objective"),
      expected_result: optionalValue(formData, "expected_result"),
      process_type: processTypeValue(formData),
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

export async function archiveProcess(formData: FormData) {
  const processId = value(formData, "process_id");

  if (!processId) {
    fail("Proceso no definido", "/procesos");
  }

  const { supabase } = await requireAdminAccess();
  const { error } = await supabase
    .from("processes")
    .update({ status: "archived" })
    .eq("id", processId);

  if (error) {
    fail(error.message, `/procesos/${processId}/editar`);
  }

  revalidatePath("/procesos");
  revalidatePath(`/procesos/${processId}`);
  revalidatePath(`/procesos/${processId}/editar`);
  redirect(withMessage("/procesos", "ok", "Proceso archivado"));
}

export async function reorderSubprocesses(processId: string, orderedIds: string[]) {
  const { supabase } = await requireAdminAccess();

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
  const { supabase } = await requireAdminAccess();

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
  supabase,
  criticality,
  impactPercent,
  processId,
  responsibilityType,
  roleId,
  subprocessId,
}: {
  supabase: AdminSupabaseClient;
  criticality: string;
  impactPercent: number | null;
  processId: string;
  responsibilityType: string;
  roleId: string | null;
  subprocessId: string;
}) {
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
  supabase,
  controlName,
  processId,
  riskName,
  riskSeverity,
  subprocessId,
  systemIds,
}: {
  supabase: AdminSupabaseClient;
  controlName: string | null;
  processId: string;
  riskName: string | null;
  riskSeverity: string;
  subprocessId: string;
  systemIds: string[];
}) {
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
  const { supabase } = await requireAdminAccess();
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
      supabase,
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
    supabase,
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
  const { supabase } = await requireAdminAccess();
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
