import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import { ProcessFilters } from "@/components/dashboard/process-filters";
import { DashboardShell } from "@/components/dashboard/shell";
import { getProcessCatalog, getProcessMatrix } from "@/lib/dashboard/data";
import type { ProcessCatalogItem } from "@/lib/dashboard/data";

function TextValue({ value }: { value: string | null | undefined }) {
  return <span>{value && value.length > 0 ? value : "No definido"}</span>;
}

function AccordionPanel({
  children,
  count,
  defaultOpen = false,
  description,
  title,
}: {
  children: React.ReactNode;
  count?: string;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}) {
  return (
    <details
      className="group mt-4 border-b border-[#d6e1ea] bg-transparent pb-1"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-1 py-4 transition hover:bg-white/50">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-medium text-sea transition group-open:rotate-90 group-hover:bg-[#eef7fb]">
              &gt;
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-medium tracking-tight text-navy">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
              ) : null}
            </div>
          </div>
          {count ? (
            <span className="w-fit text-xs font-medium text-slate-500">{count}</span>
          ) : null}
        </div>
      </summary>
      <div className="pb-5 pt-2">{children}</div>
    </details>
  );
}

function groupedByProcess<T extends { process_id: string; process_name: string }>(items: T[]) {
  return items.reduce<Array<{ processId: string; processName: string; rows: T[] }>>(
    (groups, item) => {
      const group = groups.find((current) => current.processId === item.process_id);

      if (group) {
        group.rows.push(item);
      } else {
        groups.push({
          processId: item.process_id,
          processName: item.process_name,
          rows: [item],
        });
      }

      return groups;
    },
    [],
  );
}

type ProcesosPageProps = {
  searchParams?: Promise<{
    country_id?: string;
    empresa?: string;
    site_id?: string;
    tipo?: string;
  }>;
};

const processTypeGroups: Array<{
  description: string;
  label: string;
  tone: "info" | "success" | "warning";
  value: ProcessCatalogItem["process_type"];
}> = [
  {
    description: "Definen direccion, prioridades y decisiones de negocio.",
    label: "Estrategicos",
    tone: "info",
    value: "strategic",
  },
  {
    description: "Entregan el servicio principal y generan valor directo.",
    label: "Operativos / Clave",
    tone: "success",
    value: "operational",
  },
  {
    description: "Habilitan que la operacion funcione correctamente.",
    label: "Soporte",
    tone: "warning",
    value: "support",
  },
];

