import Link from "next/link";
import { ChevronRight, FileText, Workflow } from "lucide-react";

import { TypedBadge } from "@/components/dashboard/badge";
import { ProcessFilters } from "@/components/dashboard/process-filters";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import { getProcessCatalog, getProcessMatrix } from "@/lib/dashboard/data";

function TextValue({ value }: { value: string | null | undefined }) {
  return <span>{value && value.length > 0 ? value : "No definido"}</span>;
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
    empresa?: string;
    tipo?: string;
  }>;
};

export default async function ProcesosPage({ searchParams }: ProcesosPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedCompany = params.empresa ?? "todas";
  const selectedType = params.tipo ?? "todos";
  const [catalogResult, matrixResult] = await Promise.all([
    getProcessCatalog(),
    getProcessMatrix(),
  ]);

  const companyOptions = Array.from(
    new Set(
      catalogResult.data
        .map((process) => process.owner_company_name ?? process.company_name)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const typeOptions = Array.from(
    new Set(catalogResult.data.map((process) => process.area_name ?? "Sin tipo")),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const filteredProcesses = catalogResult.data.filter((process) => {
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

  return (
    <DashboardShell
      description="Catálogo de procesos oficiales con vista rápida desplegable por proceso."
      eyebrow={`${catalogResult.data.length} Procesos`}
      title="Procesos oficiales"
    >
      <Panel
        count={
          filteredProcesses.length === catalogResult.data.length
            ? `${catalogResult.data.length} procesos`
            : `${filteredProcesses.length} de ${catalogResult.data.length} procesos`
        }
        title="Procesos modelo"
      >
        {catalogResult.error || matrixResult.error ? (
          <div className="mt-5 rounded-md border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
            {catalogResult.error?.message ?? matrixResult.error?.message}
          </div>
        ) : (
          <>
            <ProcessFilters
              companyOptions={companyOptions}
              selectedCompany={selectedCompany}
              selectedType={selectedType}
              totalCount={catalogResult.data.length}
              typeOptions={typeOptions}
              visibleCount={filteredProcesses.length}
            />

            <div className="mt-4 divide-y divide-[#d7e3ec] overflow-hidden rounded-2xl border border-[#d7e3ec] bg-white shadow-[0_12px_32px_rgba(0,59,92,0.05)]">
              {filteredProcesses.map((process) => {
                const group = groupedRows.find((item) => item.processId === process.process_id);
                const rows = group?.rows ?? [];

                return (
                  <details className="group" key={process.process_id}>
                    <summary className="grid cursor-pointer list-none gap-4 px-4 py-4 transition hover:bg-[#f6f9fb] xl:grid-cols-[minmax(460px,1fr)_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#d7e3ec] bg-[#eef8fb] text-sea transition group-open:border-sea group-open:bg-white">
                            <ChevronRight className="h-4 w-4 transition group-open:rotate-90" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="max-w-4xl text-base font-bold leading-6 text-navy">
                              {process.process_name}
                            </h3>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {process.definition ?? "Sin definición"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-slate-600">
                                Empresa dueña:{" "}
                                <strong className="font-semibold text-navy">
                                  {process.owner_company_name ?? process.company_name}
                                </strong>
                              </span>
                              <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-slate-600">
                                Operado por:{" "}
                                <strong className="font-semibold text-navy">
                                  {process.operating_company_name ?? process.company_name}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <TypedBadge type="criticality" value={process.criticality} />
                        <TypedBadge type="status" value={process.status} />
                        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-sm text-slate-600">
                          Etapas{" "}
                          <strong className="font-bold text-navy">{process.subprocess_count}</strong>
                        </span>
                        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-sm text-slate-600">
                          Roles{" "}
                          <strong className="font-bold text-navy">
                            {process.responsibility_count}
                          </strong>
                        </span>
                        <Link
                          className="inline-flex items-center gap-2 rounded-xl border border-[#d7e3ec] bg-white px-3 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef8fb] hover:text-sea"
                          href={`/procesos/${process.process_id}`}
                          title="Ver ficha"
                        >
                          <FileText className="h-4 w-4" />
                          Ver ficha
                        </Link>
                      </div>
                    </summary>

                    <div className="min-w-0 border-t border-[#d7e3ec] bg-[#fbfcfd] px-4 py-4">
                      {rows.length === 0 ? (
                        <p className="text-sm text-slate-600">Este proceso aún no tiene etapas.</p>
                      ) : (
                        <div className="min-w-0 border-l border-[#d7e3ec] pl-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
                            <Workflow className="h-4 w-4 text-sea" />
                            Vista rápida de etapas
                          </div>
                          <div className="grid min-w-0 gap-2">
                            {rows.map((row, rowIndex) => (
                              <div
                                className="grid min-w-0 gap-3 rounded-xl border border-[#d7e3ec] bg-white px-3 py-3 shadow-[0_1px_0_rgba(16,24,32,0.03)] md:grid-cols-[42px_minmax(220px,1.4fr)_minmax(160px,1fr)_92px] md:items-center"
                                key={row.subprocess_id}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d7e3ec] bg-[#eef8fb] text-sm font-bold text-sea">
                                  {row.sort_order ?? rowIndex + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="break-words font-bold text-navy">
                                    {row.subprocess_name}
                                  </p>
                                </div>
                                <div className="min-w-0 text-sm">
                                  <p className="text-slate-500">Rol dueño</p>
                                  <p className="mt-1 break-words font-medium text-navy">
                                    <TextValue value={row.owner_role_name} />
                                  </p>
                                </div>
                                <div className="text-sm">
                                  <p className="text-slate-500">Impacto</p>
                                  <p className="mt-1 font-bold text-navy">
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
      </Panel>
    </DashboardShell>
  );
}
