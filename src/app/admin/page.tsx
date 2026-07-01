import Image from "next/image";
import Link from "next/link";
import {
  criticalityOptions,
  documentationOptions,
  responsibilityOptions,
  roleLevelOptions,
} from "@/components/dashboard/badge";
import { requireAdminAccess } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addArea,
  addPerson,
  addProcess,
  addRole,
  addSubprocess,
  addSystem,
  archiveAccessAssignment,
  archiveSiteAccess,
  assignPersonRole,
  assignAccessRole,
  assignProcessRole,
  assignProcessSystem,
  authorizeDomainAccess,
  authorizeEmailAccess,
  grantSiteAccess,
  updateAccessRolePermissions,
  updateUserAccessProfile,
} from "./actions";

type SearchParams = Promise<{
  ok?: string;
  error?: string;
}>;

type IdName = {
  id: string;
  name: string;
};

type ProcessOption = IdName & {
  company_id: string;
};

type SubprocessOption = IdName & {
  process_id: string;
};

type UserProfileOption = {
  user_id: string;
  display_name: string;
  email: string;
  app_role: string;
  default_country_id: string | null;
  default_site_id: string | null;
  status: string;
};

type EmailAllowlistItem = {
  id: string;
  email: string;
  display_name: string | null;
  app_role: string;
  default_country_id: string | null;
  default_site_id: string | null;
  status: string;
};

type DomainAllowlistItem = {
  id: string;
  domain: string;
  app_role: string;
  default_country_id: string | null;
  default_site_id: string | null;
  status: string;
};

type SiteAccessItem = {
  id: string;
  user_id: string;
  country_id: string | null;
  site_id: string | null;
  access_level: string;
  status: string;
};

type PermissionItem = {
  id: string;
  code: string;
  name: string;
  module: string;
  status: string;
};

type AccessRoleItem = {
  id: string;
  role_code: string;
  name: string;
  description: string | null;
  status: string;
};

type AccessRolePermissionItem = {
  access_role_id: string;
  permission_id: string;
  status: string;
};

type UserAccessAssignmentItem = {
  id: string;
  person_id: string;
  access_role_id: string;
  scope_type: string;
  country_id: string | null;
  company_id: string | null;
  site_id: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
};

type PermissionOverrideItem = {
  id: string;
  person_id: string;
  permission_id: string;
  effect: string;
  scope_type: string;
  country_id: string | null;
  company_id: string | null;
  site_id: string | null;
  status: string;
  reason: string | null;
};

const appRoleOptions = [
  { label: "Administrador", value: "admin" },
  { label: "Gestion", value: "manager" },
  { label: "Operador", value: "operator" },
  { label: "Lectura", value: "viewer" },
];

const accessLevelOptions = [
  { label: "Administrador", value: "admin" },
  { label: "Editor", value: "editor" },
  { label: "Lectura", value: "viewer" },
];

const recordStatusOptions = [
  { label: "Activo", value: "active" },
  { label: "Archivado", value: "archived" },
];

