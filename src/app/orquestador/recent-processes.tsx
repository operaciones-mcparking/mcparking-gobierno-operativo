"use client";

import { ChevronRight, Loader2, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/components/dashboard/data-table";
import type { OrchestratorJob } from "@/lib/orquestador/types";
import { formatDurationHuman } from "./composite-run-viewer";
import { JobTechnicalDetailButton } from "./job-technical-detail-button";

type RecentProcessesProps = {
  hasMore: boolean;
  jobs: OrchestratorJob[];
};

type ProcessDateTimeValue = {
  date: string;
  time: string | null;
};

const processNames: Record<string, string> = {
  banco_packs_actualizar: "Actualizar Banco de Packs",
  banco_packs_actualizar_sin_consumos: "Actualizar Banco de Packs",
  banco_personas_actualizar: "Actualizar Banco de Personas",
  banco_reservas_actualizar: "Actualizar Banco de Reservas",
  dashboard_actualizar: "Actualizar Dashboard",
  dashboard_actualizar_metricas: "Actualizar metricas del Dashboard",
  healthcheck_supabase: "Probar conexion",
  healthcheck_worker: "Probar equipo",
  source_connection_check: "Probar conexion",
  worker_health_check: "Probar equipo",
};

const statusLabels: Record<string, string> = {
  cancelled: "Cancelado",
  claimed: "En ejecucion",
  failed: "Error",
  queued: "Pendiente",
  running: "En ejecucion",
  succeeded: "Completado",
  waiting: "Pendiente",
};

const processDateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "America/Santiago",
  year: "numeric",
});

function readableText(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function processName(jobType: string) {
  return processNames[jobType] ?? readableText(jobType);
}

function processStatusLabel(status: string) {
  return statusLabels[status.toLowerCase()] ?? "Estado no disponible";
}

function processStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "succeeded") return "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]";
  if (["queued", "claimed", "running", "waiting"].includes(normalized)) return "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]";
  if (normalized === "failed") return "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]";
  if (normalized === "cancelled") return "border-[#ffe699] bg-[#fffaf0] text-[#765900]";

  return "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600";
}

function workerLabel(workerId: string | null) {
  if (!workerId) return "Sin asignar";

  return workerId
    .replace(/[_-]+/g, " ")
    .replace(/\bpc\b/i, "PC")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bPc\b/g, "PC");
}

function formatAttempts(attempts: number | null, maxAttempts: number | null) {
  if (typeof attempts !== "number" || typeof maxAttempts !== "number") {
    return "No disponible";
  }

  return `${attempts}/${maxAttempts}`;
}

