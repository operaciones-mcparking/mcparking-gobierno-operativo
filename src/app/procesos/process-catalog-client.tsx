"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileDown } from "lucide-react";
import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { ProcessFilters, type ProcessFilterState, type ProcessFilterName } from "@/components/dashboard/process-filters";
import type { ProcessOperationTypeOption } from "@/lib/procesos/process-company-options";
import type {
  ProcessCatalogV2Item,
  ProcessStageOwnerRole,
  ProcessStageV2Row,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";
import { ProcessDetailModal } from "./process-detail-modal";

function ownerRoleText(roleName: string | null, personName: string | null) {
  if (!roleName || roleName === "No definido") {
    return "Dueno: No definido";
  }

  return `Dueno: ${roleName} - ${personName ?? "Sin persona asignada"}`;
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
const legacyProcessListGridColumns = "xl:grid-cols-[88px_minmax(260px,1fr)_136px_126px_78px_144px_146px]";
const newProcessListGridColumns = "xl:grid-cols-[88px_minmax(340px,1fr)_148px_140px_78px_146px]";
type ProcessSortKey = "type" | "process" | "owner" | "person" | "stages";
type ProcessSortState = { direction: "ascending" | "descending"; key: ProcessSortKey };

const processTypeSortOrder: Record<ProcessCatalogV2Item["process_type"], number> = {
  strategic: 0,
  operational: 1,
  support: 2,
};
const processSortCollator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function processSortText(values: string[], fallback: string) {
  return values.length > 0 ? values.join(" ") : fallback;
}

function sortOfficialProcesses(processes: ProcessCatalogV2Item[], sort: ProcessSortState | null) {
  if (!sort) return processes;

  return [...processes].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "type") comparison = processTypeSortOrder[left.process_type] - processTypeSortOrder[right.process_type];
    if (sort.key === "process") comparison = processSortCollator.compare(left.process_name, right.process_name);
    if (sort.key === "owner") comparison = processSortCollator.compare(
      processSortText(left.owner_role_names, "Sin rol dueno"),
      processSortText(right.owner_role_names, "Sin rol dueno"),
    );
    if (sort.key === "person") comparison = processSortCollator.compare(
      processSortText(left.current_person_names, "Sin persona asignada"),
      processSortText(right.current_person_names, "Sin persona asignada"),
    );
    if (sort.key === "stages") comparison = left.active_stage_count - right.active_stage_count;

    if (comparison === 0) comparison = processSortCollator.compare(left.process_name, right.process_name);
    if (comparison === 0) comparison = left.process_id.localeCompare(right.process_id);
    return sort.direction === "ascending" ? comparison : -comparison;
  });
}

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
  canEditProcesses?: boolean;
  canExportPdf?: boolean;
  canViewProcessDetails?: boolean;
  catalogMode?: "all" | "new-only";
  companyOptions: string[];
  matrixRows: ProcessStageV2Row[];
  ownerRoleOptions: FilterOption[];
  personOptions: FilterOption[];
  roleDictionary: RoleDictionaryItem[];
  stageOwnerRoles: ProcessStageOwnerRole[];
  supportRoleOptions: FilterOption[];
  typeOptions: ProcessOperationTypeOption[];
};

