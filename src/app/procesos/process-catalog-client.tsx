"use client";

import { useMemo, useState } from "react";
import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { ProcessFilters, type ProcessFilterState, type ProcessFilterName } from "@/components/dashboard/process-filters";
import type {
  ProcessCatalogV2Item,
  ProcessStageOwnerRole,
  ProcessStageV2Row,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";
import { ProcessDetailModal } from "./process-detail-modal";
import { ProcessEditModal } from "./process-edit-modal";

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

const emptyFilters: ProcessFilterState = {
  company: "todas",
  ownerRole: "todos",
  person: "todos",
  processType: "todos",
  search: "",
  supportRole: "todos",
  type: "todos",
};

type FilterOption = {
  id: string;
  name: string;
};

type ProcessCatalogClientProps = {
  activeProcesses: ProcessCatalogV2Item[];
  companyOptions: string[];
  matrixRows: ProcessStageV2Row[];
  ownerRoleOptions: FilterOption[];
  personOptions: FilterOption[];
  roleDictionary: RoleDictionaryItem[];
  stageOwnerRoles: ProcessStageOwnerRole[];
  supportRoleOptions: FilterOption[];
  typeOptions: string[];
};

export function ProcessCatalogClient({
  activeProcesses,
  companyOptions,
  matrixRows,
  ownerRoleOptions,
  personOptions,
  roleDictionary,
  stageOwnerRoles,
  supportRoleOptions,
  typeOptions,
}: ProcessCatalogClientProps) {
  const [filters, setFilters] = useState<ProcessFilterState>(emptyFilters);
  const stagesByProcess = useMemo(() => groupedByProcess(matrixRows), [matrixRows]);
  const ownerRoleBySubprocess = useMemo(
    () => Object.fromEntries(stageOwnerRoles.map((ownerRole) => [ownerRole.subprocess_id, ownerRole.role_id])),
    [stageOwnerRoles],
  );
  const filteredProcesses = useMemo(() => {
    const generalQuery = filters.search.trim();

    return activeProcesses.filter((process) => {
      const ownerCompany = process.owner_company_name ?? process.company_name;
      const operationType = process.area_name ?? "Sin tipo";
      const stages = stagesByProcess.find((item) => item.processId === process.process_id)?.rows ?? [];

      return (
        (filters.company === "todas" || ownerCompany === filters.company) &&
        (filters.type === "todos" || operationType === filters.type) &&
        (filters.processType === "todos" || process.process_type === filters.processType) &&
        (filters.ownerRole === "todos" || process.owner_role_ids.includes(filters.ownerRole)) &&
        (filters.person === "todos" || process.current_person_ids.includes(filters.person)) &&
        (filters.supportRole === "todos" || process.support_role_ids.includes(filters.supportRole)) &&
        (!generalQuery ||
          matchesText(process.process_name, generalQuery) ||
          stages.some((stage) => matchesText(stage.subprocess_name, generalQuery)))
      );
    });
  }, [activeProcesses, filters, stagesByProcess]);
  const filteredProcessIds = useMemo(
    () => new Set(filteredProcesses.map((process) => process.process_id)),
    [filteredProcesses],
  );
  const groupedRows = useMemo(
    () => groupedByProcess(matrixRows.filter((row) => filteredProcessIds.has(row.process_id))),
    [filteredProcessIds, matrixRows],
  );
  const resultText = `${filteredProcesses.length} ${filteredProcesses.length === 1 ? "proceso encontrado" : "procesos encontrados"}`;

  function updateFilter(name: ProcessFilterName, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function clearFilters() {
    setFilters(emptyFilters);
  }

  return (
    <>
      <ProcessFilters
        companyOptions={companyOptions}
        filters={filters}
        ownerRoleOptions={ownerRoleOptions}
        personOptions={personOptions}
        processTypeOptions={processTypeOptions}
        resultText={resultText}
        supportRoleOptions={supportRoleOptions}
        totalCount={activeProcesses.length}
        typeOptions={typeOptions}
        visibleCount={filteredProcesses.length}
        onClearFilters={clearFilters}
        onFilterChange={updateFilter}
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
                      roleDictionary={roleDictionary}
                      stages={rows}
                    />
                    <ProcessEditModal
                      ariaLabel={`Editar proceso ${process.process_name}`}
                      ownerRoleBySubprocess={ownerRoleBySubprocess}
                      process={process}
                      roleDictionary={roleDictionary}
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
                    roleDictionary={roleDictionary}
                    stages={rows}
                  />
                  <ProcessEditModal
                    ariaLabel={`Editar proceso ${process.process_name}`}
                    ownerRoleBySubprocess={ownerRoleBySubprocess}
                    process={process}
                    roleDictionary={roleDictionary}
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
  );
}
