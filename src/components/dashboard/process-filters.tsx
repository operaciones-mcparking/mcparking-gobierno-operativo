"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type FilterOption = {
  id: string;
  name: string;
};

type ProcessFiltersProps = {
  companyOptions: string[];
  ownerRoleOptions: FilterOption[];
  personOptions: FilterOption[];
  processTypeOptions: Array<{ label: string; value: string }>;
  resultText: string;
  searchQuery: string;
  selectedCompany: string;
  selectedOwnerRole: string;
  selectedPerson: string;
  selectedProcessType: string;
  selectedSupportRole: string;
  selectedType: string;
  supportRoleOptions: FilterOption[];
  totalCount: number;
  typeOptions: string[];
  visibleCount: number;
};

export function ProcessFilters({
  companyOptions,
  ownerRoleOptions,
  personOptions,
  processTypeOptions,
  resultText,
  searchQuery,
  selectedCompany,
  selectedOwnerRole,
  selectedPerson,
  selectedProcessType,
  selectedSupportRole,
  selectedType,
  supportRoleOptions,
  typeOptions,
}: ProcessFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const advancedFilterCount = [
    selectedProcessType !== "todos",
    selectedOwnerRole !== "todos",
    selectedPerson !== "todos",
    selectedSupportRole !== "todos",
    selectedCompany !== "todas",
    selectedType !== "todos",
  ].filter(Boolean).length;
  const hasSearch = searchQuery.length > 0;
  const hasFilters = hasSearch || advancedFilterCount > 0;
  const [filtersOpen, setFiltersOpen] = useState(advancedFilterCount > 0);
  const filtersPanelId = "process-advanced-filters";

  function updateFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const nextValue = value.trim();

    if (name === "search") {
      params.delete("process");
      params.delete("stage");
    }

    if (!nextValue || nextValue === "todas" || nextValue === "todos") {
      params.delete(name);
    } else {
      params.set(name, nextValue);
    }

    startTransition(() => {
      router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <section className="mt-2 pb-4">
      <div className="rounded-xl border border-line bg-white p-3 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="min-w-0 flex-1 text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            <span className="sr-only">Buscar proceso o etapa</span>
            <input
              className="h-11 w-full rounded-lg border border-line bg-[#fbfdfe] px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition placeholder:text-slate-400 focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Buscar proceso o etapa..."
              value={searchQuery}
            />
          </label>

          <div className="flex gap-2 md:shrink-0">
            <button
              aria-controls={filtersPanelId}
              aria-expanded={filtersOpen}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 md:flex-none"
              disabled={isPending}
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {advancedFilterCount > 0 ? `Filtros · ${advancedFilterCount}` : "Filtros"}
            </button>

            {hasFilters ? (
              <button
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2 md:flex-none"
                disabled={isPending}
                onClick={clearFilters}
                type="button"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-2 px-1 text-sm text-slate-600">{resultText}</p>

        {filtersOpen ? (
          <div
            className="mt-3 grid gap-2 rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] p-3 sm:grid-cols-2 xl:grid-cols-4"
            id={filtersPanelId}
          >
          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Tipo proceso
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("process_type", event.target.value)}
              value={selectedProcessType}
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
              disabled={isPending}
              onChange={(event) => updateFilter("owner_role", event.target.value)}
              value={selectedOwnerRole}
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
              disabled={isPending}
              onChange={(event) => updateFilter("person", event.target.value)}
              value={selectedPerson}
            >
              <option value="todos">Todas</option>
              {personOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Roles de apoyo
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("support_role", event.target.value)}
              value={selectedSupportRole}
            >
              <option value="todos">Todos</option>
              {supportRoleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600 xl:col-start-1">
            Empresa
            <select
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("empresa", event.target.value)}
              value={selectedCompany}
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
              disabled={isPending}
              onChange={(event) => updateFilter("tipo", event.target.value)}
              value={selectedType}
            >
              <option value="todos">Todos los tipos</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}