function ProcessMacroMap({ processes }: { processes: ProcessCatalogItem[] }) {
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-5 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Mapa de procesos</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Vista macro de procesos estrategicos, operativos y de soporte.
          </p>
        </div>
        <ValueBadge tone="neutral">{processes.length} procesos</ValueBadge>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_220px] xl:items-stretch">
        <div className="rounded-lg border border-[#dce7ef] bg-[#f8fafb] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Entrada</p>
          <h3 className="mt-2 text-sm font-semibold text-navy">Requerimientos / necesidades</h3>
          <p className="mt-2 text-xs leading-5 text-slate-600">Lo que activa la operacion.</p>
        </div>

        <div className="relative rounded-xl border border-line bg-[#fbfdfe] p-3">
          <div className="hidden xl:block">
            <span className="absolute -left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-sea">
              <ChevronRight className="h-4 w-4" />
            </span>
            <span className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-sea">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {processTypeGroups.map((group) => {
              const groupProcesses = processes.filter(
                (process) => process.process_type === group.value,
              );

              return (
                <article
                  className="rounded-lg border border-[#dce7ef] bg-white p-4"
                  key={group.value}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">{group.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{group.description}</p>
                    </div>
                    <ValueBadge tone={group.tone}>{groupProcesses.length}</ValueBadge>
                  </div>

                  <div className="mt-4 space-y-2">
                    {groupProcesses.length > 0 ? (
                      groupProcesses.slice(0, 4).map((process) => (
                        <div
                          className="rounded-md border border-[#dce7ef] bg-[#f8fafb] px-3 py-2"
                          key={process.process_id}
                        >
                          <p className="line-clamp-2 text-sm font-medium text-navy">
                            {process.process_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {process.area_name ?? "Sin area"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-[#cbd8e3] bg-[#f8fafb] px-3 py-3 text-sm text-slate-600">
                        No hay procesos en este grupo.
                      </div>
                    )}

                    {groupProcesses.length > 4 ? (
                      <p className="text-xs font-medium text-slate-500">
                        +{groupProcesses.length - 4} procesos mas en el listado.
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[#dce7ef] bg-[#f8fafb] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Salida</p>
          <h3 className="mt-2 text-sm font-semibold text-navy">
            Satisfaccion / resultado del servicio
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Lo que recibe el cliente o la organizacion.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function ProcesosPage({ searchParams }: ProcesosPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedCompany = params.empresa ?? "todas";
  const selectedType = params.tipo ?? "todos";
  const context = {
    countryId: params.country_id ?? null,
    siteId: params.site_id ?? null,
  };
  const [catalogResult, matrixResult] = await Promise.all([
    getProcessCatalog(context),
    getProcessMatrix(),
  ]);
  const activeProcesses = catalogResult.data.filter((process) => process.status === "active");

  const companyOptions = Array.from(
    new Set(
      activeProcesses
        .map((process) => process.owner_company_name ?? process.company_name)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const typeOptions = Array.from(
    new Set(activeProcesses.map((process) => process.area_name ?? "Sin tipo")),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const filteredProcesses = activeProcesses.filter((process) => {
    const ownerCompany = process.owner_company_name ?? process.company_name;
    const operationType = process.area_name ?? "Sin tipo";

    return (
      (selectedCompany === "todas" || ownerCompany === selectedCompany) &&
      (selectedType === "todos" || operationType === selectedType)
    );
  });
  const filteredProcessIds = new Set(filteredProcesses.map((process) => process.process_id));
  const groupedRows = groupedByProcess(
    matrixResult.data.filter((row) => filteredProcessIds.has(row.process_id)),
  );
  const processCount =
    filteredProcesses.length === activeProcesses.length
      ? `${activeProcesses.length} procesos`
      : `${filteredProcesses.length} de ${activeProcesses.length} procesos`;

  return (
    <DashboardShell
      description="Catalogo de procesos oficiales con vista rapida desplegable por proceso."
      eyebrow={`${activeProcesses.length} Procesos`}
      title="Procesos oficiales"
    >
      {!catalogResult.error ? <ProcessMacroMap processes={filteredProcesses} /> : null}

      <AccordionPanel
        count={processCount}
        defaultOpen
        description="Listado principal. Abre un proceso solo cuando necesites revisar sus etapas."
        title="Diccionario de procesos oficiales"
      >
        {catalogResult.error || matrixResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
            {catalogResult.error?.message ?? matrixResult.error?.message}
          </div>
        ) : (
          <>
            <ProcessFilters
              companyOptions={companyOptions}
              selectedCompany={selectedCompany}
              selectedType={selectedType}
              totalCount={activeProcesses.length}
              typeOptions={typeOptions}
              visibleCount={filteredProcesses.length}
            />

            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
              <div className="hidden grid-cols-[1.7fr_160px_160px_100px_100px_100px] border-b border-line bg-[#f8fafb] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 xl:grid">
                <span>Proceso</span>
                <span>Empresa duena</span>
                <span>Operacion</span>
                <span>Criticidad</span>
                <span>Etapas</span>
                <span className="text-right">Accion</span>
              </div>

              {filteredProcesses.map((process) => {
                const group = groupedRows.find((item) => item.processId === process.process_id);
                const rows = group?.rows ?? [];

                return (
                  <details
                    className="group/process border-b border-line last:border-b-0"
                    key={process.process_id}
                  >
                    <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[#fbfdfe] group-open/process:border-b group-open/process:border-line group-open/process:bg-[#fbfdfe]">
                      <div className="grid gap-3 xl:grid-cols-[1.7fr_160px_160px_100px_100px_100px] xl:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-medium text-sea transition group-open/process:rotate-90 group-hover/process:bg-[#eef7fb]">
                            <ChevronRight className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-base font-medium text-navy">
                              {process.process_name}
                            </h3>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {process.definition ?? "Sin definicion"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500 xl:hidden">Empresa duena</p>
                          <p className="text-sm font-medium text-navy">
                            {process.owner_company_name ?? process.company_name ?? "Sin empresa"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500 xl:hidden">Operacion</p>
                          <p className="text-sm text-slate-700">
                            {process.area_name ?? "Sin tipo"}
                          </p>
                        </div>

                        <div>
                          <TypedBadge type="criticality" value={process.criticality} />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <ValueBadge tone="info">Etapas {process.subprocess_count}</ValueBadge>
                          <ValueBadge tone="neutral">Roles {process.responsibility_count}</ValueBadge>
                        </div>

                        <div className="flex justify-start xl:justify-end">
                          <Link
                            className="inline-flex items-center gap-2 rounded-full bg-[#eef7fb] px-3 py-1 text-xs font-medium text-sea transition hover:bg-[#dff0f7]"
                            href={`/procesos/${process.process_id}`}
                            title="Ver ficha"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Ver ficha
                          </Link>
                        </div>
                      </div>
                    </summary>

                    <div className="bg-[#f8fafb] px-4 py-4">
                      {rows.length === 0 ? (
                        <p className="text-sm text-slate-600">Este proceso aun no tiene etapas.</p>
                      ) : (
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-navy">Vista rapida de etapas</p>
                              <p className="text-sm text-slate-600">
                                Orden operativo, rol dueno e impacto dentro del proceso.
                              </p>
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {rows.length} etapas
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-line bg-white">
                            {rows.map((row, rowIndex) => (
                              <div
                                className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[42px_minmax(220px,1.4fr)_minmax(160px,1fr)_120px] md:items-center"
                                key={row.subprocess_id}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef7fb] text-sm font-medium text-sea">
                                  {row.sort_order ?? rowIndex + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-navy">
                                    {row.subprocess_name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.owner_person_name
                                      ? `Persona actual: ${row.owner_person_name}`
                                      : "Sin persona duena"}
                                  </p>
                                </div>
                                <div className="min-w-0 text-sm">
                                  <p className="text-xs text-slate-500">Rol dueno</p>
                                  <p className="mt-1 font-medium text-navy">
                                    <TextValue value={row.owner_role_name} />
                                  </p>
                                </div>
                                <div className="text-sm">
                                  <p className="text-xs text-slate-500">Impacto</p>
                                  <p className="mt-1 font-medium text-navy">
                                    {row.impact_percent === null ? "-" : `${row.impact_percent}%`}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="px-4 py-8 text-sm text-slate-600">
                  No hay procesos para los filtros seleccionados.
                </div>
              ) : null}
            </div>
          </>
        )}
      </AccordionPanel>
    </DashboardShell>
  );
}
