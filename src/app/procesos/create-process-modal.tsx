"use client";

import { useState } from "react";
import { PlusCircle, X } from "lucide-react";

import { addProcess } from "@/app/admin/actions";
import { criticalityOptions } from "@/components/dashboard/badge";

type Option = {
  id: string;
  name: string;
};

type AreaOption = Option & {
  company_id: string | null;
  company_name: string | null;
};

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estratégico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function CreateProcessModal({
  areas,
  companies,
  optionsError,
}: {
  areas: AreaOption[];
  companies: Option[];
  optionsError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id ?? "");
  const hasCompanies = companies.length > 0;
  const companyAreas = areas.filter(
    (area) => !area.company_id || area.company_id === selectedCompanyId,
  );
  const visibleAreas = companyAreas.length > 0 ? companyAreas : areas;
  const areaLabel = (area: AreaOption) =>
    area.company_id && area.company_id !== selectedCompanyId && area.company_name
      ? `${area.name} - ${area.company_name}`
      : area.name;

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white shadow-[0_10px_22px_rgba(2,53,116,0.12)] transition hover:bg-[#075077]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <PlusCircle className="h-4 w-4 text-clay" />
        Nuevo proceso
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm">
          <section
            aria-labelledby="create-process-title"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Mapa de procesos
                </p>
                <h2 className="mt-1 text-lg font-medium text-navy" id="create-process-title">
                  Nuevo proceso
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Crea un proceso activo para incorporarlo al mapa macro y al listado oficial.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-lg border border-[#cbd8e3] bg-white p-2 text-slate-500 transition hover:bg-[#f6f8fa] hover:text-navy"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form action={addProcess} className="grid gap-4 p-5">
              <input name="return_to" type="hidden" value="/procesos" />
              <input name="documentation_status" type="hidden" value="draft" />

              {optionsError ? (
                <div className="rounded-lg border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d]">
                  No se pudieron cargar todas las opciones operativas: {optionsError}
                </div>
              ) : null}

              {!hasCompanies ? (
                <div className="rounded-lg border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d]">
                  No se pudieron cargar empresas disponibles para crear procesos. Revisa que
                  existan empresas visibles en el contexto operativo actual.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Empresa">
                  <select
                    className={inputClass}
                    name="company_id"
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    required
                    value={selectedCompanyId}
                  >
                    {hasCompanies ? (
                      companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No hay empresas disponibles</option>
                    )}
                  </select>
                </Field>
                <Field label="Área">
                  <select className={inputClass} name="area_id">
                    <option value="">Sin área</option>
                    {visibleAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {areaLabel(area)}
                      </option>
                    ))}
                  </select>
                  {visibleAreas.length === 0 ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      No hay areas disponibles para esta empresa. Puedes crear el proceso sin area
                      y completarla despues.
                    </p>
                  ) : null}
                </Field>
              </div>

              <Field label="Nombre del proceso">
                <input className={inputClass} name="name" required />
              </Field>

              <Field label="Descripción corta">
                <textarea className={`${inputClass} min-h-24`} name="description" />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tipo de proceso">
                  <select className={inputClass} name="process_type" defaultValue="operational">
                    {processTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Criticidad">
                  <select className={inputClass} name="criticality" defaultValue="medium">
                    {criticalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[#d6e1ea] pt-4">
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!hasCompanies}
                  type="submit"
                >
                  <PlusCircle className="h-4 w-4 text-clay" />
                  Crear proceso
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
