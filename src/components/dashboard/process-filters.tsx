"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Filter, X } from "lucide-react";

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
    <section className="mt-5 rounded-2xl border border-[#d7e3ec] bg-[#f8fbfd] px-4 py-3 shadow-[0_1px_0_rgba(16,24,32,0.03)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef8fb] text-sea">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-navy">Filtros</p>
            <p className="mt-1 text-sm text-slate-600">
              {visibleCount} de {totalCount} procesos visibles. Se actualiza al cambiar una opción.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Empresa
            <select
              className="mt-1 h-10 min-w-[210px] rounded-xl border border-[#d7e3ec] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#d8eef4]"
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

          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Tipo de operación
            <select
              className="mt-1 h-10 min-w-[210px] rounded-xl border border-[#d7e3ec] bg-white px-3 text-sm font-semibold normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:bg-white focus:ring-2 focus:ring-[#d8eef4]"
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d7e3ec] bg-white px-3 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef8fb]"
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