async function getAdminOptions() {
  const supabase = createSupabaseServerClient();
  const { supabase: authSupabase } = await requireAdminAccess();

  const [
    companies,
    areas,
    processes,
    subprocesses,
    roles,
    people,
    systems,
    sites,
    countries,
    userProfiles,
    emailAllowlist,
    domainAllowlist,
    siteAccess,
    permissions,
    accessRoles,
    accessRolePermissions,
    userAccessAssignments,
    permissionOverrides,
  ] = await Promise.all([
    supabase.from("companies").select("id,name").order("name"),
    supabase.from("areas").select("id,name").order("name"),
    supabase.from("processes").select("id,name,company_id").order("name"),
    supabase.from("subprocesses").select("id,name,process_id").order("name"),
    supabase.from("roles").select("id,name").order("name"),
    supabase.from("people").select("id,name").order("name"),
    supabase.from("systems").select("id,name").order("name"),
    supabase.from("sites").select("id,name").order("name"),
    supabase.from("countries").select("id,name").order("name"),
    authSupabase
      .from("user_profiles")
      .select("user_id,display_name,email,app_role,default_country_id,default_site_id,status")
      .order("email"),
    authSupabase
      .from("auth_email_allowlist")
      .select("id,email,display_name,app_role,default_country_id,default_site_id,status")
      .order("email"),
    authSupabase
      .from("auth_domain_allowlist")
      .select("id,domain,app_role,default_country_id,default_site_id,status")
      .order("domain"),
    authSupabase
      .from("user_site_access")
      .select("id,user_id,country_id,site_id,access_level,status")
      .order("created_at", { ascending: false }),
    authSupabase
      .from("permissions")
      .select("id,code,name,module,status")
      .order("module")
      .order("code"),
    authSupabase
      .from("access_roles")
      .select("id,role_code,name,description,status")
      .order("name"),
    authSupabase
      .from("access_role_permissions")
      .select("access_role_id,permission_id,status"),
    authSupabase
      .from("user_access_assignments")
      .select("id,person_id,access_role_id,scope_type,country_id,company_id,site_id,status,start_date,end_date")
      .order("created_at", { ascending: false }),
    authSupabase
      .from("permission_overrides")
      .select("id,person_id,permission_id,effect,scope_type,country_id,company_id,site_id,status,reason")
      .order("created_at", { ascending: false }),
  ]);

  const firstError = [
    companies.error,
    areas.error,
    processes.error,
    subprocesses.error,
    roles.error,
    people.error,
    systems.error,
    sites.error,
    countries.error,
    userProfiles.error,
    emailAllowlist.error,
    domainAllowlist.error,
    siteAccess.error,
    permissions.error,
    accessRoles.error,
    accessRolePermissions.error,
    userAccessAssignments.error,
    permissionOverrides.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    companies: (companies.data ?? []) as IdName[],
    areas: (areas.data ?? []) as IdName[],
    processes: (processes.data ?? []) as ProcessOption[],
    subprocesses: (subprocesses.data ?? []) as SubprocessOption[],
    roles: (roles.data ?? []) as IdName[],
    people: (people.data ?? []) as IdName[],
    systems: (systems.data ?? []) as IdName[],
    sites: (sites.data ?? []) as IdName[],
    countries: (countries.data ?? []) as IdName[],
    userProfiles: (userProfiles.data ?? []) as UserProfileOption[],
    emailAllowlist: (emailAllowlist.data ?? []) as EmailAllowlistItem[],
    domainAllowlist: (domainAllowlist.data ?? []) as DomainAllowlistItem[],
    siteAccess: (siteAccess.data ?? []) as SiteAccessItem[],
    permissions: (permissions.data ?? []) as PermissionItem[],
    accessRoles: (accessRoles.data ?? []) as AccessRoleItem[],
    accessRolePermissions: (accessRolePermissions.data ?? []) as AccessRolePermissionItem[],
    userAccessAssignments: (userAccessAssignments.data ?? []) as UserAccessAssignmentItem[],
    permissionOverrides: (permissionOverrides.data ?? []) as PermissionOverrideItem[],
  };
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-20 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
    />
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#034982]"
      type="submit"
    >
      {children}
    </button>
  );
}

