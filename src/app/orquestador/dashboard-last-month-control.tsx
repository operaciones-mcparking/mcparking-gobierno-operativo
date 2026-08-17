"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { dashboardLastMonthReadinessMessage, type DashboardLastMonthReadinessCode } from "@/lib/orquestador/dashboard-last-month";
import { JobLivenessPanel } from "./job-liveness-panel";

const DASHBOARD_EXPECTED_JOB_TYPE = "dashboard_actualizar_metricas";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

type CreatedJob = {
  id: string;
  job_type: string;
  status: string;
};

type DashboardMetricsResult = {
  dates_processed?: number | null;
  dry_run: boolean | null;
  duration_seconds: number | null;
  message: string | null;
  ok: boolean | null;
  periodo: "last-month" | null;
  returncode: number | null;
  rows_written?: number | null;
  timed_out: boolean | null;
};

type JobStatus = {
  attempts: number | null;
  dashboard_metrics_result?: DashboardMetricsResult | null;
  duration_seconds: number | null;
  error_message: string | null;
  finished_at: string | null;
  id: string;
  job_type: string;
  started_at: string | null;
  status: string;
  worker_id: string | null;
};

type JobsResponse = {
  jobs?: JobStatus[];
  ok?: boolean;
};

function abortError() {
  return new DOMException("Operacion cancelada.", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitUntilVisible(signal: AbortSignal) {
  if (document.visibilityState === "visible") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    function cleanup() {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      signal.removeEventListener("abort", onAbort);
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      cleanup();
      resolve();
    }

    function onAbort() {
      cleanup();
      reject(abortError());
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function statusLabel(status: string) {
  if (status === "queued") return "En cola";
  if (status === "claimed" || status === "running") return "Ejecutando";
  if (status === "succeeded") return "Listo";
  if (status === "failed") return "Fallido";
  if (status === "cancelled") return "Cancelado";
  return status;
}

export function DashboardLastMonthControl({ readinessCode }: { readinessCode: DashboardLastMonthReadinessCode }) {
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  async function pollJob(jobId: string, signal: AbortSignal) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await waitUntilVisible(signal);
      await delay(attempt === 0 ? 700 : 20_000, signal);
      await waitUntilVisible(signal);

      try {
        const response = await fetch("/api/orquestador/jobs", { cache: "no-store", signal });

        if (!response.ok) {
          if (isMountedRef.current) {
            setMessage("No fue posible consultar el estado de la actualizacion de metricas. Se reintentara automaticamente.");
          }
          continue;
        }

        const payload = (await response.json()) as JobsResponse;
        const nextJob = payload.jobs?.find((job) => job.id === jobId && job.job_type === DASHBOARD_EXPECTED_JOB_TYPE) ?? null;

        if (!nextJob) {
          continue;
        }

        if (isMountedRef.current) {
          setJobStatus(nextJob);
          setMessage(null);
        }

        if (terminalStatuses.has(nextJob.status)) {
          return;
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        if (isMountedRef.current) {
          setMessage("No fue posible consultar el estado de la actualizacion de metricas. Se reintentara automaticamente.");
        }
      }
    }

    if (isMountedRef.current) {
      setMessage("La actualizacion de metricas sigue pendiente. Este timeout visual no cancela el job; actualiza el estado mas tarde.");
    }
  }
  async function createDashboardJob() {
    if (isSubmitting || readinessCode !== "ready") {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setIsConfirming(false);
    setMessage(null);
    setCreatedJob(null);
    setJobStatus(null);

    try {
      const response = await fetch("/api/orquestador/dashboard/last-month", {
        body: JSON.stringify({ confirm: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(errorPayload?.error ?? "No fue posible iniciar la actualizacion de metricas.");
        return;
      }

      const payload = (await response.json()) as { job?: CreatedJob; ok?: boolean };
      if (!payload.ok || !payload.job || payload.job.job_type !== DASHBOARD_EXPECTED_JOB_TYPE) {
        setMessage("No fue posible iniciar la actualizacion de metricas.");
        return;
      }

      setCreatedJob(payload.job);
      setJobStatus({
        attempts: null,
        dashboard_metrics_result: null,
        duration_seconds: null,
        error_message: null,
        finished_at: null,
        id: payload.job.id,
        job_type: payload.job.job_type,
        started_at: null,
        status: payload.job.status,
        worker_id: null,
      });
      await pollJob(payload.job.id, controller.signal);
    } catch (error) {
      if (!isAbortError(error) && isMountedRef.current) {
        setMessage("No fue posible iniciar la actualizacion de metricas.");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  const result = jobStatus?.dashboard_metrics_result;
  const resultDuration = result?.duration_seconds ?? jobStatus?.duration_seconds ?? null;
  const resultMessage = result?.message ?? (result?.ok === true ? "Metricas actualizadas correctamente." : null);
  const isTerminalFailure = jobStatus?.status === "failed" || jobStatus?.status === "cancelled";
  const isRunning = isSubmitting && !jobStatus?.status.match(/^(succeeded|failed|cancelled)$/);
  const status = isRunning ? "Ejecutando" : jobStatus ? statusLabel(jobStatus.status) : dashboardLastMonthReadinessMessage(readinessCode);
  const canSubmit = readinessCode === "ready" && !isSubmitting;

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-lg border border-[#d6e1ea] bg-white p-3 text-sm text-slate-600 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-navy">Dashboard</p>
          <p className="mt-1 text-xs leading-5">Actualizar metricas ultimo mes</p>
          <p className="mt-1 text-xs font-medium text-[#8a4a00]">Ejecucion real</p>
        </div>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{status}</span>
      </div>

      <p className="text-xs leading-5 text-slate-600">
        Recalcula las metricas operacionales del ultimo mes usando los bancos locales del PC de operaciones y actualiza Supabase.
      </p>
      <p className="text-xs leading-5 text-slate-600">Este boton no actualiza previamente Reservas ni Packs.</p>

      <button
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canSubmit}
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        <BarChart3 className="h-4 w-4 text-sea" />
        {isRunning ? "Creando job..." : "Actualizar metricas"}
      </button>

      {createdJob || jobStatus || message ? (
        <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2 text-xs leading-5 text-slate-600">
          {createdJob ? <p>Job {shortId(createdJob.id)} creado para Dashboard.</p> : null}
          {jobStatus ? (
            <p>
              Estado: <span className="font-medium text-navy">{statusLabel(jobStatus.status)}</span>
              {jobStatus.worker_id ? ` / Worker: ${jobStatus.worker_id}` : ""}
              {jobStatus.attempts !== null ? ` / Intentos: ${jobStatus.attempts}` : ""}
              {jobStatus.duration_seconds !== null ? ` / Duracion: ${jobStatus.duration_seconds}s` : ""}
            </p>
          ) : null}
          {result && jobStatus?.status === "succeeded" ? (
            <div>
              <p>Resultado: {resultMessage ?? "Resultado operacional registrado."}</p>
              {result.dry_run === true ? <p>Dry-run: ejecucion real no realizada.</p> : null}
              {result.periodo ? <p>Periodo: {result.periodo}</p> : null}
              {resultDuration !== null ? <p>Duracion: {resultDuration}s</p> : null}
              {result.rows_written !== null && result.rows_written !== undefined ? <p>Filas escritas: {result.rows_written}</p> : null}
              {result.dates_processed !== null && result.dates_processed !== undefined ? <p>Fechas procesadas: {result.dates_processed}</p> : null}
              {result.returncode !== null ? <p>returncode: {result.returncode}</p> : null}
              {result.timed_out === true ? <p>Timeout reportado.</p> : null}
            </div>
          ) : null}
          {isTerminalFailure ? <p>No fue posible completar la actualizacion de metricas.</p> : null}
          {jobStatus?.error_message ? <p>{jobStatus.error_message}</p> : null}
          {message ? <p>{message}</p> : null}
        </div>
      ) : null}

      {jobStatus && !terminalStatuses.has(jobStatus.status) ? (
        <JobLivenessPanel allowActions={false} compact jobId={jobStatus.id} />
      ) : null}

      {isConfirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[#d6e1ea] bg-white p-4 shadow-lg">
            <h2 className="text-base font-medium text-navy">Confirmar actualizacion de metricas</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Esta operacion recalculara las metricas del ultimo mes en el PC de operaciones y actualizara los datos del dashboard en Supabase. No actualizara previamente Reservas ni Packs.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="inline-flex h-9 items-center rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-slate-600"
                disabled={isSubmitting}
                onClick={() => setIsConfirming(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-9 items-center rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={createDashboardJob}
                type="button"
              >
                Confirmar ejecucion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}