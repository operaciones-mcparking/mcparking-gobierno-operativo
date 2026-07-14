"use client";

import { FileText, X } from "lucide-react";
import { useState } from "react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import type { ProcessCatalogItem, ProcessMatrixRow } from "@/lib/dashboard/data";
import { ProcessEditModal } from "./process-edit-modal";

const processTypeLabels: Record<ProcessCatalogItem["process_type"], string> = {
  operational: "Operativo / Clave",
  strategic: "Estrategico",
  support: "Soporte",
};

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#dce7ef] bg-[#fbfdfe] px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-navy">{value}</div>
    </div>
  );
}

export function ProcessDetailModal({
  process,
  stages,
}: {
  process: ProcessCatalogItem;
  stages: ProcessMatrixRow[];
}) {
  const [open, setOpen] = useState(false);
  const ownerCompany = process.owner_company_name ?? process.company_name ?? "Sin empresa";

  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-full bg-[#eef7fb] px-3 py-1 text-xs font-medium text-sea transition hover:bg-[#dff0f7]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title="Ver ficha"
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        Ver ficha
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <section
            aria-labelledby={`process-detail-${process.process_id}`}
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Ficha rapida de proceso
                </p>
                <h2 className="mt-1 text-lg font-medium text-navy" id={`process-detail-${process.process_id}`}>
                  {process.process_name}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">
                  {process.definition ?? "Sin descripcion registrada."}
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

            <div className="grid gap-4 p-5">
              <div className="flex flex-wrap gap-2">
                <ValueBadge tone="info">{processTypeLabels[process.process_type] ?? "Operativo / Clave"}</ValueBadge>
                <TypedBadge type="criticality" value={process.criticality} />
                <TypedBadge type="documentation" value={process.documentation_status} />
                <TypedBadge type="status" value={process.status} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <DetailItem label="Empresa duena" value={ownerCompany} />
                <DetailItem label="Operacion / area" value={process.area_name ?? "Sin area"} />
                <DetailItem label="Tipo de proceso" value={processTypeLabels[process.process_type] ?? "Operativo / Clave"} />
                <DetailItem label="Documentacion" value={<TypedBadge type="documentation" value={process.documentation_status} />} />
                <DetailItem label="Etapas" value={`${process.subprocess_count} etapas`} />
                <DetailItem label="Roles" value={`${process.responsibility_count} roles`} />
              </div>

              <div className="rounded-xl border border-[#dce7ef] bg-[#fbfdfe] p-4">
                <p className="text-sm font-medium text-navy">Resumen</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {process.objective ?? process.expected_result ?? "Este proceso aun no tiene objetivo o resultado esperado registrado."}
                </p>
              </div>

              <div className="rounded-xl border border-[#dce7ef] bg-white p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-navy">Etapas / subprocesos</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Vista de solo lectura de las etapas registradas para este proceso.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {stages.length} etapas
                  </span>
                </div>

                {stages.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {stages.map((stage, index) => (
                      <div
                        className="rounded-lg border border-[#dce7ef] bg-[#fbfdfe] px-3 py-2"
                        key={stage.subprocess_id}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-navy">
                              {stage.sort_order ?? index + 1}. {stage.subprocess_name}
                            </p>
                            {stage.subprocess_description ? (
                              <p className="mt-1 text-xs leading-5 text-slate-600">
                                {stage.subprocess_description}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-slate-500">
                              Rol dueno: {stage.owner_role_name ?? "Sin rol dueno"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <TypedBadge type="criticality" value={stage.criticality} />
                            <ValueBadge tone="neutral">
                              Impacto {stage.impact_percent === null ? "-" : `${stage.impact_percent}%`}
                            </ValueBadge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
                    Este proceso aun no tiene etapas registradas.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[#d6e1ea] pt-4">
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cerrar
                </button>
                <ProcessEditModal process={process} stages={stages} />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
