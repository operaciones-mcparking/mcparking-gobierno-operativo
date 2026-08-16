"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

export type ProcessFilterName =
  | "company"
  | "ownerRole"
  | "person"
  | "processType"
  | "search"
  | "supportRole"
  | "type";

export type ProcessFilterState = Record<ProcessFilterName, string>;

type FilterOption = {
  id: string;
  name: string;
};

type ProcessFiltersProps = {
  catalogMode?: "all" | "new-only";
  companyOptions: string[];
  filters: ProcessFilterState;
  ownerRoleOptions: FilterOption[];
  personOptions: FilterOption[];
  processTypeOptions: Array<{ label: string; value: string }>;
  resultText: string;
  supportRoleOptions: FilterOption[];
  totalCount: number;
  typeOptions: FilterOption[];
  visibleCount: number;
  onClearFilters: () => void;
  onFilterChange: (name: ProcessFilterName, value: string) => void;
};

export function ProcessFilters({
  catalogMode = "all",
  companyOptions,
  filters,
  ownerRoleOptions,
  personOptions,
  processTypeOptions,
  resultText,
  supportRoleOptions,
  typeOptions,
  onClearFilters,
  onFilterChange,
}: ProcessFiltersProps) {
  const newOnly = catalogMode === "new-only";
  const advancedFilterCount = [
    filters.processType !== "todos",
    filters.ownerRole !== "todos",
    filters.person !== "todos",
    !newOnly && filters.supportRole !== "todos",
    filters.company !== "todas",
    filters.type !== "todos",
  ].filter(Boolean).length;
  const hasSearch = filters.search.length > 0;
  const hasFilters = hasSearch || advancedFilterCount > 0;
  const [filtersOpen, setFiltersOpen] = useState(advancedFilterCount > 0);
  const filtersVisible = newOnly || filtersOpen;
  const filtersPanelId = "process-advanced-filters";

  return (
    <section className="mt-2 pb-4">
      <div className="rounded-xl border border-line bg-white p-3 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="min-w-0 flex-1 text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            <span className="sr-only">Buscar proceso o etapa</span>
            <input
              className="h-11 w-full rounded-lg border border-line bg-[#fbfdfe] px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition placeholder:text-slate-400 focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("search", event.target.value)}
              placeholder="Buscar proceso o etapa..."
              value={filters.search}
            />
          </label>

          {newOnly ? null : (
            <div className="flex gap-2 md:shrink-0">
              <button
                aria-controls={filtersPanelId}
                aria-expanded={filtersOpen}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 md:flex-none"
                onClick={() => setFiltersOpen((current) => !current)}
                type="button"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {advancedFilterCount > 0 ? `Filtros · ${advancedFilterCount}` : "Filtros"}
              </button>

              {hasFilters ? (
                <button
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 md:flex-none"
                  onClick={onClearFilters}
                  type="button"
                >
                  <X className="h-4 w-4" />
                  Limpiar
                </button>
              ) : null}
            </div>
          )}
        </div>

        <p aria-live="polite" className="mt-2 px-1 text-sm text-slate-600">{resultText}</p>

        {filtersVisible ? (
          <div
            className={`mt-3 grid gap-3 rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] p-3 sm:grid-cols-2 ${newOnly ? "lg:grid-cols-3" : "xl:grid-cols-4"}`}
            id={filtersPanelId}
          >
          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Tipo proceso
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("processType", event.target.value)}
              value={filters.processType}
            >
              <option value="todos">Todos</option>
              {processTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Rol dueño
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("ownerRole", event.target.value)}
              value={filters.ownerRole}
            >
              <option value="todos">Todos</option>
              {ownerRoleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Persona
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("person", event.target.value)}
              value={filters.person}
            >
              <option value="todos">Todas</option>
              {personOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          {newOnly ? null : (
<label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Roles de apoyo
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("supportRole", event.target.value)}
              value={filters.supportRole}
            >
              <option value="todos">Todos</option>
              {supportRoleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          )}


          <label className={`text-xs font-medium uppercase tracking-[0.06em] text-slate-600 ${newOnly ? "" : "xl:col-start-1"}`}>
            Empresa
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("company", event.target.value)}
              value={filters.company}
            >
              <option value="todas">Todas las empresas</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Tipo de operación
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              onChange={(event) => onFilterChange("type", event.target.value)}
              value={filters.type}
            >
              <option value="todos">Todos los tipos</option>
              {typeOptions.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          {newOnly ? (
            <div className="flex items-end">
              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 sm:w-auto lg:w-full"
                disabled={!hasFilters}
                onClick={onClearFilters}
                type="button"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            </div>
          ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