function formatProcessDateTime(value: string | null | undefined): ProcessDateTimeValue {
  if (!value) {
    return { date: "Sin registro", time: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: value, time: null };
  }

  const parts = processDateFormatter.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("day")}/${part("month")}/${part("year")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function processDuration(job: OrchestratorJob) {
  return job.duration_seconds === null ? "No disponible" : formatDurationHuman(job.duration_seconds).replace("Duracion no disponible", "No disponible");
}

function ProcessStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${processStatusTone(status)}`}>
      {processStatusLabel(status)}
    </span>
  );
}

function ProcessDateTime({ value }: { value: string | null | undefined }) {
  const formatted = formatProcessDateTime(value);

  return (
    <span className="grid gap-0.5 leading-5">
      <span className="whitespace-nowrap">{formatted.date}</span>
      {formatted.time ? <span className="whitespace-nowrap text-slate-500">{formatted.time}</span> : null}
    </span>
  );
}

function openDetailLabel(job: OrchestratorJob) {
  return `Abrir ficha tecnica de ${processName(job.job_type)}`;
}

function RecentProcessDesktopRow({ job, onOpen }: { job: OrchestratorJob; onOpen: (job: OrchestratorJob) => void }) {
  function onKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(job);
    }
  }

  return (
    <tr
      aria-label={openDetailLabel(job)}
      className="cursor-pointer transition odd:bg-white even:bg-[#fbfcfd] hover:bg-[#f3f9fc] focus-visible:bg-[#f3f9fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sea"
      onClick={() => onOpen(job)}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
    >
      <DataTableCell strong>{processName(job.job_type)}</DataTableCell>
      <DataTableCell>
        <ProcessStatusBadge status={job.status} />
      </DataTableCell>
      <DataTableCell>{workerLabel(job.worker_id)}</DataTableCell>
      <DataTableCell>{formatAttempts(job.attempts, job.max_attempts)}</DataTableCell>
      <DataTableCell>
        <ProcessDateTime value={job.created_at} />
      </DataTableCell>
      <DataTableCell>
        <ProcessDateTime value={job.started_at} />
      </DataTableCell>
      <DataTableCell>
        <ProcessDateTime value={job.finished_at} />
      </DataTableCell>
      <DataTableCell>
        {job.error_message ? <span className="line-clamp-2 break-words text-[#8a4a00]">{job.error_message}</span> : null}
      </DataTableCell>
      <DataTableCell align="center">
        <ChevronRight className="inline h-4 w-4 text-slate-400" aria-hidden="true" />
      </DataTableCell>
    </tr>
  );
}

function RecentProcessMobileCard({ job, onOpen }: { job: OrchestratorJob; onOpen: (job: OrchestratorJob) => void }) {
  return (
    <button
      aria-label={openDetailLabel(job)}
      className="w-full rounded-xl border border-[#d6e1ea] bg-white p-4 text-left shadow-sm transition hover:bg-[#f8fbfd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
      onClick={() => onOpen(job)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold text-navy">{processName(job.job_type)}</p>
          <p className="mt-1 text-xs text-slate-500">{workerLabel(job.worker_id)}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProcessStatusBadge status={job.status} />
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">
          Intentos {formatAttempts(job.attempts, job.max_attempts)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Inicio</dt>
          <dd className="mt-1 text-navy"><ProcessDateTime value={job.started_at} /></dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Duracion</dt>
          <dd className="mt-1 font-medium text-navy">{processDuration(job)}</dd>
        </div>
      </dl>

      {job.error_message ? <p className="mt-3 break-words text-sm text-[#8a4a00]">{job.error_message}</p> : null}
    </button>
  );
}

export function RecentProcesses({ hasMore, jobs }: RecentProcessesProps) {
  const [items, setItems] = useState(jobs);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [jobIdQuery, setJobIdQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [openToken, setOpenToken] = useState<string | null>(null);

  function openJob(job: OrchestratorJob) {
    setSelectedJobId(job.id);
    setOpenToken(`${job.id}:${Date.now()}`);
  }

  async function loadMore() {
    const cursor = items.at(-1);
    if (!cursor || !canLoadMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ beforeCreatedAt: cursor.created_at, beforeId: cursor.id });
      const response = await fetch("/api/orquestador/jobs/history?" + params.toString(), { cache: "no-store" });
      const body = await response.json() as { error?: string; hasMore?: boolean; jobs?: OrchestratorJob[]; ok?: boolean };
      if (!response.ok || !body.ok || !Array.isArray(body.jobs)) {
        setSearchMessage(body.error ?? "No fue posible cargar más procesos.");
        return;
      }

      const nextJobs = body.jobs;
      setItems((current) => {
        const ids = new Set(current.map((job) => job.id));
        return [...current, ...nextJobs.filter((job) => !ids.has(job.id))];
      });
      setCanLoadMore(body.hasMore === true);
      setSearchMessage(null);
    } catch {
      setSearchMessage("No fue posible cargar más procesos.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function searchJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jobId = jobIdQuery.trim();
    setIsSearching(true);
    setSearchMessage(null);
    try {
      const response = await fetch("/api/orquestador/jobs/history?jobId=" + encodeURIComponent(jobId), { cache: "no-store" });
      const body = await response.json() as { error?: string; job?: OrchestratorJob; ok?: boolean };
      if (!response.ok || !body.ok || !body.job) {
        setSearchMessage(response.status === 404 ? "No encontrado" : body.error ?? "No fue posible buscar el job.");
        return;
      }

      setItems((current) => current.some((job) => job.id === body.job?.id) ? current : [body.job as OrchestratorJob, ...current]);
      openJob(body.job);
    } catch {
      setSearchMessage("No fue posible buscar el job.");
    } finally {
      setIsSearching(false);
    }
  }
  return (
    <>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={searchJob}>
        <label className="grid flex-1 gap-1 text-xs font-medium text-slate-600">
          Buscar por Job ID
          <span className="flex h-10 items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 focus-within:border-sea">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" onChange={(event) => setJobIdQuery(event.target.value)} placeholder="UUID completo" type="text" value={jobIdQuery} />
          </span>
        </label>
        <button className="inline-flex h-10 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-4 text-sm font-medium text-navy disabled:opacity-60" disabled={isSearching || !jobIdQuery.trim()} type="submit">
          {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Buscar
        </button>
      </form>
      {searchMessage ? <p className="mt-2 text-sm text-[#8a4a00]" aria-live="polite">{searchMessage}</p> : null}

      <div className="mt-5 hidden lg:block">
        <DataTable minWidth="1040px">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Proceso</DataTableHeaderCell>
              <DataTableHeaderCell>Estado</DataTableHeaderCell>
              <DataTableHeaderCell>Equipo</DataTableHeaderCell>
              <DataTableHeaderCell>Intentos</DataTableHeaderCell>
              <DataTableHeaderCell>Creado</DataTableHeaderCell>
              <DataTableHeaderCell>Inicio</DataTableHeaderCell>
              <DataTableHeaderCell>Fin</DataTableHeaderCell>
              <DataTableHeaderCell>Error</DataTableHeaderCell>
              <DataTableHeaderCell align="center"><span className="sr-only">Abrir ficha tecnica</span></DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((job) => (
              <RecentProcessDesktopRow job={job} key={job.id} onOpen={openJob} />
            ))}
          </DataTableBody>
        </DataTable>
      </div>

      <div className="mt-5 grid gap-3 lg:hidden">
        {items.map((job) => (
          <RecentProcessMobileCard job={job} key={job.id} onOpen={openJob} />
        ))}
      </div>

            {items.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay procesos recientes.</p> : null}

      {canLoadMore ? (
        <div className="mt-4 flex justify-center">
          <button className="inline-flex h-10 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-4 text-sm font-medium text-navy disabled:opacity-60" disabled={isLoadingMore} onClick={loadMore} type="button">
            {isLoadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Cargar más
          </button>
        </div>
      ) : null}

      {selectedJobId ? <JobTechnicalDetailButton autoOpenKey={openToken} hideTrigger jobId={selectedJobId} /> : null}
    </>
  );
}
