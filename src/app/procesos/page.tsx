import { TypedBadge, ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { ProcessFilters } from "@/components/dashboard/process-filters";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  getAreaDirectory,
  getProcessCatalogV2,
  getProcessMatrixV2,
  getProcessStageOwnerRoles,
  getRoleDictionary,
  type ProcessCatalogV2Item,
} from "@/lib/dashboard/data";
import { CreateProcessModal } from "./create-process-modal";
import { ProcessDetailModal } from "./process-detail-modal";
import { ProcessEditModal } from "./process-edit-modal";
import { ProcessMacroMap } from "./process-macro-map";

function ownerRoleText(roleName: string | null, personName: string | null) {
  if (!roleName || roleName === "No definido") {
    return "Dueño: No definido";
  }

  return `Dueño: ${roleName} · ${personName ?? "Sin persona asignada"}`;
}

function groupedByProcess<T extends { process_id: string; process_name: string }>(items: T[]) {
  return items.reduce<Array<{ processId: string; processName: string; rows: T[] }>>(
    (groups, item) => {
      const group = groups.find((current) => current.processId === item.process_id);

      if (group) {
        group.rows.push(item);
      } else {
        groups.push({
          processId: item.process_id,
          processName: item.process_name,
          rows: [item],
        });
      }

      return groups;
    },
    [],
  );
}

type CreateProcessOption = {
  id: string;
  name: string;
};

type CreateProcessAreaOption = CreateProcessOption & {
  company_id: string | null;
  company_name: string | null;
};

type IdNameOption = {
  id: string;
  name: string;
};

