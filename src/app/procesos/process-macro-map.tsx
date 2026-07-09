import { ValueBadge } from "@/components/dashboard/badge";
import type { ProcessCatalogItem } from "@/lib/dashboard/data";
import { processMapCopy, processMapGroups } from "./process-map-config";

export function ProcessMacroMap({ processes }: { processes: ProcessCatalogItem[] }) {
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-5 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">{processMapCopy.title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{processMapCopy.subtitle}</p>
        </div>
        <ValueBadge tone="neutral">{processes.length} procesos</ValueBadge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-[#dce7ef] bg-[#f8fafb] px-4 py-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h3 className="text-sm font-semibold text-navy">{processMapCopy.input.title}</h3>
            <p className="text-sm leading-5 text-slate-600">
              {processMapCopy.input.description}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-[#fbfdfe] p-3">
          <div className="space-y-3">
            {processMapGroups.map((group) => {
              const groupProcesses = processes.filter(
                (process) => process.process_type === group.value,
              );

              return (
                <article
                  className="grid gap-4 rounded-lg border border-[#dce7ef] bg-white p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start"
                  key={group.value}
                >
                  <div className="flex items-start justify-between gap-3 lg:block">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">{group.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{group.description}</p>
                    </div>
                    <div className="lg:mt-3">
                      <ValueBadge tone={group.tone}>{groupProcesses.length}</ValueBadge>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {groupProcesses.length > 0 ? (
                      groupProcesses.slice(0, 6).map((process) => (
                        <div
                          className="rounded-md border border-[#dce7ef] bg-[#f8fafb] px-3 py-2"
                          key={process.process_id}
                        >
                          <p className="line-clamp-2 text-sm font-medium text-navy">
                            {process.process_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {process.area_name ?? "Sin área"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-[#cbd8e3] bg-[#f8fafb] px-3 py-3 text-sm text-slate-600">
                        No hay procesos en este grupo.
                      </div>
                    )}

                    {groupProcesses.length > 6 ? (
                      <p className="self-center text-xs font-medium text-slate-500">
                        +{groupProcesses.length - 6} procesos más en el listado.
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[#dce7ef] bg-[#f8fafb] px-4 py-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h3 className="text-sm font-semibold text-navy">{processMapCopy.output.title}</h3>
            <p className="text-sm leading-5 text-slate-600">
              {processMapCopy.output.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
