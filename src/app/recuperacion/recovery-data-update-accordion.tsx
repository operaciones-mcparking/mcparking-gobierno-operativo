"use client";

import { ChevronDown, DatabaseZap, ExternalLink } from "lucide-react";
import { useState } from "react";

import type { RecoveryDataUpdateStatus } from "@/lib/recuperacion/recovery-data-updates";

const RECOVERY_TIME_ZONE = "America/Santiago";

function formatDate(value: string | null) {
  if (!value) return "Sin información";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: RECOVERY_TIME_ZONE,
  }).format(new Date(value));
}

function ProcessRow({ process }: { process: RecoveryDataUpdateStatus }) {
  return (
    <li className="grid gap-3 border-t border-[#edf2f6] px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_10rem_12rem_auto] md:items-center">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-navy">{process.name}</h3>
        <p className="mt-0.5 text-sm leading-5 text-slate-600">{process.description}</p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase text-slate-500">Frecuencia</p>
        <p className="mt-0.5 text-sm text-slate-700">{process.schedule}</p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase text-slate-500">Última actualización conocida</p>
        <p className="mt-0.5 text-sm text-slate-700">{formatDate(process.lastObservedAt)}</p>
      </div>
      <div className="md:justify-self-end">
        <a
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sea transition hover:text-navy hover:underline"
          href={process.workflowUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Abrir en n8n
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </li>
  );
}

export function RecoveryDataUpdateAccordion({ processes }: { processes: RecoveryDataUpdateStatus[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#fbfdfe]"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d6e1ea] bg-[#f3f8fb] text-sea">
            <DatabaseZap className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-medium tracking-tight text-navy">Actualización de datos</h2>
            <p className="mt-1 text-sm text-slate-600">Control manual y seguimiento de sincronizaciones.</p>
          </div>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d6e1ea] bg-white text-navy transition">
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>

      {isOpen ? (
        <ul className="border-t border-[#edf2f6]">
          {processes.map((process) => <ProcessRow key={process.workflowUrl} process={process} />)}
        </ul>
      ) : null}
    </section>
  );
}
