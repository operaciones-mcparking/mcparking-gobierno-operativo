"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/admin";
import { getEditableProcessCatalogItem, getRoleDictionary } from "@/lib/dashboard/data";
import type { ProcessMasterDto, ProcessMasterStage, ProcessMetricSaveRow, ProcessRiskControlSaveRow } from "@/app/procesos/process-master/process-master-types";
import { validateProcessForActivation } from "@/app/procesos/process-master/process-master-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type AdminSupabaseClient = Awaited<ReturnType<typeof requireAdminAccess>>["supabase"];
type ProcessAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ExistingProcessConflict = {
  action: "continue" | "view" | "none";
  companyName: string;
  id: string;
  lastEditedAt: string | null;
  name: string;
  ownerRoleName: string | null;
  processCode: string | null;
  status: string;
};

function createProcessDraftValidationClient(returnTo = "/procesos/nuevo") {
  try {
    return createSupabaseAdminClient();
  } catch {
    fail("No se pudo inicializar el servicio seguro de procesos.", returnTo);
  }
}

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optionalValue(formData: FormData, key: string) {
  const raw = value(formData, key);
  return raw.length > 0 ? raw : null;
}
function processWriteErrorMessage(error: { code?: string; message: string }, fallback: string) {
  if (error.message.includes("process_code") || error.message.includes("idx_processes_process_code_unique_ci")) {
    return "Ya existe un proceso con ese codigo.";
  }

  if (error.code === "23505") {
    return "Ya existe un proceso con ese nombre para la empresa seleccionada.";
  }

  return fallback;
}