export function ProcessCatalogClient({
  activeProcesses,
  canEditProcesses = false,
  canExportPdf = true,
  canViewProcessDetails = true,
  catalogMode = "all",
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
  const [sort, setSort] = useState<ProcessSortState | null>(null);
  const catalogProcesses = useMemo(
    () => catalogMode === "new-only" ? activeProcesses.filter((process) => Boolean(process.process_code?.trim())) : activeProcesses,
    [activeProcesses, catalogMode],
  );
  const stagesByProcess = useMemo(() => groupedByProcess(matrixRows), [matrixRows]);
  const ownerRoleBySubprocess = useMemo(
    () => Object.fromEntries(stageOwnerRoles.map((ownerRole) => [ownerRole.subprocess_id, ownerRole.role_id])),
    [stageOwnerRoles],
  );
  const filteredProcesses = useMemo(() => {
    const generalQuery = filters.search.trim();

    return catalogProcesses.filter((process) => {
      const ownerCompany = process.owner_company_name ?? process.company_name;
      const stages = stagesByProcess.find((item) => item.processId === process.process_id)?.rows ?? [];

      return (
        (filters.company === "todas" || ownerCompany === filters.company) &&
        (filters.type === "todos" || process.area_id === filters.type) &&
        (filters.processType === "todos" || process.process_type === filters.processType) &&
        (filters.ownerRole === "todos" || process.owner_role_ids.includes(filters.ownerRole)) &&
        (filters.person === "todos" || process.current_person_ids.includes(filters.person)) &&
        (catalogMode === "new-only" || filters.supportRole === "todos" || process.support_role_ids.includes(filters.supportRole)) &&
        (!generalQuery ||
          matchesText(process.process_name, generalQuery) ||
          stages.some((stage) => matchesText(stage.subprocess_name, generalQuery)))
      );
    });
  }, [catalogMode, catalogProcesses, filters, stagesByProcess]);
  const filteredProcessIds = useMemo(
    () => new Set(filteredProcesses.map((process) => process.process_id)),
    [filteredProcesses],
  );
  const groupedRows = useMemo(
    () => groupedByProcess(matrixRows.filter((row) => filteredProcessIds.has(row.process_id))),
    [filteredProcessIds, matrixRows],
  );
  const resultText = `${filteredProcesses.length} ${filteredProcesses.length === 1 ? "proceso encontrado" : "procesos encontrados"}`;
  const newProcesses = useMemo(() => filteredProcesses.filter((process) => Boolean(process.process_code)), [filteredProcesses]);
  const historicalProcesses = useMemo(() => filteredProcesses.filter((process) => !process.process_code), [filteredProcesses]);
  const sortedNewProcesses = useMemo(
    () => catalogMode === "new-only" ? sortOfficialProcesses(newProcesses, sort) : newProcesses,
    [catalogMode, newProcesses, sort],
  );

  function updateFilter(name: ProcessFilterName, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function clearFilters() {
    setFilters(emptyFilters);
  }

  function toggleSort(key: ProcessSortKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
      : { key, direction: "ascending" });
  }

  function sortableHeader(label: string, key: ProcessSortKey, centered = false) {
    const active = sort?.key === key;
    return (
      <div aria-sort={active ? sort.direction : "none"} className={centered ? "text-center" : undefined} role="columnheader">
        <button
          className={`inline-flex items-center gap-1 rounded-sm px-0.5 py-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${active ? "font-bold text-navy" : "hover:text-navy"}`}
          onClick={() => toggleSort(key)}
          type="button"
        >
          {label}
          {active ? (sort.direction === "ascending" ? <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />) : null}
        </button>
      </div>
    );
  }
  function renderProcessGroup(
    title: string,
    description: string,
    processes: ProcessCatalogV2Item[],
    secondary = false,
    newModel = false,
  ) {
    const gridColumns = newModel ? newProcessListGridColumns : legacyProcessListGridColumns;
    const hideGroupHeader = catalogMode === "new-only" && newModel;
    const compactMobile = catalogMode === "new-only" && newModel;

    return (
      <section className={hideGroupHeader ? "mt-3" : secondary ? "mt-7 border-t border-line pt-6" : "mt-5"}>
        {hideGroupHeader ? null : (
          <div className="flex flex-wrap items-start justify-between gap-3 px-1">
          <div>
            <h3 className={secondary ? "text-sm font-semibold text-slate-700" : "text-base font-semibold text-navy"}>
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <ValueBadge tone={secondary ? "neutral" : "info"}>
            {processes.length} {processes.length === 1 ? "proceso" : "procesos"}
          </ValueBadge>
          </div>
        )}
        <div className={`${hideGroupHeader ? "" : "mt-3 "}overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]`}>
        <div className={`hidden gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 xl:grid ${gridColumns}`}>
          {catalogMode === "new-only" ? sortableHeader("Tipo", "type") : <span>Tipo</span>}
          {catalogMode === "new-only" ? sortableHeader("Proceso", "process") : <span>Proceso</span>}
          {catalogMode === "new-only" ? sortableHeader("Rol dueno", "owner") : <span>Rol dueno</span>}
          {catalogMode === "new-only" ? sortableHeader("Persona actual", "person") : <span>Persona actual</span>}
          {catalogMode === "new-only" ? sortableHeader("Etapas", "stages", true) : <span className="text-center">Etapas</span>}
          {newModel ? null : <span>Roles de apoyo</span>}
          <span className="text-right" role="columnheader">Accion</span>
        </div>

        {processes.map((process) => {
          const typeMeta = processTypeMeta(process.process_type);
          const group = groupedRows.find((item) => item.processId === process.process_id);
          const rows = group?.rows ?? [];
          const ownerText = compactList(process.owner_role_names, "Sin rol dueno");
          const personText = compactList(process.current_person_names, "Sin persona asignada");

          return (
            <details
              className="group/process border-b border-line last:border-b-0"
              key={process.process_id}
            >
              <summary
                aria-disabled={newModel && rows.length === 0}
                aria-label={`Expandir o contraer ${process.process_name}`}
                className={`cursor-pointer list-none transition hover:bg-[#fbfdfe] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 group-open/process:border-b group-open/process:border-line group-open/process:bg-[#fbfdfe] aria-disabled:cursor-default ${compactMobile ? "px-3 py-2.5 sm:px-4 sm:py-3" : "px-4 py-3"}`}
                onClick={newModel && rows.length === 0 ? (event) => event.preventDefault() : undefined}
              >
                <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-center xl:gap-3 ${compactMobile ? "gap-x-3 gap-y-2" : "gap-3"} ${gridColumns}`}>
                  <div className={compactMobile ? "col-start-1 row-start-1 xl:col-auto xl:row-auto" : "col-start-1 xl:col-auto"}>
                    <ValueBadge tone={typeMeta.tone}>{typeMeta.label}</ValueBadge>
                  </div>

                  <div className={compactMobile ? "col-span-2 row-start-2 min-w-0 xl:col-auto xl:row-auto" : "min-w-0"}>
                    <h3 className="text-base font-medium leading-snug text-navy">
                      {process.process_name}
                    </h3>
                  </div>

                  <div className={compactMobile ? "col-start-1 row-start-3 min-w-0 xl:col-auto xl:row-auto" : "col-start-1 xl:col-auto"}>
                    <p className="mb-0.5 text-[11px] leading-tight text-slate-500 xl:hidden">Rol dueno</p>
                    <p className="text-sm font-medium leading-snug text-navy">{ownerText}</p>
                  </div>

                  <div className={compactMobile ? "col-start-2 row-start-3 min-w-0 xl:col-auto xl:row-auto" : "col-start-1 xl:col-auto"}>
                    <p className="mb-0.5 text-[11px] leading-tight text-slate-500 xl:hidden">Persona actual</p>
                    <p className={`text-sm font-medium leading-snug ${process.current_person_names.length === 0 ? "text-[#86510d]" : "text-navy"}`}>
                      {personText}
                    </p>
                  </div>

                  <div className={compactMobile ? "col-start-2 row-start-1 flex justify-self-end xl:col-auto xl:row-auto xl:justify-self-auto xl:justify-center" : "col-start-1 flex flex-wrap gap-2 xl:col-auto xl:justify-center"}>
                    <ValueBadge tone="info">Etapas {process.active_stage_count}</ValueBadge>
                  </div>

                  {newModel ? null : (
                    <div className="col-start-1 xl:col-auto">
                      <p className="text-xs text-slate-500 xl:hidden">Roles de apoyo</p>
                      <SupportRoleSummary values={process.support_role_names} />
                    </div>
                  )}

                  <div className="hidden items-center justify-end gap-2 xl:col-auto xl:flex">
                    {canViewProcessDetails ? <ProcessDetailModal
                      canEdit={canEditProcesses}
                      ownerRoleBySubprocess={ownerRoleBySubprocess}
                      process={process}
                      roleDictionary={roleDictionary}
                      stages={rows}
                    /> : null}
                    {canExportPdf ? <a
                      aria-label={`Descargar ficha PDF de ${process.process_name}`}
                      className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 xl:inline-flex"
                      download
                      href={`/api/procesos/${process.process_id}/pdf`}
                      onClick={(event) => event.stopPropagation()}
                      title="Descargar PDF"
                    >
                      <FileDown className="h-4 w-4" />
                    </a> : null}

                  </div>
                </div>
              </summary>

              <div className="bg-[#f8fafb] px-4 py-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row xl:hidden">
                  {canViewProcessDetails ? <ProcessDetailModal
                    canEdit={canEditProcesses}
                    ownerRoleBySubprocess={ownerRoleBySubprocess}
                    process={process}
                    roleDictionary={roleDictionary}
                    stages={rows}
                  /> : null}
                  {canExportPdf ? <a
                    aria-label={`Descargar ficha PDF de ${process.process_name}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
                    download
                    href={`/api/procesos/${process.process_id}/pdf`}
                    onClick={(event) => event.stopPropagation()}
                    title="Descargar PDF"
                  >
                    <FileDown className="h-4 w-4" />
                  </a> : null}
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-600">Este proceso aun no tiene etapas activas.</p>
                ) : (
                  <div>
                    <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-medium text-navy">Vista rapida de etapas activas</p>
                        <p className="text-sm text-slate-600">
                          {newModel
                            ? "Nombre y descripcion documental de cada etapa."
                            : "Orden operativo, rol dueno e impacto dentro del proceso."}
                        </p>
                      </div>
                      {newModel ? null : (
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {process.support_role_names.map((roleName) => (
                            <ValueBadge key={roleName} tone="neutral">{roleName}</ValueBadge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-line bg-white">
                      {rows.map((row, rowIndex) => (
                        newModel ? (
                          <div
                            className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[42px_minmax(0,1fr)] sm:items-start"
                            key={row.subprocess_id}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef7fb] text-sm font-medium text-sea">
                              {row.sort_order ?? rowIndex + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-navy">{row.subprocess_name}</p>
                              <p className="mt-1 text-sm leading-5 text-slate-600">
                                {row.subprocess_description?.trim() || "Sin descripcion"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[42px_minmax(220px,1.4fr)_minmax(220px,1fr)_120px] md:items-center"
                            key={row.subprocess_id}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef7fb] text-sm font-medium text-sea">
                              {row.sort_order ?? rowIndex + 1}
                            </div>
                            <div className="min-w-0"><p className="text-sm font-medium text-navy">{row.subprocess_name}</p></div>
                            <div className="min-w-0 text-sm">
                              <p className="text-xs text-slate-500">Responsable funcional</p>
                              <p className="mt-1 font-medium text-navy">{ownerRoleText(row.owner_role_name, row.owner_person_name)}</p>
                            </div>
                            <div className="text-sm">
                              <p className="text-xs text-slate-500">Impacto</p>
                              <p className="mt-1 font-medium text-navy">{row.impact_percent === null ? "-" : `${row.impact_percent}%`}</p>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          );
        })}

        {processes.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-600">
            No hay procesos en este grupo para los filtros seleccionados.
          </div>
        ) : null}
      </div>
      </section>
    );
  }
  return (
    <>
      <ProcessFilters
        catalogMode={catalogMode}
        companyOptions={companyOptions}
        filters={filters}
        ownerRoleOptions={ownerRoleOptions}
        personOptions={personOptions}
        processTypeOptions={processTypeOptions}
        resultText={resultText}
        supportRoleOptions={supportRoleOptions}
        totalCount={catalogProcesses.length}
        typeOptions={typeOptions}
        visibleCount={filteredProcesses.length}
        onClearFilters={clearFilters}
        onFilterChange={updateFilter}
      />

      {renderProcessGroup(
        "Procesos nuevos",
        "Procesos creados con código documental asignado.",
        sortedNewProcesses,
        false,
        true,
      )}
      {catalogMode === "all" ? renderProcessGroup(
        "Procesos históricos / por documentar",
        "Procesos existentes que aún no tienen código documental.",
        historicalProcesses,
        true,
      ) : null}
    </>
  );
}
