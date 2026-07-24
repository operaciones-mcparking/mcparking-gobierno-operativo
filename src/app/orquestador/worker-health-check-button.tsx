"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CreatedJob = {
  createdAt: string;
  id: string;
  jobType: string;
  status: string;
};

type HealthCheckResult = {
  ok: boolean;
  worker_id: string | null;
  checked_at: string | null;
  dry_run: boolean | null;
  real_execution_allowed: boolean | null;
};

type JobStatus = {
  error_message: string | null;
  health_check_result?: HealthCheckResult | null;
  id: string;
  job_type: string;
  status: string;
  worker_id: string | null;
};

type JobsResponse = {
  jobs?: JobStatus[];
  ok?: boolean;
};

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

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
  if (status === "running") return "En ejecucion";
  if (status === "succeeded") return "Completado";
  if (status === "failed") return "Fallido";
  if (status === "cancelled") return "Cancelado";
  return status;
}

export function WorkerHealthCheckButton() {
  const [createdJob, setCreatedJob] = useState<CreatedJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await waitUntilVisible(signal);
      await delay(attempt === 0 ? 700 : 2000, signal);
      await waitUntilVisible(signal);

      const response = await fetch("/api/orquestador/jobs", { cache: "no-store", signal });

      if (!response.ok) {
        if (isMountedRef.current) {
          setMessage("No fue posible consultar el estado de la prueba.");
        }
        return;
      }

      const payload = (await response.json()) as JobsResponse;
      const nextJob = payload.jobs?.find((job) => job.id === jobId) ?? null;

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
      setMessage("La prueba sigue pendiente. Actualiza el estado en unos segundos.");
    }
  }

  async function createHealthCheck() {
    if (isSubmitting) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setMessage(null);
    setCreatedJob(null);
    setJobStatus(null);

    try {
      const response = await fetch("/api/orquestador/health-check", {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        setMessage("No fue posible crear la prueba del worker.");
        return;
      }

      const payload = (await response.json()) as { job?: CreatedJob; ok?: boolean };
      if (!payload.ok || !payload.job) {
        setMessage("No fue posible crear la prueba del worker.");
        return;
      }

      setCreatedJob(payload.job);
      setJobStatus({
        error_message: null,
        id: payload.job.id,
        job_type: payload.job.jobType,
        status: payload.job.status,
        worker_id: null,
      });
      await pollJob(payload.job.id, controller.signal);
    } catch (error) {
      if (!isAbortError(error) && isMountedRef.current) {
        setMessage("No fue posible crear la prueba del worker.");
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

  const result = jobStatus?.health_check_result;
  const isRunning = isSubmitting && !jobStatus?.status.match(/^(succeeded|failed|cancelled)$/);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        onClick={createHealthCheck}
        type="button"
      >
        <FlaskConical className="h-4 w-4 text-sea" />
        {isRunning ? "Probando..." : "Probar worker"}
      </button>

      {createdJob || jobStatus || message ? (
        <div className="max-w-md rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2 text-xs leading-5 text-slate-600">
          {createdJob ? <p>Job {shortId(createdJob.id)} creado para health check.</p> : null}
          {jobStatus ? (
            <p>
              Estado: <span className="font-medium text-navy">{statusLabel(jobStatus.status)}</span>
              {jobStatus.worker_id ? ` / Worker: ${jobStatus.worker_id}` : ""}
            </p>
          ) : null}
          {result ? (
            <p>
              Resultado: {result.ok ? "OK" : "Error"} / dry-run {result.dry_run === true ? "activo" : "no reportado"} / ejecucion real {result.real_execution_allowed === false ? "bloqueada" : "no reportada"}
            </p>
          ) : null}
          {jobStatus?.error_message ? <p>{jobStatus.error_message}</p> : null}
          {message ? <p>{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}