async function validateSelectedProcessCompany(supabase: ProcessAdminClient, companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return new Error("No se pudo validar la empresa seleccionada.");
  }

  return data ? null : new Error("Selecciona una empresa estructural activa.");
}
async function validateSelectedProcessOperationType(
  supabase: ProcessAdminClient,
  areaId: string | null,
  companyId: string,
) {
  if (!areaId) return null;

  const { data, error } = await supabase
    .from("areas")
    .select("id,company_id,status")
    .eq("id", areaId)
    .maybeSingle();

  if (error) return new Error("No se pudo validar el Tipo de operación seleccionado.");
  if (!data || data.status !== "active") return new Error("Selecciona un Tipo de operación activo.");
  return data.company_id === companyId
    ? null
    : new Error("El Tipo de operación no corresponde a la empresa seleccionada.");
}
async function validateOfficialProcessOwner(
  supabase: ProcessAdminClient,
  ownerRoleId: string | null,
  companyId?: string | null,
) {
  if (!ownerRoleId) {
    return null;
  }

  const { data, error } = await supabase
    .from("v_role_dictionary")
    .select("role_id,role_status,company_id")
    .eq("role_id", ownerRoleId)
    .maybeSingle();

  if (error) {
    return new Error("No se pudo validar el rol dueno del proceso.");
  }

  if (!data || data.role_status !== "active") {
    return new Error("Selecciona un rol oficial activo como dueno del proceso.");
  }

  return companyId && data.company_id !== companyId
    ? new Error("El rol dueno no corresponde a la empresa seleccionada.")
    : null;
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

async function persistProcessDraft(formData: FormData) {
  const { supabase } = await requireAdminAccess();
  const returnTo = internalReturnTo(formData, "/procesos/nuevo");
  const draftIntent = value(formData, "draft_intent");
  const inlineDraft = draftIntent === "wizard_next" || draftIntent === "add_stage" || draftIntent === "add_role";
  const rejectDraft = (message: string) => {
    if (inlineDraft) return { error: message, existingProcess: null, processId: null };
    fail(message, returnTo);
  };
  const name = value(formData, "name");
  const companyId = value(formData, "company_id");
  const areaId = optionalValue(formData, "area_id");
  const ownerRoleId = optionalValue(formData, "owner_role_id");
  const processType = value(formData, "process_type");
  let processAdmin: ProcessAdminClient;
  try {
    processAdmin = createSupabaseAdminClient();
  } catch {
    return rejectDraft("No se pudo inicializar el servicio seguro de procesos.");
  }

  if (!name) {
    return rejectDraft("Ingresa el nombre del proceso.");
  }

  if (!companyId) {
    return rejectDraft("Selecciona una empresa.");
  }

  let companyError: Error | null;

  try {
    companyError = await validateSelectedProcessCompany(processAdmin, companyId);
  } catch {
    return rejectDraft("No se pudo validar la empresa seleccionada.");
  }

  if (companyError) {
    return rejectDraft(companyError.message);
  }

  let operationTypeError: Error | null;
  try {
    operationTypeError = await validateSelectedProcessOperationType(processAdmin, areaId, companyId);
  } catch {
    return rejectDraft("No se pudo validar el Tipo de operación seleccionado.");
  }
  if (operationTypeError) return rejectDraft(operationTypeError.message);

  if (processType !== "strategic" && processType !== "operational" && processType !== "support") {
    return rejectDraft("Selecciona un tipo de proceso valido.");
  }

  if (optionalValue(formData, "process_code") || optionalValue(formData, "version")) {
    return rejectDraft("El codigo y la version documental no se pueden definir manualmente.");
  }

  let ownerError: Error | null;

  try {
    ownerError = await validateOfficialProcessOwner(processAdmin, ownerRoleId, companyId);
  } catch {
    return rejectDraft("No se pudo validar el rol dueno del proceso.");
  }

  if (ownerError) {
    return rejectDraft(ownerError.message);
  }

  const existingResult = await processAdmin
    .from("processes")
    .select("id,name,status,documentation_status,process_code,master_updated_at,updated_at,owner_role_id")
    .eq("company_id", companyId)
    .eq("name", name)
    .maybeSingle();

  if (existingResult.error) {
    return rejectDraft("No se pudo comprobar si el proceso ya existe.");
  }

  if (existingResult.data) {
    const [companyResult, ownerResult] = await Promise.all([
      processAdmin.from("companies").select("name").eq("id", companyId).maybeSingle(),
      existingResult.data.owner_role_id
        ? processAdmin.from("v_role_dictionary").select("role_name").eq("role_id", existingResult.data.owner_role_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const editable = existingResult.data.status === "inactive" && existingResult.data.documentation_status === "draft";
    const active = existingResult.data.status === "active";
    const previousActive = active && !existingResult.data.process_code?.trim();
    const existingProcess: ExistingProcessConflict = {
      action: editable ? "continue" : active ? "view" : "none",
      companyName: companyResult.data?.name ?? "la empresa seleccionada",
      id: existingResult.data.id,
      lastEditedAt: existingResult.data.master_updated_at ?? existingResult.data.updated_at ?? null,
      name: existingResult.data.name,
      ownerRoleName: ownerResult.data?.role_name ?? null,
      processCode: existingResult.data.process_code ?? null,
      status: editable ? "Borrador" : previousActive ? "Sin documentar" : active ? "Vigente" : "No disponible",
    };

    if (inlineDraft) return { error: null, existingProcess, processId: null };
    return rejectDraft(
      editable
        ? `Ya existe un borrador con este nombre para ${existingProcess.companyName}.`
        : previousActive
          ? `Ya existe un proceso anterior con este nombre para ${existingProcess.companyName}.`
          : `Ya existe un proceso con este nombre para ${existingProcess.companyName}.`,
    );
  }

  let countryId: string | null = null;
  let defaultSiteId: string | null = null;

  try {
    const requestContext = await requestOperationalContext();
    const explicitSiteId =
      optionalValue(formData, "operating_site_id") ??
      optionalValue(formData, "owner_site_id") ??
      optionalValue(formData, "site_id") ??
      requestContext.siteId;
    const explicitContext = await siteOperationalContext(supabase, explicitSiteId);
    const companyContext = await companyOperationalContext(supabase, companyId);
    const matchingExplicitSiteId =
      explicitSiteId && explicitContext.companyId === companyId ? explicitContext.siteId : null;
    countryId =
      optionalValue(formData, "country_id") ??
      (matchingExplicitSiteId ? explicitContext.countryId : null) ??
      companyContext.countryId ??
      requestContext.countryId;
    defaultSiteId = matchingExplicitSiteId ?? companyContext.siteId;
  } catch {
    return rejectDraft(
      "No se pudo resolver el contexto operativo del proceso.",
    );
  }

  const { data, error } = await processAdmin.rpc(
    "create_process_draft_with_document_header",
    {
      p_owner_role_id: ownerRoleId,
      p_process: {
        area_id: areaId,
        client_destination: optionalValue(formData, "client_destination"),
        company_id: companyId,
        country_id: countryId,
        criticality: value(formData, "criticality") || "medium",
        name,
        operating_site_id: defaultSiteId,
        owner_site_id: defaultSiteId,
        process_end: optionalValue(formData, "process_end"),
        process_inputs: optionalValue(formData, "process_inputs"),
        process_outputs: optionalValue(formData, "process_outputs"),
        process_start: optionalValue(formData, "process_start"),
        process_type: processType,
        purpose: optionalValue(formData, "purpose"),
        scope: optionalValue(formData, "scope"),
        supplier_origin: optionalValue(formData, "supplier_origin"),
      },
    },
  );

  if (error) {
    return rejectDraft(processWriteErrorMessage(error, "No se pudo guardar el borrador."));
  }

  const created = (Array.isArray(data) ? data[0] : null) as { process_id?: string } | null;

  if (!created?.process_id) {
    return rejectDraft("No fue posible crear el proceso. Intenta nuevamente.");
  }

  revalidatePath("/procesos");
  revalidatePath(`/procesos/${created.process_id}/editar`);

  if (inlineDraft) {
    return { error: null, existingProcess: null, processId: created.process_id };
  }

  if (returnTo !== "/procesos/nuevo") {
    done("Proceso guardado", returnTo);
  }

  redirect(withMessage(`/procesos/${created.process_id}/editar`, "ok", "Borrador guardado"));
}

export async function createProcessDraft(formData: FormData): Promise<void> {
  formData.delete("draft_intent");
  await persistProcessDraft(formData);
}

export async function autoCreateProcessDraft(
  formData: FormData,
  intent: "wizard_next" | "add_stage" | "add_role",
) {
  formData.set("draft_intent", intent);
  return persistProcessDraft(formData);
}

export async function autoCreateProcessDraftForRelation(
  formData: FormData,
  intent: "add_stage" | "add_role",
) {
  return autoCreateProcessDraft(formData, intent);
}

export async function addProcess(formData: FormData) {
  if (!value(formData, "process_type")) {
    formData.set("process_type", "operational");
  }

  if (!value(formData, "return_to")) {
    formData.set("return_to", "/admin");
  }

  return createProcessDraft(formData);
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
  const { supabase } = await requireAdminAccess();
  const editableError = await assertEditableProcess(supabase, processId);

  if (editableError) {
    return { error: editableError.message, stage: null };
  }

  const { data, error } = await supabase
    .from("subprocesses")
    .insert({
      process_id: processId,
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      sort_order: numberValue(formData, "sort_order"),
    })
    .select("id,name,description,sort_order")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "No se pudo crear la etapa.", stage: null };
  }

  return {
    error: null,
    stage: {
      sort_order: data.sort_order,
      subprocess_description: data.description,
      subprocess_id: data.id,
      subprocess_name: data.name,
    },
  };
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

type ActivationSubprocessRow = {
  criticality: string | null;
  description: string | null;
  id: string;
  impact_percent: number | null;
  name: string | null;
  sort_order: number | null;
  status: string | null;
};

type ActivationProcessRoleRow = {
  responsibility_type: string | null;
  role_id: string | null;
  subprocess_id: string | null;
};

async function buildProcessMasterForActivation(
  supabase: AdminSupabaseClient,
  processId: string,
): Promise<{ error: Error | null; process: ProcessMasterDto | null; status: string | null }> {
  const [processResult, subprocessesResult, rolesResult, roleDictionaryResult] = await Promise.all([
    getEditableProcessCatalogItem(processId),
    supabase
      .from("subprocesses")
      .select("id,name,description,criticality,impact_percent,sort_order,status")
      .eq("process_id", processId)
      .eq("status", "active")
      .order("sort_order", { nullsFirst: false })
      .order("name"),
    supabase
      .from("process_roles")
      .select("subprocess_id,role_id,responsibility_type")
      .eq("process_id", processId)
      .not("subprocess_id", "is", null)
      .in("responsibility_type", ["owner", "user", "consulted", "backup"]),
    getRoleDictionary(),
  ]);

  const error = processResult.error ?? subprocessesResult.error ?? rolesResult.error ?? roleDictionaryResult.error;

  if (error) {
    return { error: new Error(error.message), process: null, status: null };
  }

  if (!processResult.data) {
    return { error: new Error("No se encontro el proceso."), process: null, status: null };
  }

  const officialRoles = new Map(
    roleDictionaryResult.data
      .filter((role) => role.role_status === "active")
      .map((role) => [role.role_id, role]),
  );
  const roles = (rolesResult.data ?? []) as ActivationProcessRoleRow[];
  const rolesBySubprocess = new Map<string, ActivationProcessRoleRow[]>();

  for (const role of roles) {
    if (!role.subprocess_id || !role.role_id || !officialRoles.has(role.role_id)) {
      continue;
    }

    const current = rolesBySubprocess.get(role.subprocess_id) ?? [];
    current.push(role);
    rolesBySubprocess.set(role.subprocess_id, current);
  }

  const stages: ProcessMasterStage[] = ((subprocessesResult.data ?? []) as ActivationSubprocessRow[]).map((stage, index) => {
    const stageRoles = rolesBySubprocess.get(stage.id) ?? [];
    const owner = stageRoles.find((role) => role.responsibility_type === "owner") ?? null;
    const user = stageRoles.find((role) => role.responsibility_type === "user") ?? null;
    const backup = stageRoles.find((role) => role.responsibility_type === "backup") ?? null;
    const supportRoles = stageRoles.filter((role) => role.responsibility_type === "consulted");
    const ownerMeta = owner?.role_id ? officialRoles.get(owner.role_id) : null;

    return {
      backup_role_id: backup?.role_id ?? null,
      criticality: stage.criticality === "low" || stage.criticality === "high" || stage.criticality === "critical" ? stage.criticality : "medium",
      description: stage.description,
      id: stage.id,
      impact_percent: stage.impact_percent,
      name: stage.name ?? `Etapa ${index + 1}`,
      owner_person_name: ownerMeta?.current_person_name ?? null,
      owner_role_id: owner?.role_id ?? null,
      owner_role_name: ownerMeta?.role_name ?? null,
      sort_order: stage.sort_order ?? index + 1,
      status: "active",
      support_role_ids: supportRoles.map((role) => role.role_id).filter((roleId): roleId is string => Boolean(roleId)),
      user_role_id: user?.role_id ?? null,
    };
  });
  const firstOwner = stages.find((stage) => stage.owner_role_id) ?? null;

  return {
    error: null,
    process: {
      process: {
        area_id: processResult.data.area_id,
        area_name: processResult.data.area_name,
        basic_kpi: processResult.data.basic_kpi,
        company_id: processResult.data.company_id ?? "",
        company_name: processResult.data.company_name,
        criticality: processResult.data.criticality === "low" || processResult.data.criticality === "high" || processResult.data.criticality === "critical" ? processResult.data.criticality : "medium",
        processCode: processResult.data.process_code,
        version: processResult.data.version,
        masterUpdatedAt: processResult.data.master_updated_at,
        createdAt: processResult.data.created_at,
        effectiveDate: processResult.data.effective_date,
        description: processResult.data.definition,
        documentation_status: processResult.data.documentation_status === "not_started" || processResult.data.documentation_status === "documented" || processResult.data.documentation_status === "needs_update" ? processResult.data.documentation_status : "draft",
        expected_result: processResult.data.expected_result,
        id: processResult.data.process_id,
        inputs_providers: processResult.data.inputs_providers,
        supplier_origin: processResult.data.supplier_origin,
        process_inputs: processResult.data.process_inputs,
        process_outputs: processResult.data.process_outputs,
        client_destination: processResult.data.client_destination,
        name: processResult.data.process_name,
        objective: processResult.data.objective,
        processStart: processResult.data.process_start,
        processEnd: processResult.data.process_end,
        scope: processResult.data.scope,
        outputs_clients: processResult.data.outputs_clients,
        pdca: {
          plan: processResult.data.pdca_plan,
          do: processResult.data.pdca_do,
          check: processResult.data.pdca_check,
          act: processResult.data.pdca_act,
        },
        process_type: processResult.data.process_type === "strategic" || processResult.data.process_type === "support" ? processResult.data.process_type : "operational",
        status: processResult.data.status === "active" || processResult.data.status === "archived" ? processResult.data.status : "inactive",
      },
      responsibility: {
        owner_person_id: processResult.data.owner_person_id,
        owner_person_name: processResult.data.owner_person_name ?? firstOwner?.owner_person_name ?? null,
        owner_role_id: processResult.data.owner_role_id ?? firstOwner?.owner_role_id ?? null,
        owner_role_name: processResult.data.owner_role_name ?? firstOwner?.owner_role_name ?? null,
      },
      stages,
      roleProfiles: [],
      metrics: [],
      risks: [],
    },
    status: processResult.data.status,
  };
}
export async function saveProcessRoleProfiles(
  processId: string,
  rows: Array<{
    accountability: string;
    authority: string;
    clientId: string;
    profileId: string | null;
    responsibility: string;
    roleId: string;
    sortOrder: number;
  }>,
): Promise<{ data: Array<{ clientId: string; id: string }> | null; error: string | null }> {
  const { supabase } = await requireAdminAccess();
  if (!processId || !Array.isArray(rows)) return { data: null, error: 'Proceso o bloque de roles no definido.' };

  const editableError = await assertEditableProcess(supabase, processId);
  if (editableError) return { data: null, error: editableError.message };

  const normalizedRows = rows.map((row, index) => ({
    accountability: typeof row.accountability === 'string' ? row.accountability.trim() : '',
    authority: typeof row.authority === 'string' ? row.authority.trim() : '',
    clientId: typeof row.clientId === 'string' ? row.clientId : '',
    profileId: typeof row.profileId === 'string' && row.profileId.trim() ? row.profileId.trim() : null,
    responsibility: typeof row.responsibility === 'string' ? row.responsibility.trim() : '',
    roleId: typeof row.roleId === 'string' ? row.roleId.trim() : '',
    sortOrder: Number.isInteger(row.sortOrder) && row.sortOrder >= 0 ? row.sortOrder : index,
  }));
  if (normalizedRows.some((row) => !row.clientId || !row.roleId)) {
    return { data: null, error: 'Selecciona un rol oficial en cada fila.' };
  }

  const submittedProfileIds = normalizedRows.flatMap((row) => row.profileId ? [row.profileId] : []);
  if (new Set(submittedProfileIds).size !== submittedProfileIds.length) {
    return { data: null, error: 'Una fila documental no puede enviarse más de una vez.' };
  }

  const processAdmin = createSupabaseAdminClient();
  const [{ data: process, error: processError }, { data: existingProfiles, error: existingError }] = await Promise.all([
    processAdmin.from('processes').select('company_id').eq('id', processId).maybeSingle(),
    processAdmin.from('process_role_profiles').select('id').eq('process_id', processId),
  ]);
  if (processError || !process) return { data: null, error: 'El proceso ya no está disponible.' };
  if (existingError) return { data: null, error: 'No se pudieron cargar los perfiles actuales.' };

  const existingProfileIds = new Set((existingProfiles ?? []).map((profile) => profile.id as string));
  if (submittedProfileIds.some((profileId) => !existingProfileIds.has(profileId))) {
    return { data: null, error: 'Una fila de rol no pertenece al proceso indicado.' };
  }

  const uniqueRoleIds = [...new Set(normalizedRows.map((row) => row.roleId))];
  if (uniqueRoleIds.length) {
    const { data: officialRoles, error: rolesError } = await processAdmin
      .from('v_role_dictionary')
      .select('role_id,company_id')
      .in('role_id', uniqueRoleIds)
      .eq('role_status', 'active');
    if (rolesError) return { data: null, error: 'No se pudieron validar los roles oficiales.' };

    const validRoleIds = new Set(
      (officialRoles ?? [])
        .filter((role) => role.company_id === process.company_id)
        .map((role) => role.role_id),
    );
    if (uniqueRoleIds.some((roleId) => !validRoleIds.has(roleId))) {
      return { data: null, error: 'Todos los roles deben estar activos y pertenecer a la empresa del proceso.' };
    }
  }

  const savedProfiles: Array<{ clientId: string; id: string }> = [];
  for (const row of normalizedRows) {
    const values = {
      accountability_description: row.accountability || null,
      authority_description: row.authority || null,
      responsibility_description: row.responsibility || null,
      role_id: row.roleId,
      sort_order: row.sortOrder,
      status: 'active',
    };

    if (row.profileId) {
      const { data: updatedProfile, error: updateError } = await processAdmin
        .from('process_role_profiles')
        .update(values)
        .eq('id', row.profileId)
        .eq('process_id', processId)
        .select('id')
        .maybeSingle();
      if (updateError || !updatedProfile) return { data: null, error: 'No se pudo actualizar una fila de rol.' };
      savedProfiles.push({ clientId: row.clientId, id: updatedProfile.id as string });
      continue;
    }

    const { data: insertedProfile, error: insertError } = await processAdmin
      .from('process_role_profiles')
      .insert({ ...values, process_id: processId })
      .select('id')
      .single();
    if (insertError || !insertedProfile) return { data: null, error: 'No se pudo crear una fila de rol.' };
    savedProfiles.push({ clientId: row.clientId, id: insertedProfile.id as string });
  }

  const desiredProfileIds = new Set(savedProfiles.map((profile) => profile.id));
  const removedProfileIds = [...existingProfileIds].filter((profileId) => !desiredProfileIds.has(profileId));
  if (removedProfileIds.length) {
    const { error: deleteError } = await processAdmin
      .from('process_role_profiles')
      .delete()
      .eq('process_id', processId)
      .in('id', removedProfileIds);
    if (deleteError) return { data: null, error: 'Los perfiles se guardaron, pero no fue posible quitar las filas eliminadas.' };
  }

  return { data: savedProfiles, error: null };
}const processMetricFrequencies = new Set([
  '',
  'Diaria',
  'Semanal',
  'Quincenal',
  'Mensual',
  'Trimestral',
  'Semestral',
  'Anual',
]);

function normalizedResponsibleRoleIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((roleId) => typeof roleId === 'string' && roleId.trim() ? [roleId.trim()] : []);
}

async function validateProcessResponsibleRoles(
  supabase: ProcessAdminClient,
  processId: string,
  roleIds: string[],
) {
  const { data: process, error: processError } = await supabase
    .from('processes')
    .select('company_id')
    .eq('id', processId)
    .maybeSingle();
  if (processError || !process) return new Error('El proceso ya no esta disponible.');
  if (!roleIds.length) return null;

  const { data: roles, error: rolesError } = await supabase
    .from('v_role_dictionary')
    .select('role_id,company_id')
    .in('role_id', roleIds)
    .eq('role_status', 'active');
  if (rolesError) return new Error('No se pudieron validar los roles responsables.');

  const validRoleIds = new Set(
    (roles ?? [])
      .filter((role) => role.company_id === process.company_id)
      .map((role) => role.role_id),
  );
  return validRoleIds.size === roleIds.length && roleIds.every((roleId) => validRoleIds.has(roleId))
    ? null
    : new Error('Todos los responsables deben ser roles oficiales activos de la empresa del proceso.');
}

async function syncResponsibleRoles(
  supabase: ProcessAdminClient,
  table: 'metric_responsible_roles' | 'control_responsible_roles',
  parentColumn: 'metric_id' | 'control_id',
  parentId: string,
  roleIds: string[],
) {
  const { data: existingRows, error: existingError } = await supabase
    .from(table)
    .select('role_id')
    .eq(parentColumn, parentId);
  if (existingError) return existingError;

  if (roleIds.length) {
    const { error: upsertError } = await supabase.from(table).upsert(
      roleIds.map((roleId, sortOrder) => ({
        [parentColumn]: parentId,
        role_id: roleId,
        sort_order: sortOrder,
      })),
      { onConflict: `${parentColumn},role_id` },
    );
    if (upsertError) return upsertError;
  }

  const desiredRoleIds = new Set(roleIds);
  const removedRoleIds = (existingRows ?? [])
    .map((row) => row.role_id as string)
    .filter((roleId) => !desiredRoleIds.has(roleId));
  if (!removedRoleIds.length) return null;

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq(parentColumn, parentId)
    .in('role_id', removedRoleIds);
  return deleteError;
}

export async function saveProcessMetrics(
  processId: string,
  rows: ProcessMetricSaveRow[],
): Promise<{ data: ProcessMetricSaveRow[] | null; error: string | null }> {
  const { supabase } = await requireAdminAccess();
  if (!processId || !Array.isArray(rows)) return { data: null, error: 'Proceso o indicadores no definidos.' };
  if (rows.length > 100) return { data: null, error: 'No se pueden guardar mas de 100 indicadores a la vez.' };
  const editableError = await assertEditableProcess(supabase, processId);
  if (editableError) return { data: null, error: editableError.message };

  const normalizedRows = rows.map((row) => ({
    formula: typeof row.formula === 'string' ? row.formula.trim() : '',
    frequency: typeof row.frequency === 'string' ? row.frequency.trim() : '',
    id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null,
    name: typeof row.name === 'string' ? row.name.trim() : '',
    responsibleRoleIds: normalizedResponsibleRoleIds(row.responsibleRoleIds),
    target: typeof row.target === 'string' ? row.target.trim() : '',
  }));
  if (normalizedRows.some((row) => !row.name)) return { data: null, error: 'Ingresa el nombre de cada indicador.' };
  if (normalizedRows.some((row) => row.name.length > 200 || row.formula.length > 2000 || row.target.length > 1000)) {
    return { data: null, error: 'Uno de los indicadores supera el largo permitido.' };
  }
  if (normalizedRows.some((row) => !processMetricFrequencies.has(row.frequency))) return { data: null, error: 'Selecciona una frecuencia valida.' };
  if (normalizedRows.some((row) => new Set(row.responsibleRoleIds).size !== row.responsibleRoleIds.length)) {
    return { data: null, error: 'Un responsable no puede repetirse dentro del mismo indicador.' };
  }

  const processAdmin = createSupabaseAdminClient();
  const allRoleIds = [...new Set(normalizedRows.flatMap((row) => row.responsibleRoleIds))];
  const roleError = await validateProcessResponsibleRoles(processAdmin, processId, allRoleIds);
  if (roleError) return { data: null, error: roleError.message };

  const { data: existingRows, error: existingError } = await processAdmin
    .from('metrics')
    .select('id')
    .eq('process_id', processId)
    .is('subprocess_id', null)
    .eq('status', 'active');
  if (existingError) return { data: null, error: 'No se pudieron cargar los indicadores actuales.' };
  const existingIds = new Set((existingRows ?? []).map((row) => row.id as string));
  if (normalizedRows.some((row) => row.id && !existingIds.has(row.id))) {
    return { data: null, error: 'Uno de los indicadores no pertenece a este proceso.' };
  }

  const savedRows: ProcessMetricSaveRow[] = [];
  for (const [index, row] of normalizedRows.entries()) {
    let metricId = row.id;
    const values = {
      formula: row.formula || null,
      frequency: row.frequency || null,
      name: row.name,
      sort_order: index + 1,
      target: row.target || null,
    };
    if (metricId) {
      const { data, error } = await processAdmin
        .from('metrics')
        .update(values)
        .eq('id', metricId)
        .eq('process_id', processId)
        .is('subprocess_id', null)
        .select('id')
        .maybeSingle();
      if (error || !data) return { data: null, error: 'No se pudo actualizar uno de los indicadores.' };
    } else {
      const { data, error } = await processAdmin
        .from('metrics')
        .insert({ ...values, process_id: processId, status: 'active', subprocess_id: null })
        .select('id')
        .single();
      if (error || !data) return { data: null, error: 'No se pudo crear uno de los indicadores.' };
      metricId = data.id as string;
    }

    const assignmentError = await syncResponsibleRoles(
      processAdmin,
      'metric_responsible_roles',
      'metric_id',
      metricId,
      row.responsibleRoleIds,
    );
    if (assignmentError) return { data: null, error: 'No se pudieron sincronizar los responsables de indicadores.' };
    savedRows.push({ ...row, id: metricId });
  }

  const desiredIds = new Set(savedRows.flatMap((row) => row.id ? [row.id] : []));
  const removedIds = [...existingIds].filter((id) => !desiredIds.has(id));
  if (removedIds.length) {
    const { error } = await processAdmin
      .from('metrics')
      .delete()
      .eq('process_id', processId)
      .is('subprocess_id', null)
      .in('id', removedIds);
    if (error) return { data: null, error: 'Los indicadores se guardaron, pero no fue posible quitar las filas eliminadas.' };
  }

  return { data: savedRows, error: null };
}

export async function saveProcessRisksAndControls(
  processId: string,
  rows: ProcessRiskControlSaveRow[],
): Promise<{ data: ProcessRiskControlSaveRow[] | null; error: string | null }> {
  const { supabase } = await requireAdminAccess();
  if (!processId || !Array.isArray(rows)) return { data: null, error: 'Proceso o riesgos no definidos.' };
  if (rows.length > 100) return { data: null, error: 'No se pueden guardar mas de 100 controles a la vez.' };
  const editableError = await assertEditableProcess(supabase, processId);
  if (editableError) return { data: null, error: editableError.message };

  const normalizedRows = rows.map((row) => ({
    controlId: typeof row.controlId === 'string' && row.controlId.trim() ? row.controlId.trim() : null,
    controlName: typeof row.controlName === 'string' ? row.controlName.trim() : '',
    evidence: typeof row.evidence === 'string' ? row.evidence.trim() : '',
    responsibleRoleIds: normalizedResponsibleRoleIds(row.responsibleRoleIds),
    riskId: typeof row.riskId === 'string' && row.riskId.trim() ? row.riskId.trim() : null,
    riskName: typeof row.riskName === 'string' ? row.riskName.trim() : '',
    riskType: row.riskType === 'opportunity' ? 'opportunity' as const : 'risk' as const,
  }));
  if (normalizedRows.some((row) => row.riskName.length > 500 || row.controlName.length > 500 || row.evidence.length > 2000)) {
    return { data: null, error: 'Uno de los riesgos o controles supera el largo permitido.' };
  }
  if (normalizedRows.some((row) => !row.riskName || !row.controlName)) {
    return { data: null, error: 'Completa el riesgo u oportunidad y su control en cada fila.' };
  }
  if (normalizedRows.some((row) => new Set(row.responsibleRoleIds).size !== row.responsibleRoleIds.length)) {
    return { data: null, error: 'Un responsable no puede repetirse dentro del mismo control.' };
  }

  const existingRiskDefinitions = new Map<string, string>();
  for (const row of normalizedRows) {
    if (!row.riskId) continue;
    const definition = `${row.riskType}\u0000${row.riskName}`;
    const previous = existingRiskDefinitions.get(row.riskId);
    if (previous && previous !== definition) {
      return { data: null, error: 'Las filas de un mismo riesgo deben conservar el mismo tipo y descripcion.' };
    }
    existingRiskDefinitions.set(row.riskId, definition);
  }

  const processAdmin = createSupabaseAdminClient();
  const allRoleIds = [...new Set(normalizedRows.flatMap((row) => row.responsibleRoleIds))];
  const roleError = await validateProcessResponsibleRoles(processAdmin, processId, allRoleIds);
  if (roleError) return { data: null, error: roleError.message };

  const { data: riskRows, error: riskError } = await processAdmin
    .from('risks')
    .select('id')
    .eq('process_id', processId)
    .is('subprocess_id', null)
    .eq('status', 'active');
  if (riskError) return { data: null, error: 'No se pudieron cargar los riesgos actuales.' };
  const existingRiskIds = new Set((riskRows ?? []).map((row) => row.id as string));
  if (normalizedRows.some((row) => row.riskId && !existingRiskIds.has(row.riskId))) {
    return { data: null, error: 'Uno de los riesgos no pertenece a este proceso.' };
  }

  const riskIds = [...existingRiskIds];
  const { data: controlRows, error: controlError } = riskIds.length
    ? await processAdmin
        .from('controls')
        .select('id,risk_id')
        .eq('process_id', processId)
        .in('risk_id', riskIds)
        .eq('status', 'active')
    : { data: [], error: null };
  if (controlError) return { data: null, error: 'No se pudieron cargar los controles actuales.' };
  const existingControlById = new Map((controlRows ?? []).map((row) => [row.id as string, row.risk_id as string]));
  if (normalizedRows.some((row) => row.controlId && (!existingControlById.has(row.controlId) || existingControlById.get(row.controlId) !== row.riskId))) {
    return { data: null, error: 'Uno de los controles no pertenece al riesgo indicado.' };
  }

  const updatedRiskIds = new Set<string>();
  const savedRows: ProcessRiskControlSaveRow[] = [];
  for (const row of normalizedRows) {
    let riskId = row.riskId;
    if (riskId && !updatedRiskIds.has(riskId)) {
      const { data, error } = await processAdmin
        .from('risks')
        .update({ name: row.riskName, risk_type: row.riskType })
        .eq('id', riskId)
        .eq('process_id', processId)
        .is('subprocess_id', null)
        .select('id')
        .maybeSingle();
      if (error || !data) return { data: null, error: 'No se pudo actualizar uno de los riesgos.' };
      updatedRiskIds.add(riskId);
    } else if (!riskId) {
      const { data, error } = await processAdmin
        .from('risks')
        .insert({ name: row.riskName, process_id: processId, risk_type: row.riskType, severity: 'medium', status: 'active', subprocess_id: null })
        .select('id')
        .single();
      if (error || !data) return { data: null, error: 'No se pudo crear uno de los riesgos.' };
      riskId = data.id as string;
      updatedRiskIds.add(riskId);
    }

    let controlId = row.controlId;
    const controlValues = { evidence: row.evidence || null, name: row.controlName };
    if (controlId) {
      const { data, error } = await processAdmin
        .from('controls')
        .update(controlValues)
        .eq('id', controlId)
        .eq('process_id', processId)
        .eq('risk_id', riskId)
        .select('id')
        .maybeSingle();
      if (error || !data) return { data: null, error: 'No se pudo actualizar uno de los controles.' };
    } else {
      const { data, error } = await processAdmin
        .from('controls')
        .insert({ ...controlValues, process_id: processId, risk_id: riskId, status: 'active' })
        .select('id')
        .single();
      if (error || !data) return { data: null, error: 'No se pudo crear uno de los controles.' };
      controlId = data.id as string;
    }

    const assignmentError = await syncResponsibleRoles(
      processAdmin,
      'control_responsible_roles',
      'control_id',
      controlId,
      row.responsibleRoleIds,
    );
    if (assignmentError) return { data: null, error: 'No se pudieron sincronizar los responsables de controles.' };
    savedRows.push({ ...row, controlId, riskId });
  }

  const desiredControlIds = new Set(savedRows.flatMap((row) => row.controlId ? [row.controlId] : []));
  const removedControlIds = [...existingControlById.keys()].filter((id) => !desiredControlIds.has(id));
  if (removedControlIds.length) {
    const { error } = await processAdmin
      .from('controls')
      .delete()
      .eq('process_id', processId)
      .in('id', removedControlIds);
    if (error) return { data: null, error: 'Los riesgos se guardaron, pero no fue posible quitar los controles eliminados.' };
  }

  return { data: savedRows, error: null };
}
async function persistProcessBasics(formData: FormData): Promise<{ error: string | null }> {
  const processId = value(formData, "process_id");
  const { supabase } = await requireAdminAccess();
  const areaProvided = formData.has("area_id");
  const areaId = areaProvided ? optionalValue(formData, "area_id") : null;
  const ownerRoleProvided = formData.has("owner_role_id");
  const ownerRoleId = ownerRoleProvided ? optionalValue(formData, "owner_role_id") : null;

  if (!processId) return { error: "Proceso no definido." };

  const editableError = await assertEditableProcess(supabase, processId);
  if (editableError) return { error: editableError.message };

  if (areaProvided) {
    let validationClient: ProcessAdminClient;
    try {
      validationClient = createSupabaseAdminClient();
    } catch {
      return { error: "No se pudo inicializar el servicio seguro de procesos." };
    }
    const { data: processContext, error: processContextError } = await validationClient
      .from("processes")
      .select("company_id,area_id")
      .eq("id", processId)
      .maybeSingle();
    if (processContextError || !processContext?.company_id) return { error: "No se pudo validar la empresa del proceso." };
    if (areaId !== processContext.area_id) {
      const operationTypeError = await validateSelectedProcessOperationType(validationClient, areaId, processContext.company_id);
      if (operationTypeError) return { error: operationTypeError.message };
    }
  }

  if (ownerRoleProvided) {
    let validationClient: ProcessAdminClient;
    try {
      validationClient = createSupabaseAdminClient();
    } catch {
      return { error: "No se pudo inicializar el servicio seguro de procesos." };
    }
    const ownerError = await validateOfficialProcessOwner(validationClient, ownerRoleId);
    if (ownerError) return { error: ownerError.message };
  }

  const updates: Record<string, unknown> = {};
  const optionalFields = [
    "purpose",
    "process_start",
    "process_end",
    "scope",
    "supplier_origin",
    "process_inputs",
    "process_outputs",
    "client_destination",
  ] as const;

  if (formData.has("name")) {
    const name = value(formData, "name");
    if (!name) return { error: "Ingresa el nombre del proceso." };
    updates.name = name;
  }
  if (areaProvided) updates.area_id = areaId;
  if (formData.has("process_type")) updates.process_type = processTypeValue(formData);
  if (ownerRoleProvided) updates.owner_role_id = ownerRoleId;

  for (const field of optionalFields) {
    if (!formData.has(field)) continue;
    const column = field === "purpose" ? "objective" : field;
    updates[column] = optionalValue(formData, field);
  }

  if (Object.keys(updates).length === 0) return { error: "No se recibieron cambios para guardar." };

  const { error } = await supabase.from("processes").update(updates).eq("id", processId);
  return { error: error ? processWriteErrorMessage(error, "No se pudo actualizar el proceso.") : null };
}

export async function saveProcessBasicsInline(formData: FormData): Promise<{ error: string | null }> {
  return persistProcessBasics(formData);
}

export async function updateProcessBasics(formData: FormData) {
  const returnTo = internalReturnTo(formData, `/procesos/${value(formData, "process_id")}/editar`);
  const result = await persistProcessBasics(formData);
  if (result.error) fail(result.error, returnTo);
  done("Proceso actualizado", returnTo);
}export async function activateProcess(input: FormData | string) {
  const processId = typeof input === "string" ? input : value(input, "process_id");
  const returnTo = `/procesos/${processId}/editar`;

  if (!processId) {
    fail("Proceso no definido", "/procesos");
  }

  const { supabase } = await requireAdminAccess();
  const readModel = await buildProcessMasterForActivation(supabase, processId);

  if (readModel.error) {
    fail(readModel.error.message, returnTo);
  }

  if (!readModel.process) {
    fail("No se encontro el proceso.", "/procesos");
  }

  if (readModel.status === "archived") {
    fail("No se puede activar un proceso archivado.", returnTo);
  }

  if (readModel.status === "active") {
    revalidatePath("/procesos");
    revalidatePath(`/procesos/${processId}`);
    revalidatePath(`/procesos/${processId}/editar`);
    redirect(withMessage(`/procesos/${processId}`, "ok", "El proceso ya estaba activo"));
  }

  if (readModel.status !== "inactive") {
    fail("Solo se pueden activar procesos en borrador.", returnTo);
  }

  const validation = validateProcessForActivation(readModel.process);

  if (!validation.isValid) {
    const missing = validation.missingFields.map((field) => field.label).join("; ");
    fail(`No se pudo activar el proceso. Faltan: ${missing}`, returnTo);
  }

  const { error } = await supabase
    .from("processes")
    .update({
      documentation_status: "documented",
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", processId)
    .eq("status", "inactive");

  if (error) {
    fail(error.message, returnTo);
  }

  revalidatePath("/procesos");
  revalidatePath(`/procesos/${processId}`);
  revalidatePath(`/procesos/${processId}/editar`);
  redirect(withMessage(`/procesos/${processId}`, "ok", "Proceso activado"));
}
export async function updateSubprocessBasics(formData: FormData) {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const returnTo = internalReturnTo(formData, `/procesos/${processId}/editar`);
  const { supabase } = await requireAdminAccess();
  const { error } = await supabase
    .from("subprocesses")
    .update({
      name: value(formData, "name"),
      description: optionalValue(formData, "description"),
      criticality: value(formData, "criticality"),
      impact_percent: numberValue(formData, "impact_percent"),
    })
    .eq("id", subprocessId)
    .eq("process_id", processId);

  if (error) {
    fail(error.message, returnTo);
  }

  done("Etapa actualizada", returnTo);
}

export async function addSubprocessBasic(formData: FormData) {
  const processId = value(formData, "process_id");
  const returnTo = internalReturnTo(formData, `/procesos/${processId}/editar`);
  const { supabase } = await requireAdminAccess();
  const { error } = await supabase.from("subprocesses").insert({
    process_id: processId,
    name: value(formData, "name"),
    description: optionalValue(formData, "description"),
    frequency: optionalValue(formData, "frequency"),
    criticality: value(formData, "criticality"),
    sort_order: numberValue(formData, "sort_order"),
    impact_percent: numberValue(formData, "impact_percent"),
  });

  if (error) {
    fail(error.message, returnTo);
  }

  done("Etapa agregada", returnTo);
}

export async function updateSubprocessOwnerRole(formData: FormData) {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const returnTo = internalReturnTo(formData, `/procesos/${processId}/editar`);
  const { supabase } = await requireAdminAccess();
  const error = await replaceProcessRole({
    supabase,
    criticality: value(formData, "criticality"),
    impactPercent: numberValue(formData, "impact_percent"),
    processId,
    responsibilityType: "owner",
    roleId: optionalValue(formData, "owner_role_id"),
    subprocessId,
  });

  if (error) {
    fail(error.message, returnTo);
  }

  done("Rol due\u00f1o actualizado", returnTo);
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

export async function deleteProcessPermanently(formData: FormData) {
  const processId = value(formData, "process_id");
  const confirmationText = value(formData, "confirmation_text");

  if (!processId || confirmationText !== "CONFIRMAR") {
    return { error: "Escribe CONFIRMAR exactamente para eliminar el proceso." };
  }

  await requireAdminAccess();
  let supabase: ProcessAdminClient;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    console.error("[deleteProcessPermanently] admin client initialization failed", error);
    return { error: "No se pudo eliminar definitivamente el proceso." };
  }

  const { data: process, error: processError } = await supabase
    .from("processes")
    .select("id,name")
    .eq("id", processId)
    .maybeSingle();

  if (processError || !process) {
    console.error("[deleteProcessPermanently] process verification failed", {
      code: processError?.code,
      details: processError?.details,
      hint: processError?.hint,
      message: processError?.message,
      processId,
    });
    return { error: "No se pudo eliminar definitivamente el proceso." };
  }

  const rpcPayload = {
    p_confirmation_name: confirmationText,
    p_process_id: processId,
  };
  const { data, error } = await supabase.rpc("delete_process_permanently", rpcPayload);

  if (error) {
    console.error("[deleteProcessPermanently] RPC failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      processId,
    });
    return { error: "No se pudo eliminar definitivamente el proceso." };
  }

  const deleted = Array.isArray(data)
    ? data.some((row) => row.process_id === processId && row.process_name === process.name)
    : false;
  if (!deleted) {
    console.error("[deleteProcessPermanently] RPC returned no matching deleted process", { processId });
    return { error: "No se pudo eliminar definitivamente el proceso." };
  }

  revalidatePath("/procesos");
  revalidatePath("/estructura");
  revalidatePath(`/procesos/${processId}`);
  revalidatePath(`/procesos/${processId}/editar`);
  return { error: null };
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

  return { error: null };
}

export async function updateSubprocessImpacts(
  processId: string,
  impacts: Array<{ subprocessId: string; impactPercent: number | null }>,
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

async function assertEditableProcess(
  supabase: AdminSupabaseClient,
  processId: string,
  subprocessId?: string,
) {
  const { data: process, error: processError } = await supabase
    .from("processes")
    .select("id,status")
    .eq("id", processId)
    .maybeSingle();

  if (processError) {
    return processError;
  }

  if (!process) {
    return new Error("No se encontro el proceso.");
  }

  if (process.status === "archived") {
    return new Error("No se puede editar un proceso archivado.");
  }

  if (!subprocessId) {
    return null;
  }

  const { data: subprocess, error: subprocessError } = await supabase
    .from("subprocesses")
    .select("id,status")
    .eq("id", subprocessId)
    .eq("process_id", processId)
    .maybeSingle();

  if (subprocessError) {
    return subprocessError;
  }

  if (!subprocess) {
    return new Error("No se encontro la etapa del proceso.");
  }

  if (subprocess.status === "archived") {
    return new Error("No se puede editar una etapa archivada.");
  }

  return null;
}

async function resolveOfficialRoleCompanyId({
  supabase,
  processId,
  roleId,
}: {
  supabase: AdminSupabaseClient;
  processId: string;
  roleId: string | null;
}) {
  if (!roleId) {
    return { error: null, roleCompanyId: null };
  }

  const { data: dictionaryRole, error: dictionaryRoleError } = await supabase
    .from("v_role_dictionary")
    .select("role_id,role_status,company_id")
    .eq("role_id", roleId)
    .maybeSingle();

  if (dictionaryRoleError) {
    return { error: dictionaryRoleError, roleCompanyId: null };
  }

  if (!dictionaryRole || dictionaryRole.role_status !== "active") {
    return { error: new Error("Selecciona un rol oficial activo."), roleCompanyId: null };
  }

  if (dictionaryRole.company_id) {
    return { error: null, roleCompanyId: dictionaryRole.company_id };
  }

  const { data: process, error: processError } = await supabase
    .from("processes")
    .select("operating_company_id, company_id")
    .eq("id", processId)
    .maybeSingle();

  if (processError) {
    return { error: processError, roleCompanyId: null };
  }

  return {
    error: null,
    roleCompanyId: process?.operating_company_id ?? process?.company_id ?? null,
  };
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
  const editableError = await assertEditableProcess(supabase, processId, subprocessId);

  if (editableError) {
    return editableError;
  }

  const roleResolution = await resolveOfficialRoleCompanyId({
    supabase,
    processId,
    roleId,
  });

  if (roleResolution.error) {
    return roleResolution.error;
  }

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

  const { error } = await supabase.from("process_roles").insert({
    process_id: processId,
    subprocess_id: subprocessId,
    role_id: roleId,
    role_company_id: roleResolution.roleCompanyId,
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

export async function updateSubprocessDetail(formData: FormData): Promise<{
  error: string | null;
  stage: { sort_order: number | null; subprocess_description: string | null; subprocess_id: string; subprocess_name: string } | null;
}> {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const name = value(formData, "name");
  const { supabase } = await requireAdminAccess();
  const editableError = await assertEditableProcess(supabase, processId, subprocessId);

  if (editableError) return { error: editableError.message, stage: null };
  if (!name) return { error: "Ingresa el nombre de la etapa.", stage: null };

  const { data, error } = await supabase
    .from("subprocesses")
    .update({
      name,
      description: optionalValue(formData, "description"),
      sort_order: numberValue(formData, "sort_order"),
    })
    .eq("id", subprocessId)
    .eq("process_id", processId)
    .select("id,name,description,sort_order")
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "No se pudo actualizar la etapa.", stage: null };
  return {
    error: null,
    stage: {
      sort_order: data.sort_order,
      subprocess_description: data.description,
      subprocess_id: data.id,
      subprocess_name: data.name,
    },
  };
}

export async function deleteSubprocess(formData: FormData): Promise<{ error: string | null }> {
  const processId = value(formData, "process_id");
  const subprocessId = value(formData, "subprocess_id");
  const { supabase } = await requireAdminAccess();
  const editableError = await assertEditableProcess(supabase, processId, subprocessId);

  if (editableError) return { error: editableError.message };

  const { error } = await supabase
    .from("subprocesses")
    .update({ status: "archived" })
    .eq("id", subprocessId)
    .eq("process_id", processId);

  return { error: error?.message ?? null };
}