function uniqueCreateProcessOptions(options: CreateProcessOption[]) {
  const seen = new Set<string>();

  return options
    .filter((option) => {
      if (!option.id || seen.has(option.id)) {
        return false;
      }

      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function uniqueCreateProcessAreas(options: CreateProcessAreaOption[]) {
  const seen = new Set<string>();

  return options
    .filter((option) => {
      if (!option.id || seen.has(option.id)) {
        return false;
      }

      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function uniqueIdNameOptions(pairs: Array<{ id: string; name: string }>) {
  const byId = new Map<string, string>();

  for (const pair of pairs) {
    if (pair.id && pair.name && !byId.has(pair.id)) {
      byId.set(pair.id, pair.name);
    }
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function compactList(values: string[], fallback: string) {
  const uniqueValues = [...new Set(values.filter(Boolean))];

  if (uniqueValues.length === 0) {
    return fallback;
  }

  if (uniqueValues.length === 1) {
    return uniqueValues[0];
  }

  return `${uniqueValues[0]} +${uniqueValues.length - 1}`;
}

function SupportRoleSummary({ values }: { values: string[] }) {
  const uniqueValues = [...new Set(values.filter(Boolean))];

  if (uniqueValues.length === 0) {
    return <span className="text-sm text-slate-500">Sin roles de apoyo</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <ValueBadge tone="neutral">{uniqueValues[0]}</ValueBadge>
      {uniqueValues.length > 1 ? <ValueBadge tone="info">+{uniqueValues.length - 1}</ValueBadge> : null}
    </div>
  );
}

function processTypeMeta(value: ProcessCatalogV2Item["process_type"]): { label: string; tone: BadgeTone } {
  if (value === "strategic") {
    return { label: "Estrategico", tone: "info" };
  }

  if (value === "support") {
    return { label: "Soporte", tone: "warning" };
  }

  return { label: "Operativo", tone: "success" };
}

function matchesText(value: string | null | undefined, query: string) {
  return !query || (value ?? "").toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
}

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
  { label: "Operativo", value: "operational" },
  { label: "Soporte", value: "support" },
];
const processListGridColumns = "xl:grid-cols-[88px_minmax(260px,1fr)_144px_132px_86px_160px_154px]";

type ProcesosPageProps = {
  searchParams?: Promise<{
    country_id?: string;
    empresa?: string;
    owner_role?: string;
    person?: string;
    process?: string;
    process_type?: string;
    search?: string;
    site_id?: string;
    stage?: string;
    support_role?: string;
    tipo?: string;
  }>;
};

export default async function ProcesosPage({ searchParams }: ProcesosPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedCompany = params.empresa ?? "todas";
  const selectedType = params.tipo ?? "todos";
  const selectedProcessType = params.process_type ?? "todos";
  const selectedOwnerRole = params.owner_role ?? "todos";
  const selectedPerson = params.person ?? "todos";
  const selectedSupportRole = params.support_role ?? "todos";
  const searchQuery = params.search?.trim() ?? "";
  const processQuery = params.process?.trim() ?? "";
  const stageQuery = params.stage?.trim() ?? "";
  const generalQuery = searchQuery || processQuery || stageQuery;
  const context = {
    countryId: params.country_id ?? null,
    siteId: params.site_id ?? null,
  };
  const [catalogResult, matrixResult, areaDirectoryResult, roleDictionaryResult, stageOwnerRolesResult] = await Promise.all([
    getProcessCatalogV2(context),
    getProcessMatrixV2(),
    getAreaDirectory(context),
    getRoleDictionary(context),
    getProcessStageOwnerRoles(),
  ]);
  const activeProcesses = catalogResult.data;
  const createProcessSource = activeProcesses.length > 0 ? activeProcesses : catalogResult.data;
  const createProcessCompanies = uniqueCreateProcessOptions([
    ...createProcessSource.flatMap((process) => {
      const options: CreateProcessOption[] = [];

      if (process.owner_company_id && process.owner_company_name) {
        options.push({ id: process.owner_company_id, name: process.owner_company_name });
      } else if (process.owner_company_id && process.company_name) {
        options.push({ id: process.owner_company_id, name: process.company_name });
      }

      if (process.operating_company_id && process.operating_company_name) {
        options.push({ id: process.operating_company_id, name: process.operating_company_name });
      }

      return options;
    }),
    ...(areaDirectoryResult.data ?? [])
      .filter((area) => area.company_id && area.company_name)
      .map((area) => ({
        id: area.company_id as string,
        name: area.company_name as string,
      })),
  ]);
  const createProcessAreas = uniqueCreateProcessAreas([
    ...(areaDirectoryResult.data ?? []).map((area) => ({
      company_id: area.company_id,
      company_name: area.company_name,
      id: area.id,
      name: area.name,
    })),
    ...roleDictionaryResult.data
      .filter((role) => role.area_id && role.area_name)
      .map((role) => ({
        company_id: role.company_id,
        company_name: role.company_name,
        id: role.area_id as string,
        name: role.area_name as string,
      })),
  ]);

  const companyOptions = Array.from(
    new Set(
      activeProcesses
        .map((process) => process.owner_company_name ?? process.company_name)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const typeOptions = Array.from(
    new Set(activeProcesses.map((process) => process.area_name ?? "Sin tipo")),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const ownerRoleOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.owner_role_ids.map((id, index) => ({
        id,
        name: process.owner_role_names[index] ?? id,
      })),
    ),
  );
  const personOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.current_person_ids.map((id, index) => ({
        id,
        name: process.current_person_names[index] ?? id,
      })),
    ),
  );
  const supportRoleOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.support_role_ids.map((id, index) => ({
        id,
        name: process.support_role_names[index] ?? id,
      })),
    ),
  );
  const stagesByProcess = groupedByProcess(matrixResult.data);
  const filteredProcesses = activeProcesses.filter((process) => {
    const ownerCompany = process.owner_company_name ?? process.company_name;
    const operationType = process.area_name ?? "Sin tipo";
    const stages = stagesByProcess.find((item) => item.processId === process.process_id)?.rows ?? [];

    return (
      (selectedCompany === "todas" || ownerCompany === selectedCompany) &&
      (selectedType === "todos" || operationType === selectedType) &&
      (selectedProcessType === "todos" || process.process_type === selectedProcessType) &&
      (selectedOwnerRole === "todos" || process.owner_role_ids.includes(selectedOwnerRole)) &&
      (selectedPerson === "todos" || process.current_person_ids.includes(selectedPerson)) &&
      (selectedSupportRole === "todos" || process.support_role_ids.includes(selectedSupportRole)) &&
      (!generalQuery ||
        matchesText(process.process_name, generalQuery) ||
        stages.some((stage) => matchesText(stage.subprocess_name, generalQuery)))
    );
  });
  const macroMapProcesses = activeProcesses.filter((process) => {
    const ownerCompany = process.owner_company_name ?? process.company_name;

    return ownerCompany === "McParking";
  });
  const filteredProcessIds = new Set(filteredProcesses.map((process) => process.process_id));
  const groupedRows = groupedByProcess(
    matrixResult.data.filter((row) => filteredProcessIds.has(row.process_id)),
  );
  const ownerRoleBySubprocess = Object.fromEntries(
    stageOwnerRolesResult.data.map((ownerRole) => [ownerRole.subprocess_id, ownerRole.role_id]),
  );
  const resultText = `${filteredProcesses.length} ${filteredProcesses.length === 1 ? "proceso encontrado" : "procesos encontrados"}`;

  return (
    <DashboardShell
      description="Catalogo de procesos oficiales con responsables, etapas activas y roles de apoyo."
      eyebrow={`${activeProcesses.length} Procesos`}
      title="Procesos oficiales"
    >
      <div className="mb-4 mt-5 flex justify-end">
        <CreateProcessModal
          areas={createProcessAreas}
          companies={createProcessCompanies}
          optionsError={areaDirectoryResult.error?.message ?? roleDictionaryResult.error?.message ?? null}
        />
      </div>

      {!catalogResult.error ? <ProcessMacroMap processes={macroMapProcesses} /> : null}

      <section className="mt-4 border-b border-[#d6e1ea] bg-transparent pb-6">
        <div className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium tracking-tight text-navy">Diccionario de procesos</h2>
              <ValueBadge tone="info">{activeProcesses.length} procesos</ValueBadge>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              19 procesos organizados por tipo, responsables y etapas.
            </p>
          </div>
        </div>
        {catalogResult.error || matrixResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
            {catalogResult.error?.message ?? matrixResult.error?.message}
          </div>
        ) : (
          <>
            <ProcessFilters
              companyOptions={companyOptions}
              ownerRoleOptions={ownerRoleOptions}
              personOptions={personOptions}
              processTypeOptions={processTypeOptions}
              searchQuery={generalQuery}
              selectedCompany={selectedCompany}
              selectedOwnerRole={selectedOwnerRole}
              selectedPerson={selectedPerson}
              selectedProcessType={selectedProcessType}
              selectedSupportRole={selectedSupportRole}
              selectedType={selectedType}
              supportRoleOptions={supportRoleOptions}
              resultText={resultText}
              totalCount={activeProcesses.length}
              typeOptions={typeOptions}
              visibleCount={filteredProcesses.length}
            />

            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
              <div className={`hidden gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 xl:grid ${processListGridColumns}`}>
                <span>Tipo</span>
                <span>Proceso</span>
                <span>Rol dueño</span>
                <span>Persona actual</span>
                <span className="text-center">Etapas</span>
                <span>Roles de apoyo</span>
                <span className="text-right">Acción</span>
              </div>

              {filteredProcesses.map((process) => {
                const typeMeta = processTypeMeta(process.process_type);
                const group = groupedRows.find((item) => item.processId === process.process_id);
                const rows = group?.rows ?? [];
                const ownerText = compactList(process.owner_role_names, "Sin rol dueño");
                const personText = compactList(process.current_person_names, "Sin persona asignada");

                return (
                  <details
                    className="group/process border-b border-line last:border-b-0"
                    key={process.process_id}
                  >
                    <summary
                      aria-label={`Expandir o contraer ${process.process_name}`}
                      className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#fbfdfe] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 group-open/process:border-b group-open/process:border-line group-open/process:bg-[#fbfdfe]"
                    >
                      <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 xl:items-center ${processListGridColumns}`}>
                        <div className="col-start-1 xl:col-auto">
                          <ValueBadge tone={typeMeta.tone}>{typeMeta.label}</ValueBadge>
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-base font-medium text-navy">
                            {process.process_name}
                          </h3>
                        </div>

                        <div className="col-start-1 xl:col-auto">
                          <p className="text-xs text-slate-500 xl:hidden">Rol dueño</p>
                          <p className="text-sm font-medium text-navy">{ownerText}</p>
                        </div>

                        <div className="col-start-1 xl:col-auto">
                          <p className="text-xs text-slate-500 xl:hidden">Persona actual</p>
                          <p className={`text-sm font-medium ${process.current_person_names.length === 0 ? "text-[#86510d]" : "text-navy"}`}>
                            {personText}
                          </p>
                        </div>

                        <div className="col-start-1 flex flex-wrap gap-2 xl:col-auto xl:justify-center">
                          <ValueBadge tone="info">Etapas {process.active_stage_count}</ValueBadge>
                        </div>

                        <div className="col-start-1 xl:col-auto">
                          <p className="text-xs text-slate-500 xl:hidden">Roles de apoyo</p>
                          <SupportRoleSummary values={process.support_role_names} />
                        </div>

                        <div className="hidden items-center justify-end gap-2 xl:col-auto xl:flex">
                          <ProcessDetailModal
                            ownerRoleBySubprocess={ownerRoleBySubprocess}
                            process={process}
                            roleDictionary={roleDictionaryResult.data}
                            stages={rows}
                          />
                          <ProcessEditModal
                            ariaLabel={`Editar proceso ${process.process_name}`}
                            ownerRoleBySubprocess={ownerRoleBySubprocess}
                            process={process}
                            roleDictionary={roleDictionaryResult.data}
                            stages={rows}
                            triggerClassName="hidden h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 xl:inline-flex"
                            triggerLabel=""
                          />

                        </div>
                      </div>
                    </summary>

                    <div className="bg-[#f8fafb] px-4 py-4">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row xl:hidden">
                        <ProcessDetailModal
                          ownerRoleBySubprocess={ownerRoleBySubprocess}
                          process={process}
                          roleDictionary={roleDictionaryResult.data}
                          stages={rows}
                        />
                        <ProcessEditModal
                          ariaLabel={`Editar proceso ${process.process_name}`}
                          ownerRoleBySubprocess={ownerRoleBySubprocess}
                          process={process}
                          roleDictionary={roleDictionaryResult.data}
                          stages={rows}
                          triggerClassName="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
                          triggerLabel=""
                        />
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-sm text-slate-600">Este proceso aún no tiene etapas activas.</p>
                      ) : (
                        <div>
                          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <p className="text-sm font-medium text-navy">Vista rápida de etapas activas</p>
                              <p className="text-sm text-slate-600">
                                Orden operativo, rol dueño e impacto dentro del proceso.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              {process.support_role_names.map((roleName) => (
                                <ValueBadge key={roleName} tone="neutral">{roleName}</ValueBadge>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-line bg-white">
                            {rows.map((row, rowIndex) => (
                              <div
                                className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[42px_minmax(220px,1.4fr)_minmax(220px,1fr)_120px] md:items-center"
                                key={row.subprocess_id}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef7fb] text-sm font-medium text-sea">
                                  {row.sort_order ?? rowIndex + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-navy">
                                    {row.subprocess_name}
                                  </p>
                                </div>
                                <div className="min-w-0 text-sm">
                                  <p className="text-xs text-slate-500">Responsable funcional</p>
                                  <p className="mt-1 font-medium text-navy">
                                    {ownerRoleText(row.owner_role_name, row.owner_person_name)}
                                  </p>
                                </div>
                                <div className="text-sm">
                                  <p className="text-xs text-slate-500">Impacto</p>
                                  <p className="mt-1 font-medium text-navy">
                                    {row.impact_percent === null ? "-" : `${row.impact_percent}%`}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="px-4 py-8 text-sm text-slate-600">
                  No hay procesos para los filtros seleccionados.
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
