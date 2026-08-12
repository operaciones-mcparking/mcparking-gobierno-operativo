"use client";

import Link from "next/link";
import { FileText, Pencil, X } from "lucide-react";
import { useState } from "react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import type {
  ProcessCatalogV2Item,
  ProcessStageV2Row,
  RoleDictionaryItem,
} from "@/lib/dashboard/data";

const processTypeLabels: Record<ProcessCatalogV2Item["process_type"], string> = {
  operational: "Operativo",
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

function TextSection({ label, value }: { label: string; value: string | null }) {
  return (
    <section className="rounded-xl border border-[#dce7ef] bg-[#fbfdfe] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value ?? "Sin informacion registrada."}</p>
    </section>
  );
}

function roleText(roleName: string | null, personName: string | null) {
  if (!roleName || roleName === "No definido") {
    return "No definido";
  }

  return [roleName, personName ?? "Sin persona asignada"].join(" - ");
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

function ChipList({ items }: { items: string[] }) {
  const uniqueItems = [...new Set(items.filter(Boolean))];

  if (uniqueItems.length === 0) {
    return <span className="text-sm text-slate-500">Sin informacion registrada.</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {uniqueItems.map((item) => (
        <ValueBadge key={item} tone="neutral">{item}</ValueBadge>
      ))}
    </div>
  );
}

function StageRoles({ stage }: { stage: ProcessStageV2Row }) {
  const roles = [
    { label: "Dueno", value: roleText(stage.owner_role_name, stage.owner_person_name) },
    { label: "Usuario", value: roleText(stage.user_role_name, stage.user_person_name) },
    { label: "Apoyo", value: roleText(stage.support_role_name, stage.support_person_name) },
    { label: "Respaldo", value: roleText(stage.backup_role_name, stage.backup_person_name) },
  ];

  return (
    <div className="mt-2 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
      {roles.map((role) => (
        <p key={role.label}>
          <span className="font-medium text-slate-500">{role.label}:</span>{" "}
          <span className={role.value === "No definido" ? "text-slate-400" : "text-slate-700"}>
            {role.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ProcessDetailModal({
  ownerRoleBySubprocess,
  process,
  roleDictionary,
  stages,
}: {
  ownerRoleBySubprocess: Record<string, string>;
  process: ProcessCatalogV2Item;
  roleDictionary: RoleDictionaryItem[];
  stages: ProcessStageV2Row[];
}) {
  const [open, setOpen] = useState(false);
  const ownerCompany = process.owner_company_name ?? process.company_name ?? "Sin empresa";
  const ownerSummary = compactList(process.owner_role_names, "Sin rol dueno");
  const personSummary = compactList(process.current_person_names, "Sin persona asignada");

  return (
    <>
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#d6e1ea] bg-white px-3 text-xs font-medium text-sea transition hover:border-sea hover:bg-[#eef7fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
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
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">
                  Ficha de proceso
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
                <ValueBadge tone="info">{processTypeLabels[process.process_type] ?? "Operativo"}</ValueBadge>
                <TypedBadge type="criticality" value={process.criticality} />
                <TypedBadge type="documentation" value={process.documentation_status} />
                <TypedBadge type="status" value={process.status} />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Empresa / area" value={`${ownerCompany} - ${process.area_name ?? "Sin area"}`} />
                <DetailItem label="Rol dueno" value={ownerSummary} />
                <DetailItem label="Persona actual" value={personSummary} />
                <DetailItem label="Etapas activas" value={`${process.active_stage_count} etapas`} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <TextSection label="Objetivo" value={process.objective} />
                <TextSection label="Resultado esperado" value={process.expected_result} />
                <TextSection label="Entradas y proveedores" value={process.inputs_providers} />
                <TextSection label="Salidas y clientes" value={process.outputs_clients} />
                <TextSection label="KPI basico" value={process.basic_kpi} />
              </div>

              <div className="rounded-xl border border-[#dce7ef] bg-white p-4">
                <p className="text-sm font-medium text-navy">Roles de apoyo</p>
                <div className="mt-3">
                  <ChipList items={process.support_role_names} />
                </div>
              </div>

              <div className="rounded-xl border border-[#dce7ef] bg-white p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-navy">Etapas / subprocesos activos</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Vista de solo lectura de las etapas activas registradas para este proceso.
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
                            <StageRoles stage={stage} />
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
                    Este proceso aun no tiene etapas activas registradas.
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
                <Link
                  aria-label={`Editar proceso ${process.process_name}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-[#052a5a] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2"
                  href={`/procesos/${process.process_id}/editar`}
                  title="Editar proceso"
                >
                  <Pencil className="h-4 w-4 text-clay" />
                  Editar proceso
                </Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