function AppRoleSelect({
  defaultValue = "viewer",
  name = "app_role",
}: {
  defaultValue?: string;
  name?: string;
}) {
  return (
    <Select defaultValue={defaultValue} name={name}>
      {appRoleOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

function StatusSelect({
  defaultValue = "active",
  name = "status",
}: {
  defaultValue?: string;
  name?: string;
}) {
  return (
    <Select defaultValue={defaultValue} name={name}>
      {recordStatusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

function CountrySelect({
  countries,
  defaultValue = "",
  name = "default_country_id",
}: {
  countries: IdName[];
  defaultValue?: string | null;
  name?: string;
}) {
  return (
    <Select defaultValue={defaultValue ?? ""} name={name}>
      <option value="">Sin pais por defecto</option>
      {countries.map((country) => (
        <option key={country.id} value={country.id}>
          {country.name}
        </option>
      ))}
    </Select>
  );
}

function SiteSelect({
  defaultValue = "",
  name = "default_site_id",
  required = false,
  sites,
}: {
  defaultValue?: string | null;
  name?: string;
  required?: boolean;
  sites: IdName[];
}) {
  return (
    <Select defaultValue={defaultValue ?? ""} name={name} required={required}>
      <option value="">Sin sede por defecto</option>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </Select>
  );
}

function AccessPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const toneClass = {
    good: "border-[#bfe8cd] bg-[#eefaf2] text-[#22613b]",
    neutral: "border-[#d6e1ea] bg-[#f8fafb] text-slate-600",
    warn: "border-[#ffd8a8] bg-[#fff4e8] text-[#8a4a00]",
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function roleLabel(role: string) {
  return appRoleOptions.find((option) => option.value === role)?.label ?? role;
}

function statusLabel(status: string) {
  return recordStatusOptions.find((option) => option.value === status)?.label ?? status;
}

function ChevronMark() {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] text-sm text-sea transition group-open:rotate-90">
      &gt;
    </span>
  );
}

function AccordionPanel({
  children,
  count,
  defaultOpen = false,
  description,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  count?: string;
  defaultOpen?: boolean;
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <details
      className="group rounded-2xl border border-[#cbd8e3] bg-white/95 shadow-[0_10px_28px_rgba(2,53,116,0.045)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <ChevronMark />
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="text-lg font-medium text-navy">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        {count ? <AccessPill>{count}</AccessPill> : null}
      </summary>
      <div className="border-t border-[#d6e1ea] px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

function scopeLabel(assignment: UserAccessAssignmentItem, options: Awaited<ReturnType<typeof getAdminOptions>>) {
  const country = options.countries.find((item) => item.id === assignment.country_id)?.name;
  const company = options.companies.find((item) => item.id === assignment.company_id)?.name;
  const site = options.sites.find((item) => item.id === assignment.site_id)?.name;

  if (assignment.scope_type === "global") return "Global";
  if (assignment.scope_type === "country") return country ? `Pais: ${country}` : "Pais sin definir";
  if (assignment.scope_type === "company") {
    return [country, company].filter(Boolean).join(" / ") || "Empresa sin definir";
  }
  if (assignment.scope_type === "site") {
    return [country, company, site].filter(Boolean).join(" / ") || "Sede sin definir";
  }
  return assignment.scope_type;
}

function scopeTypeLabel(scopeType: string) {
  const labels: Record<string, string> = {
    global: "Global",
    country: "Pais",
    company: "Empresa",
    site: "Sede",
  };

  return labels[scopeType] ?? scopeType;
}

function AccessRbacPanel({ options }: { options: Awaited<ReturnType<typeof getAdminOptions>> }) {
  const personById = new Map(options.people.map((person) => [person.id, person.name]));
  const permissionById = new Map(options.permissions.map((permission) => [permission.id, permission]));
  const roleById = new Map(options.accessRoles.map((role) => [role.id, role]));
  const permissionsByRole = new Map<string, PermissionItem[]>();

  for (const relation of options.accessRolePermissions) {
    if (relation.status !== "active") continue;
    const permission = permissionById.get(relation.permission_id);
    if (!permission) continue;
    const list = permissionsByRole.get(relation.access_role_id) ?? [];
    list.push(permission);
    permissionsByRole.set(relation.access_role_id, list);
  }

  const activeAssignments = options.userAccessAssignments.filter(
    (assignment) => assignment.status === "active",
  );
  const archivedAssignments = options.userAccessAssignments.filter(
    (assignment) => assignment.status !== "active",
  );
  const activeAssignmentsByPerson = new Map<string, UserAccessAssignmentItem[]>();
  for (const assignment of activeAssignments) {
    const list = activeAssignmentsByPerson.get(assignment.person_id) ?? [];
    list.push(assignment);
    activeAssignmentsByPerson.set(assignment.person_id, list);
  }
  const peopleWithMultipleActiveAssignments = new Set(
    [...activeAssignmentsByPerson.entries()]
      .filter(([, assignments]) => assignments.length > 1)
      .map(([personId]) => personId),
  );

  const scopeCounts = activeAssignments.reduce<Record<string, number>>((acc, assignment) => {
    acc[assignment.scope_type] = (acc[assignment.scope_type] ?? 0) + 1;
    return acc;
  }, {});

  const adminAssignments = activeAssignments.filter((assignment) => {
    const role = roleById.get(assignment.access_role_id);
    return role?.role_code.startsWith("ADMIN_");
  });

  return (
    <section className="mt-8">
      <AccordionPanel
        count={`${options.accessRoles.length} roles`}
        defaultOpen
        description="Modelo RBAC con roles de acceso reutilizables y alcance global, pais, empresa o sede."
        eyebrow="Permisos RBAC"
        title="Administracion de Accesos"
      >
        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Permisos</p>
            <p className="mt-2 text-2xl font-medium text-navy">{options.permissions.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Roles de acceso</p>
            <p className="mt-2 text-2xl font-medium text-navy">{options.accessRoles.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Accesos activos</p>
            <p className="mt-2 text-2xl font-medium text-navy">{activeAssignments.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Accesos archivados</p>
            <p className="mt-2 text-2xl font-medium text-navy">{archivedAssignments.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Excepciones</p>
            <p className="mt-2 text-2xl font-medium text-navy">{options.permissionOverrides.length}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <AccordionPanel
            count={`${activeAssignmentsByPerson.size} usuarios activos`}
            description="Personas con uno o mas roles de acceso activos."
            title="Usuarios"
          >
            <form action={assignAccessRole} className="mb-4 rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-medium text-navy">Asignar rol de acceso</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Elige una persona, un rol de acceso y el alcance donde aplica.
                  </p>
                </div>
                <AccessPill tone="good">RBAC</AccessPill>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                <Field label="Persona">
                  <Select name="person_id" required>
                    <option value="">Selecciona persona</option>
                    {options.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rol de acceso">
                  <Select name="access_role_id" required>
                    <option value="">Selecciona rol</option>
                    {options.accessRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Alcance">
                  <Select name="scope_type" required>
                    <option value="global">Global</option>
                    <option value="country">Pais</option>
                    <option value="company">Empresa</option>
                    <option value="site">Sede</option>
                  </Select>
                </Field>
                <Field label="Estado">
                  <StatusSelect />
                </Field>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                <Field label="Pais">
                  <Select name="country_id">
                    <option value="">Sin pais</option>
                    {options.countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Empresa">
                  <Select name="company_id">
                    <option value="">Sin empresa</option>
                    {options.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sede">
                  <Select name="site_id">
                    <option value="">Sin sede</option>
                    {options.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Inicio">
                  <Input name="start_date" type="date" />
                </Field>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Si eliges sede, el pais y la empresa se completan desde esa sede.
                </p>
                <Submit>Asignar acceso</Submit>
              </div>
            </form>
            <div className="overflow-hidden rounded-xl border border-[#d6e1ea]">
              <div className="grid grid-cols-[1fr_1.1fr_1.2fr_0.7fr] gap-3 border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>Persona</span>
                <span>Rol de acceso</span>
                <span>Alcance</span>
                <span>Estado</span>
              </div>
              <div className="divide-y divide-[#d6e1ea] bg-white">
                {activeAssignments.map((assignment) => {
                  const role = roleById.get(assignment.access_role_id);
                  return (
                    <div
                      className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_1.1fr_1.2fr_0.7fr_auto]"
                      key={assignment.id}
                    >
                      <div>
                        <span className="font-medium text-navy">
                          {personById.get(assignment.person_id) ?? "Persona sin nombre"}
                        </span>
                        {peopleWithMultipleActiveAssignments.has(assignment.person_id) ? (
                          <p className="mt-1 rounded-md border border-[#ffd8a8] bg-[#fff8ee] px-2 py-1 text-xs leading-5 text-[#8a4a00]">
                            Esta persona tiene múltiples accesos activos. Revisar si corresponde.
                          </p>
                        ) : null}
                      </div>
                      <span>{role?.name ?? "Rol no encontrado"}</span>
                      <span className="text-slate-600">{scopeLabel(assignment, options)}</span>
                      <AccessPill tone="good">
                        {statusLabel(assignment.status)}
                      </AccessPill>
                      <form action={archiveAccessAssignment}>
                        <input name="assignment_id" type="hidden" value={assignment.id} />
                        <button
                          className="rounded-lg border border-[#ffd8a8] px-3 py-1.5 text-xs font-medium text-[#8a4a00] transition hover:bg-[#fff4e8]"
                          type="submit"
                        >
                          Archivar
                        </button>
                      </form>
                    </div>
                  );
                })}
                {activeAssignments.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-600">
                    Aun no hay accesos activos RBAC.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea]">
              <div className="flex flex-col gap-1 border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3">
                <h3 className="text-sm font-semibold text-navy">Historial de accesos</h3>
                <p className="text-xs text-slate-500">
                  Accesos archivados o inactivos. No otorgan permisos actuales.
                </p>
              </div>
              <div className="grid grid-cols-[1fr_1.1fr_1.2fr_0.7fr] gap-3 border-b border-[#d6e1ea] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span>Persona</span>
                <span>Rol de acceso</span>
                <span>Alcance</span>
                <span>Estado</span>
              </div>
              <div className="divide-y divide-[#d6e1ea] bg-white">
                {archivedAssignments.map((assignment) => {
                  const role = roleById.get(assignment.access_role_id);
                  return (
                    <div
                      className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_1.1fr_1.2fr_0.7fr]"
                      key={assignment.id}
                    >
                      <span className="font-medium text-navy">
                        {personById.get(assignment.person_id) ?? "Persona sin nombre"}
                      </span>
                      <span>{role?.name ?? "Rol no encontrado"}</span>
                      <span className="text-slate-600">{scopeLabel(assignment, options)}</span>
                      <AccessPill tone="warn">{statusLabel(assignment.status)}</AccessPill>
                    </div>
                  );
                })}
                {archivedAssignments.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-600">
                    No hay accesos archivados.
                  </p>
                ) : null}
              </div>
            </div>
          </AccordionPanel>

          <AccordionPanel
            count={`${options.accessRoles.length} roles`}
            description="Roles de permisos del sistema. No son cargos funcionales."
            title="Roles de acceso"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {options.accessRoles.map((role) => (
                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4" key={role.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-medium text-navy">{role.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{role.description}</p>
                    </div>
                    <AccessPill>{role.role_code}</AccessPill>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {permissionsByRole.get(role.id)?.length ?? 0} permisos activos
                  </p>
                </div>
              ))}
            </div>
          </AccordionPanel>

          <AccordionPanel
            count={`${options.accessRolePermissions.length} relaciones`}
            description="Permisos internos incluidos en cada rol de acceso."
            title="Permisos por rol"
          >
            <div className="grid gap-3">
              {options.accessRoles.map((role) => {
                const rolePermissions = permissionsByRole.get(role.id) ?? [];
                const activePermissionIds = new Set(rolePermissions.map((permission) => permission.id));
                return (
                  <form
                    action={updateAccessRolePermissions}
                    className="rounded-xl border border-[#d6e1ea] bg-white p-4"
                    key={role.id}
                  >
                    <input name="access_role_id" type="hidden" value={role.id} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-navy">{role.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {rolePermissions.length} permisos activos
                        </p>
                      </div>
                      <button
                        className="rounded-lg bg-navy px-3 py-2 text-xs font-medium text-white transition hover:bg-[#034982]"
                        type="submit"
                      >
                        Guardar permisos
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {options.permissions.map((permission) => (
                        <label
                          className="flex items-start gap-2 rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2 text-sm"
                          key={permission.id}
                        >
                          <input
                            className="mt-1"
                            defaultChecked={activePermissionIds.has(permission.id)}
                            name="permission_ids"
                            type="checkbox"
                            value={permission.id}
                          />
                          <span>
                            <span className="block font-medium text-navy">{permission.code}</span>
                            <span className="text-xs text-slate-500">{permission.name}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </form>
                );
              })}
            </div>
          </AccordionPanel>

          <AccordionPanel
            count={`${options.userAccessAssignments.length} asignaciones`}
            description="Resumen de alcance operativo para evitar mezclar paises, empresas y sedes."
            title="Alcances"
          >
            <div className="grid gap-3 md:grid-cols-4">
              {["global", "country", "company", "site"].map((scopeType) => (
                <div className="rounded-xl border border-[#d6e1ea] bg-white p-4" key={scopeType}>
                  <p className="text-sm text-slate-500">{scopeTypeLabel(scopeType)}</p>
                  <p className="mt-2 text-2xl font-medium text-navy">{scopeCounts[scopeType] ?? 0}</p>
                </div>
              ))}
            </div>
          </AccordionPanel>

          <AccordionPanel
            count={`${adminAssignments.length} admins`}
            description="Lectura inicial para revisar usuarios con permisos altos y excepciones puntuales."
            title="Auditoria de permisos"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                <h3 className="text-sm font-semibold text-navy">Usuarios administradores</h3>
                <div className="mt-3 grid gap-2">
                  {adminAssignments.map((assignment) => (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f8fbfd] px-3 py-2 text-sm" key={assignment.id}>
                      <span>{personById.get(assignment.person_id) ?? "Persona sin nombre"}</span>
                      <AccessPill>{roleById.get(assignment.access_role_id)?.name ?? "Admin"}</AccessPill>
                    </div>
                  ))}
                  {adminAssignments.length === 0 ? (
                    <p className="text-sm text-slate-600">Sin administradores RBAC asignados.</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
                <h3 className="text-sm font-semibold text-navy">Excepciones</h3>
                <div className="mt-3 grid gap-2">
                  {options.permissionOverrides.map((override) => (
                    <div className="rounded-lg bg-[#f8fbfd] px-3 py-2 text-sm" key={override.id}>
                      <p className="font-medium text-navy">
                        {personById.get(override.person_id) ?? "Persona sin nombre"} /{" "}
                        {permissionById.get(override.permission_id)?.code ?? "permiso"}
                      </p>
                      <p className="text-slate-600">
                        {override.effect === "allow" ? "Permitir" : "Denegar"} -{" "}
                        {scopeTypeLabel(override.scope_type)}
                      </p>
                    </div>
                  ))}
                  {options.permissionOverrides.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      Sin excepciones. Bien: la regla principal sigue siendo por rol de acceso.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </AccordionPanel>
        </div>
      </AccordionPanel>
    </section>
  );
}

function AccessPanel({ options }: { options: Awaited<ReturnType<typeof getAdminOptions>> }) {
  const profileById = new Map(options.userProfiles.map((profile) => [profile.user_id, profile]));
  const countryById = new Map(options.countries.map((country) => [country.id, country.name]));
  const siteById = new Map(options.sites.map((site) => [site.id, site.name]));

  return (
    <section className="mt-8">
      <AccordionPanel
        count={`${options.userProfiles.length} usuarios`}
        defaultOpen
        description="Autoriza correos, dominios y sedes operativas para cada usuario."
        eyebrow="Acceso y permisos"
        title="Administracion de usuarios"
      >

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form action={authorizeEmailAccess} className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
          <h3 className="text-base font-medium text-navy">Autorizar correo</h3>
          <div className="mt-4 grid gap-3">
            <Field label="Correo">
              <Input name="email" placeholder="persona@mcparking.cl" required type="email" />
            </Field>
            <Field label="Nombre visible">
              <Input name="display_name" placeholder="Nombre de la persona" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rol de sistema">
                <AppRoleSelect defaultValue="viewer" />
              </Field>
              <Field label="Estado">
                <StatusSelect />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pais por defecto">
                <CountrySelect countries={options.countries} />
              </Field>
              <Field label="Sede por defecto">
                <SiteSelect sites={options.sites} />
              </Field>
            </div>
            <Submit>Autorizar correo</Submit>
          </div>
        </form>

        <form action={authorizeDomainAccess} className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
          <h3 className="text-base font-medium text-navy">Autorizar dominio</h3>
          <p className="mt-1 text-sm text-slate-600">
            Permite entrar a cualquier correo del dominio, por ejemplo mcparking.cl.
          </p>
          <div className="mt-4 grid gap-3">
            <Field label="Dominio">
              <Input name="domain" placeholder="mcparking.cl" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rol de sistema">
                <AppRoleSelect defaultValue="viewer" />
              </Field>
              <Field label="Estado">
                <StatusSelect />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pais por defecto">
                <CountrySelect countries={options.countries} />
              </Field>
              <Field label="Sede por defecto">
                <SiteSelect sites={options.sites} />
              </Field>
            </div>
            <Submit>Autorizar dominio</Submit>
          </div>
        </form>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea]">
        <div className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr] gap-3 border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <span>Usuario</span>
          <span>Rol</span>
          <span>Contexto</span>
          <span>Estado</span>
        </div>
        <div className="divide-y divide-[#d6e1ea]">
          {options.userProfiles.map((profile) => (
            <form
              action={updateUserAccessProfile}
              className="grid gap-3 bg-white px-4 py-4 transition hover:bg-[#fbfdff] lg:grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr_auto]"
              key={profile.user_id}
            >
              <input name="user_id" type="hidden" value={profile.user_id} />
              <div>
                <Input name="display_name" defaultValue={profile.display_name} />
                <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
              </div>
              <AppRoleSelect defaultValue={profile.app_role} />
              <div className="grid gap-2">
                <CountrySelect
                  countries={options.countries}
                  defaultValue={profile.default_country_id}
                />
                <SiteSelect sites={options.sites} defaultValue={profile.default_site_id} />
              </div>
              <StatusSelect defaultValue={profile.status} />
              <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white" type="submit">
                Guardar
              </button>
            </form>
          ))}
          {options.userProfiles.length === 0 ? (
            <div className="px-4 py-5 text-sm text-slate-600">
              Aun no hay usuarios con perfil creado. El perfil aparece despues del primer login autorizado.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <form action={grantSiteAccess} className="rounded-xl border border-[#d6e1ea] bg-[#f8fbfd] p-4">
          <h3 className="text-base font-medium text-navy">Asignar sede</h3>
          <div className="mt-4 grid gap-3">
            <Field label="Usuario">
              <Select name="user_id" required>
                {options.userProfiles.map((profile) => (
                  <option key={profile.user_id} value={profile.user_id}>
                    {profile.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sede">
              <SiteSelect name="site_id" required sites={options.sites} />
            </Field>
            <Field label="Nivel de acceso">
              <Select defaultValue="viewer" name="access_level">
                {accessLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <StatusSelect />
            </Field>
            <Submit>Guardar permiso</Submit>
          </div>
        </form>

        <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white">
          <div className="border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3">
            <h3 className="text-base font-semibold text-navy">Permisos por sede</h3>
          </div>
          <div className="divide-y divide-[#d6e1ea]">
            {options.siteAccess.map((access) => {
              const profile = profileById.get(access.user_id);
              return (
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" key={access.id}>
                  <div>
                    <p className="text-sm font-semibold text-navy">{profile?.email ?? "Usuario sin perfil"}</p>
                    <p className="text-xs text-slate-500">
                      {countryById.get(access.country_id ?? "") ?? "Sin pais"} /{" "}
                      {siteById.get(access.site_id ?? "") ?? "Sin sede"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AccessPill>{access.access_level}</AccessPill>
                    <AccessPill tone={access.status === "active" ? "good" : "warn"}>
                      {access.status === "active" ? "Activo" : "Archivado"}
                    </AccessPill>
                    {access.status === "active" ? (
                      <form action={archiveSiteAccess}>
                        <input name="access_id" type="hidden" value={access.id} />
                        <button className="rounded-md border border-[#ffd8a8] bg-[#fff4e8] px-3 py-1.5 text-xs font-semibold text-[#8a4a00]" type="submit">
                          Archivar
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {options.siteAccess.length === 0 ? (
              <div className="px-4 py-5 text-sm text-slate-600">
                No hay permisos de sede configurados.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white">
          <div className="border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-navy">Correos autorizados</h3>
              <AccessPill>{`${options.emailAllowlist.length} correos`}</AccessPill>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Correos especificos que pueden entrar, aunque su dominio no este abierto.
            </p>
          </div>
          <div className="divide-y divide-[#d6e1ea]">
            {options.emailAllowlist.map((item) => (
              <form action={authorizeEmailAccess} className="grid gap-3 px-4 py-4 xl:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_auto]" key={item.id}>
                <div>
                  <input name="email" type="hidden" value={item.email} />
                  <p className="text-sm font-medium text-navy">{item.email}</p>
                  <p className="text-xs text-slate-500">{item.display_name || "Sin nombre visible"}</p>
                </div>
                <Input name="display_name" defaultValue={item.display_name ?? ""} placeholder="Nombre visible" />
                <AppRoleSelect defaultValue={item.app_role} />
                <StatusSelect defaultValue={item.status} />
                <button className="rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] px-4 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-white" type="submit">
                  Guardar
                </button>
                <div className="xl:col-span-5 grid gap-3 sm:grid-cols-2">
                  <Field label="Pais por defecto">
                    <CountrySelect
                      countries={options.countries}
                      defaultValue={item.default_country_id}
                    />
                  </Field>
                  <Field label="Sede por defecto">
                    <SiteSelect sites={options.sites} defaultValue={item.default_site_id} />
                  </Field>
                </div>
              </form>
            ))}
            {options.emailAllowlist.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-600">Sin correos autorizados.</p>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#d6e1ea] bg-white">
          <div className="border-b border-[#d6e1ea] bg-[#f8fafb] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-navy">Dominios autorizados</h3>
              <AccessPill>{`${options.domainAllowlist.length} dominios`}</AccessPill>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Permiten entrar a usuarios de una organizacion completa.
            </p>
          </div>
          <div className="divide-y divide-[#d6e1ea]">
            {options.domainAllowlist.map((item) => (
              <form action={authorizeDomainAccess} className="grid gap-3 px-4 py-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr_auto]" key={item.id}>
                <div>
                  <input name="domain" type="hidden" value={item.domain} />
                  <p className="text-sm font-medium text-navy">@{item.domain}</p>
                  <p className="text-xs text-slate-500">
                    {roleLabel(item.app_role)} / {statusLabel(item.status)}
                  </p>
                </div>
                <AppRoleSelect defaultValue={item.app_role} />
                <StatusSelect defaultValue={item.status} />
                <button className="rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] px-4 py-2 text-sm font-medium text-navy transition hover:border-sea hover:bg-white" type="submit">
                  Guardar
                </button>
                <div className="xl:col-span-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Pais por defecto">
                    <CountrySelect
                      countries={options.countries}
                      defaultValue={item.default_country_id}
                    />
                  </Field>
                  <Field label="Sede por defecto">
                    <SiteSelect sites={options.sites} defaultValue={item.default_site_id} />
                  </Field>
                </div>
              </form>
            ))}
            {options.domainAllowlist.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-600">Sin dominios autorizados.</p>
            ) : null}
          </div>
        </div>
      </div>
      </AccordionPanel>
    </section>
  );
}

function Card({
  action,
  children,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <form
      action={action}
      className="rounded-2xl border border-[#cbd8e3] bg-white/95 p-5 shadow-[0_10px_28px_rgba(2,53,116,0.045)] transition hover:border-[#b7c9d9]"
    >
      <h2 className="text-base font-medium text-navy">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </form>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const options = await getAdminOptions();

  return (
    <main className="min-h-screen bg-[#eef4f8] px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[24px] border border-[#cbd8e3] bg-white shadow-[0_18px_48px_rgba(2,53,116,0.08)] lg:grid lg:grid-cols-[0.75fr_1.25fr]">
          <div className="relative overflow-hidden bg-navy p-7 text-white">
            <div aria-hidden="true" className="absolute inset-0 opacity-60">
              <div className="absolute -left-20 top-20 h-56 w-56 rounded-full border border-[#17a2b8]/25" />
              <div className="absolute bottom-[-90px] right-[-70px] h-72 w-72 rounded-full border border-[#8ed8e5]/20" />
              <div className="absolute bottom-24 left-10 size-2 rounded-full bg-clay shadow-[0_0_0_8px_rgba(255,193,7,0.12)]" />
            </div>
            <div className="relative">
              <Image
                alt="McParking"
                className="h-12 w-auto"
                height={64}
                priority
                src="/mcparking-logo.svg"
                width={245}
              />
              <p className="mt-12 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8ed8e5]">
                Panel interno
              </p>
              <h1 className="mt-3 text-3xl font-medium leading-tight">
                Administracion McParking
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[#c8d9e8]">
                Controla accesos, usuarios, permisos y carga base sin salir del
                gobierno operativo.
              </p>
            </div>
          </div>

          <div className="p-7">
            <div className="border-l-4 border-clay pl-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                Acceso administrativo
              </p>
              <h2 className="mt-3 text-2xl font-medium leading-tight text-navy">
                Usuarios, permisos y entidades base
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Esta pantalla centraliza la administracion del sistema. Los cambios
                de acceso impactan quien puede entrar y sobre que pais o sede puede
                trabajar.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#cbd8e3] bg-[#f8fbfd] px-3 py-1 text-xs font-medium text-slate-600">
                Solo administradores
              </span>
              <span className="rounded-full border border-[#cbd8e3] bg-[#f8fbfd] px-3 py-1 text-xs font-medium text-slate-600">
                Contexto operacional
              </span>
              <span className="rounded-full border border-[#bfe8cd] bg-[#eefaf2] px-3 py-1 text-xs font-medium text-[#22613b]">
                Supabase activo
              </span>
            </div>
            <Link
              className="mt-7 inline-flex h-10 items-center rounded-lg border border-[#ccd9e5] bg-white px-4 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
              href="/"
            >
              Volver al sistema
            </Link>
          </div>
        </section>

        {params.ok ? (
          <div className="mt-6 rounded-xl border border-[#bfe8cd] bg-[#eefaf2] px-4 py-3 text-sm font-medium text-[#22613b]">
            {params.ok}
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-6 rounded-xl border border-[#ffd4a3] bg-[#fff4e5] px-4 py-3 text-sm font-medium text-[#8a4a00]">
            {params.error}
          </div>
        ) : null}

        <AccessRbacPanel options={options} />
        <AccessPanel options={options} />

        <div className="mt-8 border-l-4 border-clay pl-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
            Carga base
          </p>
          <h2 className="mt-2 text-xl font-medium text-navy">Carga operativa avanzada</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Formularios minimos para crear piezas base. Usalo solo cuando una entidad
            todavia no tenga pantalla propia.
          </p>
        </div>

        <section className="mt-5 space-y-4">
          <AccordionPanel
            count="6 formularios"
            description="Crea las piezas base del modelo: areas, personas, procesos, etapas, roles y sistemas."
            title="Entidades principales"
          >
            <div className="grid gap-5 xl:grid-cols-2">
          <Card action={addArea} title="Agregar area">
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar area</Submit>
          </Card>

          <Card action={addPerson} title="Agregar persona">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field label="Telefono">
              <Input name="phone" />
            </Field>
            <Submit>Guardar persona</Submit>
          </Card>

          <Card action={addProcess} title="Agregar proceso">
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area">
              <Select name="area_id">
                <option value="">Sin area</option>
                {options.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Field label="Objetivo">
              <Textarea name="objective" />
            </Field>
            <Field label="Resultado esperado">
              <Textarea name="expected_result" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Criticidad">
                <Select name="criticality" defaultValue="medium">
                  {criticalityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Documentacion">
                <Select name="documentation_status" defaultValue="draft">
                  {documentationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_replicable" type="checkbox" /> Replicable
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_global" type="checkbox" /> Global
            </label>
            <Submit>Guardar proceso</Submit>
          </Card>

          <Card action={addSubprocess} title="Agregar subproceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Frecuencia">
              <Input name="frequency" />
            </Field>
            <Field label="Criticidad">
              <Select name="criticality" defaultValue="medium">
                {criticalityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar subproceso</Submit>
          </Card>

          <Card action={addRole} title="Agregar rol">
            <Field label="Area">
              <Select name="area_id">
                <option value="">Sin area</option>
                {options.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Nivel">
              <Select name="level" defaultValue="operational">
                {roleLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_corporate" type="checkbox" /> Corporativo
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_local" type="checkbox" /> Local
            </label>
            <Submit>Guardar rol</Submit>
          </Card>

          <Card action={addSystem} title="Agregar sistema">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Rol dueño">
              <Select name="owner_role_id">
                <option value="">Sin rol dueño</option>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Descripcion">
              <Textarea name="description" />
            </Field>
            <Submit>Guardar sistema</Submit>
          </Card>
            </div>
          </AccordionPanel>

          <AccordionPanel
            count="3 formularios"
            description="Conecta personas, roles, procesos, etapas y sistemas sin duplicar la estructura base."
            title="Relaciones del modelo"
          >
            <div className="grid gap-5 xl:grid-cols-2">
          <Card action={assignPersonRole} title="Asignar persona a rol">
            <Field label="Persona">
              <Select name="person_id" required>
                {options.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rol">
              <Select name="role_id" required>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Empresa">
              <Select name="company_id" required>
                {options.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sede">
              <Select name="site_id">
                <option value="">Sin sede</option>
                {options.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha inicio">
              <Input name="start_date" type="date" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_primary" type="checkbox" /> Principal
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_backup" type="checkbox" /> Respaldo
            </label>
            <Submit>Asignar persona</Submit>
          </Card>

          <Card action={assignProcessRole} title="Asociar rol a proceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subproceso">
              <Select name="subprocess_id">
                <option value="">Proceso completo</option>
                {options.subprocesses.map((subprocess) => (
                  <option key={subprocess.id} value={subprocess.id}>
                    {subprocess.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rol">
              <Select name="role_id" required>
                {options.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Responsabilidad">
                <Select name="responsibility_type" defaultValue="responsible">
                  {responsibilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Criticidad">
                <Select name="criticality" defaultValue="medium">
                  {criticalityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Impacto %">
              <Input max={100} min={0} name="impact_percent" type="number" />
            </Field>
            <Field label="Notas">
              <Textarea name="notes" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input defaultChecked name="is_required" type="checkbox" /> Requerido
            </label>
            <Submit>Asociar rol</Submit>
          </Card>

          <Card action={assignProcessSystem} title="Asociar sistema a proceso">
            <Field label="Proceso">
              <Select name="process_id" required>
                {options.processes.map((process) => (
                  <option key={process.id} value={process.id}>
                    {process.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subproceso">
              <Select name="subprocess_id">
                <option value="">Proceso completo</option>
                {options.subprocesses.map((subprocess) => (
                  <option key={subprocess.id} value={subprocess.id}>
                    {subprocess.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sistema">
              <Select name="system_id" required>
                {options.systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notas">
              <Textarea name="notes" />
            </Field>
            <Submit>Asociar sistema</Submit>
          </Card>
            </div>
          </AccordionPanel>
        </section>
      </div>
    </main>
  );
}
