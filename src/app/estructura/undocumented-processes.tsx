import Link from "next/link";

import type { ProcessCatalogV2Item } from "@/lib/dashboard/data";

function processDate(process: ProcessCatalogV2Item) {
  const value = process.master_updated_at ?? process.updated_at ?? process.created_at;
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago" }).format(date);
}

export function UndocumentedProcesses({ processes }: { processes: ProcessCatalogV2Item[] }) {
  if (processes.length === 0) return null;

  return (
    <details className="group/undocumented mt-7 border-t border-line pt-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-md px-1 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sea focus-visible:ring-offset-2">
        <div>
          <h3 className="text-sm font-semibold text-navy">Pendientes de documentar ({processes.length})</h3>
          <p className="mt-1 text-sm text-slate-600">Procesos anteriores que todavía no han sido incorporados al nuevo modelo documental.</p>
        </div>
        <span className="text-sm font-semibold text-sea">
          <span className="group-open/undocumented:hidden">Ver procesos</span>
          <span className="hidden group-open/undocumented:inline">Ocultar</span>
        </span>
      </summary>
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white">
        {processes.map((process) => (
          <div className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[minmax(220px,1.5fr)_minmax(130px,0.8fr)_minmax(150px,1fr)_90px_120px_auto] md:items-center" key={process.process_id}>
            <div><p className="font-semibold text-navy">{process.process_name}</p><span className="mt-1 inline-flex rounded-full border border-[#d6e1ea] bg-[#f8fafb] px-2 py-0.5 text-xs font-semibold text-slate-600">Sin documentar</span></div>
            <div><p className="text-xs text-slate-500">Empresa</p><p className="text-sm text-navy">{process.owner_company_name ?? process.company_name}</p></div>
            <div><p className="text-xs text-slate-500">Rol dueño</p><p className="text-sm text-navy">{process.owner_role_name ?? process.owner_role_names[0] ?? "Sin rol dueño"}</p></div>
            <div><p className="text-xs text-slate-500">Etapas</p><p className="text-sm font-semibold text-navy">{process.active_stage_count}</p></div>
            <div><p className="text-xs text-slate-500">Última edición</p><p className="text-sm text-navy">{processDate(process)}</p></div>
            <div className="md:justify-self-end"><Link className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef7fb]" href={`/procesos/${process.process_id}`}>Ver</Link></div>
          </div>
        ))}
      </div>
    </details>
  );
}