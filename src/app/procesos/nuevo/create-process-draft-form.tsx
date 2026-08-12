"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import { createProcessDraft } from "@/app/admin/actions";
import { criticalityOptions } from "@/components/dashboard/badge";

export type DraftCompanyOption = {
  id: string;
  name: string;
};

export type DraftAreaOption = {
  company_id: string | null;
  company_name: string | null;
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </label>
  );
}

function DraftSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-[#fbfdfe] p-4">
      <div>
        <h2 className="text-base font-bold text-navy">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled || pending}
      type="submit"
    >
      <Save className="h-4 w-4 text-clay" />
      {pending ? "Guardando..." : "Guardar borrador"}
    </button>
  );
}

export function CreateProcessDraftForm({
  areas,
  companies,
  optionsError,
}: {
  areas: DraftAreaOption[];
  companies: DraftCompanyOption[];
  optionsError?: string | null;
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id ?? "");
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const hasCompanies = companies.length > 0;
  const visibleAreas = useMemo(
    () => areas.filter((area) => !area.company_id || area.company_id === selectedCompanyId),
    [areas, selectedCompanyId],
  );
  const safeSelectedAreaId = visibleAreas.some((area) => area.id === selectedAreaId)
    ? selectedAreaId
    : "";

  useEffect(() => {
    if (selectedAreaId !== safeSelectedAreaId) {
      setSelectedAreaId(safeSelectedAreaId);
    }
  }, [safeSelectedAreaId, selectedAreaId]);

  return (
    <form action={createProcessDraft} className="rounded-xl border border-line bg-white p-5 shadow-[0_10px_30px_rgba(0,59,92,0.05)]">
      <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy">Nuevo proceso - borrador inicial</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Guarda la base inactiva de la ficha. Etapas, roles y controles se completan despues de tener process_id.
          </p>
        </div>
        <span className="w-fit rounded-full border border-[#cbd8e3] bg-[#f6f8fa] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
          Borrador
        </span>
      </div>

      <div className="mt-5 grid gap-4">
        {optionsError ? (
          <div className="rounded-lg border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d]">
            No se pudieron cargar todas las opciones operativas: {optionsError}
          </div>
        ) : null}

        {!hasCompanies ? (
          <div className="rounded-lg border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d]">
            No se pudieron cargar empresas disponibles para crear procesos. Revisa que existan empresas visibles en el contexto operativo actual.
          </div>
        ) : null}

        <DraftSection description="Datos base del proceso. La persona actual no se edita aqui: deriva del rol oficial." title="General">
          <Field label="Nombre">
            <input className={inputClass} name="name" required />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Empresa">
              <select
                className={inputClass}
                name="company_id"
                onChange={(event) => {
                  setSelectedCompanyId(event.target.value);
                  setSelectedAreaId("");
                }}
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
            <Field
              hint={visibleAreas.length === 0 ? "Puedes guardar el borrador sin area y completarla despues." : undefined}
              label="Area"
            >
              <input name="area_id" type="hidden" value={safeSelectedAreaId} />
              <select
                key={selectedCompanyId}
                className={inputClass}
                onChange={(event) => setSelectedAreaId(event.target.value)}
                value={safeSelectedAreaId}
              >
                <option value="">Sin area</option>
                {visibleAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de proceso">
              <select className={inputClass} name="process_type" required defaultValue="operational">
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
        </DraftSection>

        <DraftSection description="Campos documentales existentes. Inicio, fin y alcance requieren schema futuro." title="1. Proposito y alcance">
          <Field label="Descripcion corta">
            <textarea className={`${inputClass} min-h-24`} name="description" />
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Objetivo">
              <textarea className={`${inputClass} min-h-28`} name="objective" />
            </Field>
            <Field label="Resultado esperado">
              <textarea className={`${inputClass} min-h-28`} name="expected_result" />
            </Field>
          </div>
        </DraftSection>

        <DraftSection description="Datos combinados disponibles hoy. La separacion proveedores/entradas/salidas/clientes queda para schema futuro." title="2. Entradas / salidas e indicadores">
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Entradas y proveedores">
              <textarea className={`${inputClass} min-h-28`} name="inputs_providers" />
            </Field>
            <Field label="Salidas y clientes">
              <textarea className={`${inputClass} min-h-28`} name="outputs_clients" />
            </Field>
            <Field label="KPI basico">
              <textarea className={`${inputClass} min-h-28`} name="basic_kpi" />
            </Field>
          </div>
        </DraftSection>

        <div className="rounded-lg border border-dashed border-line bg-[#fbfdfe] px-4 py-3 text-sm leading-6 text-slate-600">
          Etapas, roles, riesgos, controles, documentos y PDCA quedan disponibles despues de guardar el borrador.
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]"
          href="/procesos"
        >
          Cancelar
        </Link>
        <SubmitButton disabled={!hasCompanies} />
      </div>
    </form>
  );
}
