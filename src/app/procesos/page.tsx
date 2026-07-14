import { ChevronRight } from "lucide-react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import { ProcessFilters } from "@/components/dashboard/process-filters";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  getAreaDirectory,
  getProcessCatalog,
  getProcessMatrix,
  getProcessStageOwnerRoles,
  getRoleDictionary,
} from "@/lib/dashboard/data";
import { CreateProcessModal } from "./create-process-modal";
import { ProcessDetailModal } from "./process-detail-modal";
import { ProcessMacroMap } from "./process-macro-map";

function TextValue({ value }: { value: string | null | undefined }) {
  return <span>{value && value.length > 0 ? value : "No definido"}</span>;
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
            <span className="w-fit text-xs font-medium text-slate-500">{count}</span>
          ) : null}
        </div>
      </summary>
      <div className="pb-5 pt-2">{children}</div>
    </details>
  );
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

type ProcesosPageProps = {
  searchParams?: Promise<{
    country_id?: string;
    empresa?: string;
    site_id?: string;
    tipo?: string;
  }>;
};

export default async function ProcesosPage({ searchParams }: ProcesosPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedCompany = params.empresa ?? "todas";
  const selectedType = params.tipo ?? "todos";
  const context = {
    countryId: params.country_id ?? null,
    siteId: params.site_id ?? null,
  };
  const [catalogResult, matrixResult, areaDirectoryResult, roleDictionaryResult, stageOwnerRolesResult] = await Promise.all([
    getProcessCatalog(context),
    getProcessMatrix(),
    getAreaDirectory(context),
    getRoleDictionary(context),
    getProcessStageOwnerRoles(),
  ]);
  const activeProcesses = catalogResult.data.filter((process) => process.status === "active");
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
  const filteredProcesses = activeProcesses.filter((process) => {
    const ownerCompany = process.owner_company_name ?? process.company_name;
    const operationType = process.area_name ?? "Sin tipo";

    return (
      (selectedCompany === "todas" || ownerCompany === selectedCompany) &&
      (selectedType === "todos" || operationType === selectedType)
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
  const processCount =
    filteredProcesses.length === activeProcesses.length
      ? `${activeProcesses.length} procesos`
      : `${filteredProcesses.length} de ${activeProcesses.length} procesos`;

  return (
    <DashboardShell
      description="Catalogo de procesos oficiales con vista rapida desplegable por proceso."
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

      <AccordionPanel
        count={processCount}
        defaultOpen
        description="Listado principal. Abre un proceso solo cuando necesites revisar sus etapas."
        title="Diccionario de procesos oficiales"
      >
        {catalogResult.error || matrixResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
            {catalogResult.error?.message ?? matrixResult.error?.message}
          </div>
        ) : (
          <>
            <ProcessFilters
              companyOptions={companyOptions}
              selectedCompany={selectedCompany}
              selectedType={selectedType}
              totalCount={activeProcesses.length}
              typeOptions={typeOptions}
              visibleCount={filteredProcesses.length}
            />

            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
              <div className="hidden grid-cols-[1.7fr_160px_160px_100px_100px_100px] border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 xl:grid">
                <span>Proceso</span>
                <span>Empresa duena</span>
                <span>Operacion</span>
                <span>Criticidad</span>
                <span>Etapas</span>
                <span className="text-right">Accion</span>
              </div>

              {filteredProcesses.map((process) => {
                const group = groupedRows.find((item) => item.processId === process.process_id);
                const rows = group?.rows ?? [];

                return (
                  <details
                    className="group/process border-b border-line last:border-b-0"
                    key={process.process_id}
                  >
                    <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#fbfdfe] group-open/process:border-b group-open/process:border-line group-open/process:bg-[#fbfdfe]">
                      <div className="grid gap-3 xl:grid-cols-[1.7fr_160px_160px_100px_100px_100px] xl:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-medium text-sea transition group-open/process:rotate-90 group-hover/process:bg-[#eef7fb]">
                            <ChevronRight className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-base font-medium text-navy">
                              {process.process_name}
                            </h3>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {process.definition ?? "Sin definicion"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500 xl:hidden">Empresa duena</p>
                          <p className="text-sm font-medium text-navy">
                            {process.owner_company_name ?? process.company_name ?? "Sin empresa"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500 xl:hidden">Operacion</p>
                          <p className="text-sm text-slate-700">
                            {process.area_name ?? "Sin tipo"}
                          </p>
                        </div>

                        <div>
                          <TypedBadge type="criticality" value={process.criticality} />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <ValueBadge tone="info">Etapas {process.subprocess_count}</ValueBadge>
                          <ValueBadge tone="neutral">Roles {process.responsibility_count}</ValueBadge>
                        </div>

                        <div className="flex justify-start xl:justify-end">
                          <ProcessDetailModal
                            ownerRoleBySubprocess={ownerRoleBySubprocess}
                            process={process}
                            roleDictionary={roleDictionaryResult.data}
                            stages={rows}
                          />
                        </div>
                      </div>
                    </summary>

                    <div className="bg-[#f8fafb] px-4 py-4">
                      {rows.length === 0 ? (
                        <p className="text-sm text-slate-600">Este proceso aun no tiene etapas.</p>
                      ) : (
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-navy">Vista rapida de etapas</p>
                              <p className="text-sm text-slate-600">
                                Orden operativo, rol dueno e impacto dentro del proceso.
                              </p>
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {rows.length} etapas
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-line bg-white">
                            {rows.map((row, rowIndex) => (
                              <div
                                className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[42px_minmax(220px,1.4fr)_minmax(160px,1fr)_120px] md:items-center"
                                key={row.subprocess_id}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef7fb] text-sm font-medium text-sea">
                                  {row.sort_order ?? rowIndex + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-navy">
                                    {row.subprocess_name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.owner_person_name
                                      ? `Persona actual: ${row.owner_person_name}`
                                      : "Sin persona duena"}
                                  </p>
                                </div>
                                <div className="min-w-0 text-sm">
                                  <p className="text-xs text-slate-500">Rol dueno</p>
                                  <p className="mt-1 font-medium text-navy">
                                    <TextValue value={row.owner_role_name} />
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
      </AccordionPanel>
    </DashboardShell>
  );
}
