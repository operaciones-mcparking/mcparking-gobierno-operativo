"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type FilterOption = {
  id: string;
  name: string;
};

type ProcessFiltersProps = {
  companyOptions: string[];
  ownerRoleOptions: FilterOption[];
  personOptions: FilterOption[];
  processQuery: string;
  processTypeOptions: Array<{ label: string; value: string }>;
  selectedCompany: string;
  selectedOwnerRole: string;
  selectedPerson: string;
  selectedProcessType: string;
  selectedStage: string;
  selectedSupportRole: string;
  selectedType: string;
  stageQuery: string;
  supportRoleOptions: FilterOption[];
  totalCount: number;
  typeOptions: string[];
  visibleCount: number;
};

export function ProcessFilters({
  companyOptions,
  ownerRoleOptions,
  personOptions,
  processQuery,
  processTypeOptions,
  selectedCompany,
  selectedOwnerRole,
  selectedPerson,
  selectedProcessType,
  selectedStage,
  selectedSupportRole,
  selectedType,
  stageQuery,
  supportRoleOptions,
  totalCount,
  typeOptions,
  visibleCount,
}: ProcessFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasFilters =
    selectedCompany !== "todas" ||
    selectedType !== "todos" ||
    selectedProcessType !== "todos" ||
    selectedOwnerRole !== "todos" ||
    selectedPerson !== "todos" ||
    selectedSupportRole !== "todos" ||
    processQuery.length > 0 ||
    selectedStage.length > 0;

  function updateFilter(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const nextValue = value.trim();

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
    <section className="mt-2 border-b border-[#d6e1ea] pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-navy">Filtros</p>
          <p className="mt-1 text-sm text-slate-600">
            {visibleCount} de {totalCount} procesos visibles. Se actualiza al cambiar una opcion.
          </p>
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-4 xl:grid-cols-7">
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
            Proceso
            <input
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("process", event.target.value)}
              placeholder="Buscar"
              value={processQuery}
            />
          </label>

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Etapa
            <input
              className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
              disabled={isPending}
              onChange={(event) => updateFilter("stage", event.target.value)}
              placeholder="Buscar"
              value={stageQuery}
            />
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
            Roles apoyo
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

          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
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
            Tipo de operacion
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

          {hasFilters ? (
            <button
              className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-line bg-white px-3 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
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
    </section>
  );
}