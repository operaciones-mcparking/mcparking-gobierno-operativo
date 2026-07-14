"use client";

import { Pencil, Save, X } from "lucide-react";
import { useState } from "react";

import { updateProcessBasics, updateSubprocessBasics } from "@/app/admin/actions";
import {
  criticalityOptions,
  documentationOptions,
  statusOptions,
} from "@/components/dashboard/badge";
import type { ProcessCatalogItem, ProcessMatrixRow } from "@/lib/dashboard/data";

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
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

function StageBasicsForm({
  processId,
  stage,
  stageNumber,
}: {
  processId: string;
  stage: ProcessMatrixRow;
  stageNumber: number;
}) {
  return (
    <form
      action={updateSubprocessBasics}
      className="rounded-xl border border-[#dce7ef] bg-[#fbfdfe] p-4"
    >
      <input name="process_id" type="hidden" value={processId} />
      <input name="subprocess_id" type="hidden" value={stage.subprocess_id} />
      <input name="return_to" type="hidden" value="/procesos" />

      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sea">
            Etapa {stage.sort_order ?? stageNumber}
          </p>
          <p className="mt-1 text-sm font-medium text-navy">{stage.subprocess_name}</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
          type="submit"
        >
          <Save className="h-4 w-4 text-sea" />
          Guardar etapa
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_150px_130px]">
        <Field label="Nombre">
          <input
            className={inputClass}
            defaultValue={stage.subprocess_name}
            name="name"
            required
          />
        </Field>
        <Field label="Criticidad">
          <select className={inputClass} defaultValue={stage.criticality} name="criticality">
            {criticalityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Impacto %">
          <input
            className={inputClass}
            defaultValue={stage.impact_percent ?? ""}
            max={100}
            min={0}
            name="impact_percent"
            type="number"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Descripcion">
          <textarea
            className={`${inputClass} min-h-20`}
            defaultValue={stage.subprocess_description ?? ""}
            name="description"
          />
        </Field>
      </div>
    </form>
  );
}

export function ProcessEditModal({
  process,
  stages,
}: {
  process: ProcessCatalogItem;
  stages: ProcessMatrixRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        type="button"
      >
        <Pencil className="h-4 w-4 text-clay" />
        Editar proceso
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <section
            aria-labelledby={`process-edit-${process.process_id}`}
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Procesos
                </p>
                <h2 className="mt-1 text-lg font-medium text-navy" id={`process-edit-${process.process_id}`}>
                  Editar proceso
                </h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Actualiza la informacion base sin salir de Procesos.
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

            <form action={updateProcessBasics} className="grid gap-4 p-5">
              <input name="process_id" type="hidden" value={process.process_id} />
              <input name="return_to" type="hidden" value="/procesos" />

              <Field label="Nombre del proceso">
                <input
                  className={inputClass}
                  defaultValue={process.process_name}
                  name="name"
                  required
                />
              </Field>

              <Field label="Descripcion corta">
                <textarea
                  className={`${inputClass} min-h-24`}
                  defaultValue={process.definition ?? ""}
                  name="description"
                />
              </Field>

              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="Objetivo">
                  <textarea
                    className={`${inputClass} min-h-28`}
                    defaultValue={process.objective ?? ""}
                    name="objective"
                  />
                </Field>
                <Field label="Resultado esperado">
                  <textarea
                    className={`${inputClass} min-h-28`}
                    defaultValue={process.expected_result ?? ""}
                    name="expected_result"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Tipo de proceso">
                  <select className={inputClass} defaultValue={process.process_type} name="process_type">
                    {processTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Criticidad">
                  <select className={inputClass} defaultValue={process.criticality} name="criticality">
                    {criticalityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado">
                  <select className={inputClass} defaultValue={process.status} name="status">
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Documentacion">
                  <select
                    className={inputClass}
                    defaultValue={process.documentation_status}
                    name="documentation_status"
                  >
                    {documentationOptions.map((option) => (
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
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a]"
                  type="submit"
                >
                  <Save className="h-4 w-4 text-clay" />
                  Guardar proceso
                </button>
              </div>
            </form>

            <section className="border-t border-[#d6e1ea] p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-medium text-navy">Etapas / subprocesos</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Edita la informacion base de cada etapa. Roles, sistemas y riesgos se mantienen en el editor avanzado.
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">{stages.length} etapas</span>
              </div>

              {stages.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {stages.map((stage, index) => (
                    <StageBasicsForm
                      key={stage.subprocess_id}
                      processId={process.process_id}
                      stage={stage}
                      stageNumber={index + 1}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
                  Este proceso aun no tiene etapas registradas.
                </div>
              )}
            </section>
          </section>
        </div>
      ) : null}
    </>
  );
}
