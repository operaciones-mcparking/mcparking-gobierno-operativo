"use client";

import { PackageCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { bancoPacksReadinessMessage, type BancoPacksUpdateReadinessCode } from "@/lib/orquestador/banco-packs-actualizar-packs";

const BANCO_PACKS_EXPECTED_JOB_TYPE = "banco_packs_actualizar_sin_consumos";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

type CreatedJob = {
  id: string;
  job_type: string;
  status: string;
};

type BancoPacksResult = {
  action: "actualizar-packs" | null;
  dry_run: boolean | null;
  duration_seconds: number | null;
  message: string | null;
  ok: boolean | null;
  returncode: number | null;
  timed_out: boolean | null;
  rows_total?: number | null;
  rows_inserted?: number | null;
  rows_updated?: number | null;
  rows_unchanged?: number | null;
};

type JobStatus = {
  attempts: number | null;
  banco_packs_update_result?: BancoPacksResult | null;
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
  if (status === "succeeded") return "Completado";
  if (status === "failed") return "Fallo";
  if (status === "cancelled") return "Cancelado";
  return status;
}

export function BancoPacksUpdateControl({ readinessCode }: { readinessCode: BancoPacksUpdateReadinessCode }) {
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  async function pollJob(jobId: string, signal: AbortSignal) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await waitUntilVisible(signal);
      await delay(attempt === 0 ? 700 : 30000, signal);
      await waitUntilVisible(signal);

      const response = await fetch("/api/orquestador/jobs", { cache: "no-store", signal });

      if (!response.ok) {
        if (isMountedRef.current) {
          setMessage("No fue posible consultar el estado de la actualizacion de packs.");
        }
        return;
      }

      const payload = (await response.json()) as JobsResponse;
      const nextJob = payload.jobs?.find((job) => job.id === jobId && job.job_type === BANCO_PACKS_EXPECTED_JOB_TYPE) ?? null;

      if (!nextJob) {
        continue;
      }

      if (isMountedRef.current) {
        setJobStatus(nextJob);
      }

      if (terminalStatuses.has(nextJob.status)) {
        if (isMountedRef.current) {
          setMessage(null);
        }
        return;
      }
    }

    if (isMountedRef.current) {
      setMessage("La actualizacion de packs sigue pendiente. Este timeout visual no cancela el job; actualiza el estado mas tarde.");
    }
  }

  async function createBancoPacksJob() {
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
      const response = await fetch("/api/orquestador/banco-packs/actualizar-packs", {
        body: JSON.stringify({ confirm: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(errorPayload?.error ?? "No fue posible iniciar la actualizacion de packs.");
        return;
      }

      const payload = (await response.json()) as { job?: CreatedJob; ok?: boolean };
      if (!payload.ok || !payload.job || payload.job.job_type !== BANCO_PACKS_EXPECTED_JOB_TYPE) {
        setMessage("No fue posible iniciar la actualizacion de packs.");
        return;
      }

      setCreatedJob(payload.job);
      setJobStatus({
        attempts: null,
        banco_packs_update_result: null,
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
        setMessage("No fue posible iniciar la actualizacion de packs.");
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

  const result = jobStatus?.banco_packs_update_result;
  const resultDuration = result?.duration_seconds ?? jobStatus?.duration_seconds ?? null;
  const resultMessage = result?.dry_run === true ? "Dry-run completado correctamente" : result?.message;
  const isTerminalFailure = jobStatus?.status === "failed" || jobStatus?.status === "cancelled";
  const isRunning = isSubmitting && !jobStatus?.status.match(/^(succeeded|failed|cancelled)$/);
  const status = isRunning ? "Ejecutando" : jobStatus ? statusLabel(jobStatus.status) : bancoPacksReadinessMessage(readinessCode);
  const canSubmit = readinessCode === "ready" && !isSubmitting;

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-lg border border-[#d6e1ea] bg-white p-3 text-sm text-slate-600 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-navy">Banco de Packs</p>
          <p className="mt-1 text-xs leading-5">Actualizar Packs</p>
          <p className="mt-1 text-xs font-medium text-[#8a4a00]">Ejecucion real</p>
        </div>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{status}</span>
      </div>

      <p className="text-xs leading-5 text-slate-600">Actualiza packs sin consumos ni saldos.</p>
      <p className="text-xs leading-5 text-slate-600">
        La ejecucion solo puede iniciarse cuando no existen otros jobs activos en el orquestador.
      </p>

      <button
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canSubmit}
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        <PackageCheck className="h-4 w-4 text-sea" />
        {isRunning ? "Creando job..." : "Actualizar Packs"}
      </button>

      {createdJob || jobStatus || message ? (
        <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2 text-xs leading-5 text-slate-600">
          {createdJob ? <p>Job {shortId(createdJob.id)} creado para Banco de Packs.</p> : null}
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
              {result.dry_run === true ? <p>Dry-run: comando real no ejecutado.</p> : null}
              {result.action ? <p>Accion: {result.action}</p> : null}
              {resultDuration !== null ? <p>Duracion: {resultDuration}s</p> : null}
              {result.returncode !== null ? <p>returncode: {result.returncode}</p> : null}
              {result.timed_out === true ? <p>Timeout reportado.</p> : null}
            </div>
          ) : null}
          {isTerminalFailure ? <p>No fue posible completar la actualizacion de packs.</p> : null}
          {jobStatus?.error_message ? <p>{jobStatus.error_message}</p> : null}
          {message ? <p>{message}</p> : null}
        </div>
      ) : null}

      {isConfirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[#d6e1ea] bg-white p-4 shadow-lg">
            <h2 className="text-base font-medium text-navy">Confirmar actualizacion de packs</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Esta operacion actualizara el banco local de packs en el PC de operaciones. No recalculara consumos ni saldos.
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
                onClick={createBancoPacksJob}
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