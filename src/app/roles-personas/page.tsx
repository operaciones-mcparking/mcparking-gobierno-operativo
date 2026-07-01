import {
  assignSuggestedAccessRole,
  archivePerson,
  archiveRole,
  deleteRole,
  updatePersonBasic,
  updateRoleDictionaryEntry,
} from "@/app/admin/actions";
import { optionLabel, roleLevelOptions, ValueBadge } from "@/components/dashboard/badge";
import { ConfirmSubmitButton } from "@/components/dashboard/confirm-submit-button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { DashboardShell, StatusPill } from "@/components/dashboard/shell";
import {
  getAreaDirectory,
  getPersonBottlenecks,
  getPersonDirectory,
  getRoleAccessSuggestions,
  getRoleBottlenecks,
  getRoleDictionary,
} from "@/lib/dashboard/data";
import { getRolePersonUiCapabilities } from "@/lib/auth/ui-permissions";

type SearchParams = Promise<{
  country_id?: string;
  edit_role?: string;
  error?: string;
  ok?: string;
  site_id?: string;
}>;

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function AccordionPanel({
  children,
  count,
  defaultOpen = false,
  description,
  title,
}: {
  children: React.ReactNode;
  count?: string;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}) {
  return (
    <details
      className="group mt-4 border-b border-[#d6e1ea] bg-transparent pb-1"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-1 py-4 transition hover:bg-white/50">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-medium text-sea transition group-open:rotate-90 group-hover:bg-[#eef7fb]">
              &gt;
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-medium tracking-tight text-navy">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
              ) : null}
            </div>
          </div>
          {count ? (
            <span className="w-fit text-xs font-medium text-slate-500">
              {count}
            </span>
          ) : null}
        </div>
      </summary>
      <div className="pb-5 pt-2">{children}</div>
    </details>
  );
}

function SectionHeader({
  description,
  number,
  title,
}: {
  description?: string;
  number: string;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f6fb] text-xs font-medium text-sea">
        {number}
      </span>
      <div>
        <h4 className="text-sm font-medium text-navy">{title}</h4>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

function SaveButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#075077]"
      type="submit"
    >
      {children}
    </button>
  );
}

const archiveButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-[#ffd6b0] bg-[#fff7ef] px-4 py-2 text-sm font-medium text-[#86510d] transition hover:bg-[#ffe6ca]";

const dangerButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-[#f3b0a8] bg-[#fff1ef] px-4 py-2 text-sm font-medium text-[#9b2f24] transition hover:bg-[#ffe1dc]";

function roleType(isCorporate: boolean, isLocal: boolean) {
  if (isCorporate && isLocal) return "Mixto";
  if (isCorporate) return "Corporativo";
  if (isLocal) return "Local";
  return "Sin tipo";
}

function scopeLabel(scopeType: string) {
  if (scopeType === "global") return "Global";
  if (scopeType === "country") return "Pais";
  if (scopeType === "company") return "Empresa";
  if (scopeType === "site") return "Sede";
  return "Sin alcance";
}

function personSelectValue(
  rolePersonId: string | null,
  rolePersonName: string | null,
  people: Array<{ id: string; name: string }>,
) {
  if (rolePersonId && people.some((person) => person.id === rolePersonId)) {
    return rolePersonId;
  }

  if (rolePersonName) {
    return people.find((person) => person.name === rolePersonName)?.id ?? "";
  }

  return "";
}

function areaLabel(area: { company_name?: string | null; name: string }) {
  if (!area.company_name || area.company_name.toLowerCase() === "mcparking") {
    return area.name;
  }

  return `${area.name} / ${area.company_name}`;
}

function RoleLocationFields({
  currentRoleId,
  defaultParentRoleId,
  roles,
}: {
  currentRoleId?: string;
  defaultParentRoleId?: string | null;
  roles: Array<{ role_code: string | null; role_id: string; role_name: string }>;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
      <SectionHeader
        description="Define de quien depende. La posicion visual se acomoda automaticamente."
        number="3"
        title="Ubicacion en organigrama"
      />
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <Field label="Depende de">
          <select
            className={inputClass}
            name="org_parent_role_id"
            defaultValue={defaultParentRoleId ?? ""}
          >
            <option value="">Nivel superior</option>
            {roles
              .filter((role) => role.role_id !== currentRoleId)
              .map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                  {role.role_code ? ` (${role.role_code})` : ""}
                </option>
            ))}
          </select>
        </Field>
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-navy px-4 text-sm font-medium text-white transition hover:bg-[#075077]"
          type="submit"
        >
          Guardar ubicacion
        </button>
      </div>
    </div>
  );
}

export default async function RolesPersonasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const messages = await searchParams;
  const editRoleId = messages.edit_role ?? "";
  const context = {
    countryId: messages.country_id ?? null,
    siteId: messages.site_id ?? null,
  };
  const contextParams = new URLSearchParams();
  if (context.countryId) contextParams.set("country_id", context.countryId);
  if (context.siteId) contextParams.set("site_id", context.siteId);
  if (editRoleId) contextParams.set("edit_role", editRoleId);
  const returnTo = `/roles-personas${contextParams.size ? `?${contextParams.toString()}` : ""}`;
  const [
    capabilities,
    dictionaryResult,
    directoryResult,
    rolesResult,
    peopleResult,
    areasResult,
    suggestionsResult,
  ] = await Promise.all([
    getRolePersonUiCapabilities(),
    getRoleDictionary(context),
    getPersonDirectory(context),
    getRoleBottlenecks(),
    getPersonBottlenecks(),
    getAreaDirectory(context),
    getRoleAccessSuggestions(context),
  ]);

  const assignedPeople = dictionaryResult.data
    .filter((role) => role.current_person_id && role.current_person_name)
    .map((role) => ({
      email: null,
      id: role.current_person_id as string,
      name: role.current_person_name as string,
      phone: null,
      status: "active",
      country_id: role.country_id,
      site_id: role.site_id,
    }));
  const people = Array.from(
    new Map(
      [...directoryResult.data, ...assignedPeople].map((person) => [person.id, person]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const areas = Array.from(
    new Map(
      [
        ...areasResult.data,
        ...dictionaryResult.data
          .filter((role) => role.area_id && role.area_name)
          .map((role) => ({
            company_id: role.company_id,
            company_name: role.company_name,
            country_id: role.country_id,
            id: role.area_id as string,
            name: role.area_name as string,
          })),
      ].map((area) => [area.id, area]),
    ).values(),
  ).sort((a, b) => {
    const companyCompare = (a.company_name ?? "").localeCompare(b.company_name ?? "");
    return companyCompare || a.name.localeCompare(b.name);
  });
  const suggestionsByRoleId = new Map<string, typeof suggestionsResult.data>();
  for (const suggestion of suggestionsResult.data) {
    const roleSuggestions = suggestionsByRoleId.get(suggestion.role_id) ?? [];
    roleSuggestions.push(suggestion);
    suggestionsByRoleId.set(suggestion.role_id, roleSuggestions);
  }

  return (
    <DashboardShell
      description="Diccionario editable de cargos, personas asignadas y carga acumulada de responsabilidades."
      eyebrow="5 Roles y personas"
      title="Roles y personas"
    >
      {messages.ok ? (
        <div className="rounded-lg border border-[#c8e6d0] bg-[#e4f4ea] p-4 text-sm font-medium text-[#24613d]">
          {messages.ok}
        </div>
      ) : null}
      {messages.error ? (
        <div className="rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
          {messages.error}
        </div>
      ) : null}

      <AccordionPanel
        count={`${dictionaryResult.data.length} roles`}
        defaultOpen
        description="Listado principal. Abre un rol solo cuando necesites editarlo."
        title="Diccionario editable de roles"
      >
        {dictionaryResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
            {dictionaryResult.error.message}
          </div>
        ) : (
          <>
            {areasResult.error ? (
              <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
                {areasResult.error.message}
              </div>
            ) : null}
            {suggestionsResult.error ? (
              <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
                {suggestionsResult.error.message}
              </div>
            ) : null}
            <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <p className="text-sm font-medium text-navy">Roles activos del modelo operativo</p>
                <p className="text-sm text-slate-600">
                  Edita cargos existentes. Los cargos nuevos se crean desde el organigrama.
                </p>
              </div>
            </div>
            <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
              <div className="hidden grid-cols-[1.7fr_170px_150px_120px_80px] border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 lg:grid">
                <span>Rol</span>
                <span>Persona actual</span>
                <span>Nivel</span>
                <span>Alcance</span>
                <span className="text-right">Accion</span>
              </div>
              {dictionaryResult.data.map((role) => {
                const roleSuggestions = suggestionsByRoleId.get(role.role_id) ?? [];
                const roleCountryId = role.country_id ?? context.countryId ?? "";
                const roleCompanyId = role.company_id ?? "";
                const roleSiteId = role.site_id ?? context.siteId ?? "";

                return (
                  <details
                    className="group scroll-mt-24 border-b border-line last:border-b-0"
                    id={`role-${role.role_id}`}
                    key={role.role_id}
                    open={role.role_id === editRoleId}
                  >
                <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#fbfdfe] group-open:border-b group-open:border-line group-open:bg-[#fbfdfe]">
                  <div className="grid gap-3 lg:grid-cols-[1.7fr_170px_150px_120px_80px] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-medium text-navy">{role.role_name}</h3>
                        <ValueBadge tone="info">{role.role_code ?? "Sin codigo"}</ValueBadge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {role.area_name ?? "Sin area"} / {role.company_name ?? "Sin empresa"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Persona actual</p>
                      <p className="text-sm font-medium text-navy">
                        {role.current_person_name ?? "Sin persona"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Nivel</p>
                      <p className="text-sm font-medium text-navy">
                        {optionLabel(roleLevelOptions, role.role_level)}
                      </p>
                    </div>
                    <div className="text-sm text-slate-600">
                      <span>{roleType(role.is_corporate, role.is_local)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600 lg:justify-end">
                      {capabilities.canEditRoles ? (
                        <span className="rounded-full bg-[#eef7fb] px-3 py-1 text-xs font-medium text-sea">
                          Editar
                        </span>
                      ) : null}
                    </div>
                  </div>
                </summary>

                {capabilities.canEditRoles ? (
                  <form
                    action={updateRoleDictionaryEntry}
                    className="grid gap-4 bg-[#f8fafb] p-4"
                  >
                  <input name="role_id" type="hidden" value={role.role_id} />
                  <input name="company_id" type="hidden" value={role.company_id ?? ""} />
                  <input name="return_to" type="hidden" value={returnTo} />

                  <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
                    <SectionHeader
                      description="Nombre, area y nivel del cargo. El codigo interno lo propone el sistema."
                      number="1"
                      title="Identidad del rol"
                    />
                    <div className="grid gap-3">
                      <Field label="Nombre del rol">
                        <input
                          className={inputClass}
                          name="name"
                          required
                          defaultValue={role.role_name}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                      <Field label="Area">
                        <select
                          className={inputClass}
                          name="area_id"
                          required
                          defaultValue={role.area_id ?? ""}
                        >
                          <option value="">Selecciona area</option>
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {areaLabel(area)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Nivel">
                        <select className={inputClass} name="level" defaultValue={role.role_level}>
                          {roleLevelOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Codigo actual: {role.role_code ?? "se generara al guardar"}. No necesitas
                      mantenerlo manualmente.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
                    <SectionHeader
                      description="Que hace este rol y quien lo ocupa actualmente."
                      number="2"
                      title="Proposito y asignacion"
                    />
                    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                      <div>
                        <Field label="Objetivo / descripcion">
                          <textarea
                            className={`${inputClass} min-h-24`}
                            name="description"
                            defaultValue={role.role_description ?? ""}
                          />
                        </Field>
                      </div>
                      <div className="rounded-xl border border-line bg-[#f8fafb] p-4">
                        <Field label="Persona actual">
                          <select
                            className={inputClass}
                            name="person_id"
                            defaultValue={personSelectValue(
                              role.current_person_id,
                              role.current_person_name,
                              people,
                            )}
                          >
                            <option value="">Sin persona asignada</option>
                            {people.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          La persona solo representa quien ocupa hoy el rol. La estructura sigue
                          siendo el rol.
                        </p>
                      </div>
                    </div>
                  </div>

                  <RoleLocationFields
                    currentRoleId={role.role_id}
                    defaultParentRoleId={role.org_parent_role_id}
                    roles={dictionaryResult.data}
                  />

                  <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
                    <SectionHeader
                      description="Una responsabilidad por linea y alcance del rol."
                      number="4"
                      title="Responsabilidades y alcance"
                    />
                    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                      <Field label="Responsabilidades principales">
                        <textarea
                          className={`${inputClass} min-h-28`}
                          name="responsibilities"
                          defaultValue={(role.responsibilities ?? []).join("\n")}
                          placeholder="Una responsabilidad por linea"
                        />
                      </Field>
                      <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-[#f8fafb] p-4">
                        <div className="grid gap-3 text-sm text-slate-700">
                          <label className="inline-flex items-start gap-2">
                            <input
                              className="mt-0.5 h-4 w-4 rounded border-line text-sea"
                              defaultChecked={role.is_corporate}
                              name="is_corporate"
                              type="checkbox"
                            />
                            <span>
                              Corporativo
                              <span className="block text-xs text-slate-500">
                                Sirve a toda la empresa
                              </span>
                            </span>
                          </label>
                          <label className="inline-flex items-start gap-2">
                            <input
                              className="mt-0.5 h-4 w-4 rounded border-line text-sea"
                              defaultChecked={role.is_local}
                              name="is_local"
                              type="checkbox"
                            />
                            <span>
                              Local
                              <span className="block text-xs text-slate-500">
                                Propio de una sede u operacion
                              </span>
                            </span>
                          </label>
                        </div>
                        <div className="flex justify-end">
                          <SaveButton>Guardar rol</SaveButton>
                        </div>
                      </div>
                    </div>
                  </div>
                  </form>
                ) : null}

                {capabilities.canEditRoles && roleSuggestions.length > 0 ? (
                  <div className="border-t border-line bg-white px-4 py-4">
                    <div className="rounded-xl border border-[#d6e1ea] bg-[#f8fafb] p-4">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-sea">
                            Acceso sugerido
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Primero guarda la persona actual del rol. Luego confirma el acceso de
                            plataforma que corresponda.
                          </p>
                        </div>
                        {!role.current_person_id ? (
                          <span className="rounded-full bg-[#fff3cf] px-3 py-1 text-xs font-medium text-[#7a5400]">
                            Falta persona
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-2">
                        {roleSuggestions.map((suggestion) => {
                          const hasScope =
                            suggestion.scope_type === "global" ||
                            (suggestion.scope_type === "country" && roleCountryId) ||
                            (suggestion.scope_type === "company" && roleCompanyId) ||
                            (suggestion.scope_type === "site" && roleSiteId);
                          const disabled = !role.current_person_id || !hasScope;

                          return (
                            <form
                              action={assignSuggestedAccessRole}
                              className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                              key={suggestion.id}
                            >
                              <input name="return_to" type="hidden" value={returnTo} />
                              <input
                                name="person_id"
                                type="hidden"
                                value={role.current_person_id ?? ""}
                              />
                              <input
                                name="access_role_id"
                                type="hidden"
                                value={suggestion.access_role_id}
                              />
                              <input
                                name="scope_type"
                                type="hidden"
                                value={suggestion.scope_type}
                              />
                              <input name="country_id" type="hidden" value={roleCountryId} />
                              <input name="company_id" type="hidden" value={roleCompanyId} />
                              <input name="site_id" type="hidden" value={roleSiteId} />
                              <div>
                                <p className="text-sm font-medium text-navy">
                                  {suggestion.access_role_name}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Alcance: {scopeLabel(suggestion.scope_type)}
                                  {suggestion.notes ? ` · ${suggestion.notes}` : ""}
                                </p>
                              </div>
                              <button
                                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a] disabled:cursor-not-allowed disabled:bg-slate-300"
                                disabled={disabled}
                                type="submit"
                              >
                                Crear acceso
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {capabilities.canArchiveRoles ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fffdfb] px-4 py-3">
                    <p className="text-xs text-slate-500">
                      Archivar conserva historial. Eliminar borra el rol durante desarrollo.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <form action={archiveRole}>
                        <input name="role_id" type="hidden" value={role.role_id} />
                        <input name="return_to" type="hidden" value={returnTo} />
                        <ConfirmSubmitButton
                          className={archiveButtonClass}
                          message={`Vas a archivar el rol "${role.role_name}". Se ocultara del diccionario activo, pero conservara historial. Deseas continuar?`}
                          title="Archivar rol"
                        >
                          Archivar rol
                        </ConfirmSubmitButton>
                      </form>
                      <form action={deleteRole}>
                        <input name="role_id" type="hidden" value={role.role_id} />
                        <input name="return_to" type="hidden" value={returnTo} />
                        <ConfirmSubmitButton
                          className={dangerButtonClass}
                          message={`Vas a eliminar definitivamente el rol "${role.role_name}". Esta accion puede borrar relaciones asociadas y no se puede deshacer desde la web. Deseas continuar?`}
                          title="Eliminar rol"
                        >
                          Eliminar rol
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                ) : null}
              </details>
                );
              })}
            </div>
          </>
        )}
      </AccordionPanel>

      <AccordionPanel
        count={`${people.length} personas`}
        description="Datos basicos de personas. Cada persona se edita desde su propia fila."
        title="Personas"
      >
        {directoryResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm text-[#86510d]">
            {directoryResult.error.message}
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
            <div className="hidden grid-cols-[1.4fr_220px_180px] border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 md:grid">
              <span>Persona</span>
              <span>Telefono</span>
              <span>Accion</span>
            </div>
            {people.map((person) => (
              <details className="group border-b border-line last:border-b-0" key={person.id}>
                <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#f8fafb] group-open:bg-[#fbfdfe]">
                  <div className="grid gap-3 md:grid-cols-[1fr_220px_180px] md:items-center">
                    <div>
                      <h3 className="text-base font-medium text-navy">{person.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {person.email ?? "Sin email"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Telefono</p>
                      <p className="text-sm font-medium text-navy">
                        {person.phone ?? "Sin telefono"}
                      </p>
                    </div>
                    <div className="text-sm text-slate-500">
                      {capabilities.canEditPeople ? "Editar datos" : null}
                    </div>
                  </div>
                </summary>

                {capabilities.canEditPeople ? (
                  <form action={updatePersonBasic} className="grid gap-3 border-t border-line bg-[#f8fafb] p-4">
                    <input name="person_id" type="hidden" value={person.id} />
                    <input name="return_to" type="hidden" value={returnTo} />
                    <div className="rounded-xl border border-line bg-white p-4">
                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                      <Field label="Nombre">
                        <input className={inputClass} name="name" required defaultValue={person.name} />
                      </Field>
                      <Field label="Email">
                        <input className={inputClass} name="email" defaultValue={person.email ?? ""} />
                      </Field>
                      <Field label="Telefono">
                        <input className={inputClass} name="phone" defaultValue={person.phone ?? ""} />
                      </Field>
                      <SaveButton>Guardar persona</SaveButton>
                      </div>
                    </div>
                  </form>
                ) : null}
                {capabilities.canArchivePeople ? (
                  <form
                    action={archivePerson}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-4 py-3"
                  >
                    <input name="person_id" type="hidden" value={person.id} />
                    <input name="return_to" type="hidden" value={returnTo} />
                    <p className="text-xs text-slate-500">
                      Archivar desasigna sus roles activos y la oculta de las listas.
                    </p>
                    <ConfirmSubmitButton
                      className={archiveButtonClass}
                      message={`Vas a archivar a "${person.name}". Se desasignaran sus roles activos y se ocultara de las listas. Deseas continuar?`}
                      title="Archivar persona"
                    >
                      Archivar persona
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </details>
            ))}
          </div>
        )}
      </AccordionPanel>

      <AccordionPanel
        count={`${rolesResult.data.length} roles`}
        description="Resumen de carga y responsabilidades acumuladas por cargo."
        title="Carga por rol"
      >
        {rolesResult.error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {rolesResult.error.message}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable minWidth="900px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Rol</DataTableHeaderCell>
                  <DataTableHeaderCell>Nivel</DataTableHeaderCell>
                  <DataTableHeaderCell>Tipo</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Procesos</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Criticos</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Dueno</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Aprobador</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Sistemas</DataTableHeaderCell>
                  <DataTableHeaderCell align="center">Sin respaldo</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {rolesResult.data.map((role) => (
                  <DataTableRow key={role.role_id}>
                    <DataTableCell strong>{role.role_name}</DataTableCell>
                    <DataTableCell>
                      {optionLabel(roleLevelOptions, role.role_level)}
                    </DataTableCell>
                    <DataTableCell>
                      {role.is_corporate ? "Corporativo" : role.is_local ? "Local" : "Mixto"}
                    </DataTableCell>
                    <DataTableCell align="right">{role.process_count}</DataTableCell>
                    <DataTableCell align="right">{role.critical_process_count}</DataTableCell>
                    <DataTableCell align="right">{role.owner_responsibility_count}</DataTableCell>
                    <DataTableCell align="right">{role.approver_responsibility_count}</DataTableCell>
                    <DataTableCell align="right">{role.system_count}</DataTableCell>
                    <DataTableCell align="center">
                      <StatusPill active={role.missing_backup_person} />
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </AccordionPanel>

      <AccordionPanel
        count={`${peopleResult.data.length} personas`}
        description="Lectura de roles, procesos y respaldos acumulados por persona."
        title="Carga por persona"
      >
        {peopleResult.error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {peopleResult.error.message}
          </div>
        ) : (
          <div className="mt-5">
            <DataTable minWidth="760px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Persona</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Roles</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Procesos</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Criticos</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Sistemas</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Respaldos cubiertos</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {peopleResult.data.map((person) => (
                  <DataTableRow key={person.person_id}>
                    <DataTableCell strong>{person.person_name}</DataTableCell>
                    <DataTableCell align="right">{person.role_count}</DataTableCell>
                    <DataTableCell align="right">{person.process_count}</DataTableCell>
                    <DataTableCell align="right">{person.critical_process_count}</DataTableCell>
                    <DataTableCell align="right">{person.system_count}</DataTableCell>
                    <DataTableCell align="right">{person.backup_assignment_count}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </AccordionPanel>
    </DashboardShell>
  );
}
