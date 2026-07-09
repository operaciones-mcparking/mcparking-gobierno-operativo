import { ValueBadge } from "@/components/dashboard/badge";
import type { ProcessCatalogItem } from "@/lib/dashboard/data";
import { processMapCopy, processMapGroups } from "./process-map-config";

function groupToneClass(tone: "info" | "success" | "warning") {
  if (tone === "success") {
    return "border-[#80c4af] bg-[#effaf5] shadow-[0_10px_24px_rgba(8,128,94,0.08)]";
  }

  if (tone === "warning") {
    return "border-[#ead6b4] bg-[#fffaf0]";
  }

  return "border-[#cfe2ee] bg-[#f4f9fc]";
}

function ProcessNode({
  compact = false,
  process,
}: {
  compact?: boolean;
  process: ProcessCatalogItem;
}) {
  return (
    <div
      className={`rounded-md border border-[#dce7ef] bg-white shadow-[0_3px_8px_rgba(2,53,116,0.025)] ${
        compact ? "px-2.5 py-1.5" : "px-2.5 py-2"
      }`}
    >
      <p className={compact ? "text-xs font-medium leading-4 text-navy" : "text-sm font-medium leading-5 text-navy"}>
        {process.process_name}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{process.area_name ?? "Sin área"}</p>
    </div>
  );
}

function ProcessLayer({
  group,
  processes,
}: {
  group: (typeof processMapGroups)[number];
  processes: ProcessCatalogItem[];
}) {
  const isOperational = group.value === "operational";

  return (
    <article
      className={`relative z-10 rounded-xl border ${
        isOperational ? "p-4 ring-1 ring-[#a9dccd]" : "p-3"
      } ${groupToneClass(group.tone)}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className={isOperational ? "text-base font-semibold text-navy" : "text-sm font-semibold text-navy"}>
            {group.label}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">{group.description}</p>
        </div>
        <ValueBadge tone={group.tone}>{processes.length}</ValueBadge>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {processes.length > 0 ? (
          processes.map((process) => (
            <ProcessNode key={process.process_id} compact={!isOperational} process={process} />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-[#d6e1ea] bg-white/50 px-3 py-2 text-xs text-slate-500">
            No hay procesos en este grupo.
          </div>
        )}
      </div>
    </article>
  );
}

function SideBlock({
  eyebrow,
  text,
  title,
}: {
  eyebrow: string;
  text: string;
  title: string;
}) {
  return (
    <div className="relative z-10 rounded-xl border border-[#dce7ef] bg-white px-3 py-3 shadow-[0_3px_10px_rgba(2,53,116,0.025)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</p>
      <h3 className="mt-2 text-sm font-semibold text-navy">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{text}</p>
    </div>
  );
}

export function ProcessMacroMap({ processes }: { processes: ProcessCatalogItem[] }) {
  const groups = processMapGroups.map((group) => ({
    ...group,
    processes: processes.filter((process) => process.process_type === group.value),
  }));
  const strategic = groups.find((group) => group.value === "strategic") ?? groups[0];
  const operational = groups.find((group) => group.value === "operational") ?? groups[1];
  const support = groups.find((group) => group.value === "support") ?? groups[2];

  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-5 shadow-[0_8px_18px_rgba(2,53,116,0.03)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">{processMapCopy.title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{processMapCopy.subtitle}</p>
        </div>
        <ValueBadge tone="neutral">{processes.length} procesos</ValueBadge>
      </div>

      <div className="relative mt-3 rounded-2xl border border-line bg-[#fbfdfe] p-3">
        <div className="relative z-10 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center lg:gap-x-6">
          <div className="order-1 lg:col-start-1">
            <SideBlock
              eyebrow="Entrada"
              text={processMapCopy.input.description}
              title={processMapCopy.input.title}
            />
          </div>

          <div className="order-2 flex flex-col gap-4 lg:col-start-2">
            <ProcessLayer group={strategic} processes={strategic.processes} />
            <ProcessLayer group={operational} processes={operational.processes} />
            <ProcessLayer group={support} processes={support.processes} />
          </div>

          <div className="order-3 lg:col-start-3">
            <SideBlock
              eyebrow="Salida"
              text={processMapCopy.output.description}
              title={processMapCopy.output.title}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
