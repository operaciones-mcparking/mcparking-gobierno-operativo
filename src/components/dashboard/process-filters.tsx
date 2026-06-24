"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type ProcessFiltersProps = {
  companyOptions: string[];
  selectedCompany: string;
  selectedType: string;
  totalCount: number;
  typeOptions: string[];
  visibleCount: number;
};

export function ProcessFilters({
  companyOptions,
  selectedCompany,
  selectedType,
  totalCount,
  typeOptions,
  visibleCount,
}: ProcessFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const hasFilters = selectedCompany !== "todas" || selectedType !== "todos";

  function updateFilter(name: "empresa" | "tipo", value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "todas" || value === "todos") {
      params.delete(name);
    } else {
      params.set(name, value);
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-xs font-medium uppercase tracking-[0.06em] text-slate-600">
            Empresa
            <select
              className="mt-1 h-10 min-w-[210px] rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
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
              className="mt-1 h-10 min-w-[210px] rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#e6edf3]"
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-navy transition hover:border-sea hover:bg-[#eef4f8]"
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
