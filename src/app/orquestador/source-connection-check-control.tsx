"use client";

import { DatabaseZap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CreatedJob = {
  createdAt: string;
  id: string;
  jobType: string;
  status: string;
};

type SourceConnectionResult = {
  ok: boolean;
  source_key: string | null;
  checked_at: string | null;
  duration_ms: number | null;
  read_only: boolean | null;
  worker_id: string | null;
};

type JobStatus = {
  id: string;
  job_type: string;
  source_connection_result?: SourceConnectionResult | null;
  status: string;
  worker_id: string | null;
};

type JobsResponse = {
  jobs?: JobStatus[];
  ok?: boolean;
};

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

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

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Sin registro";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin registro" : dateFormatter.format(date);
}

function statusLabel(status: string) {
  if (status === "queued") return "Disponible";
  if (status === "running") return "Comprobando conexion...";
  if (status === "succeeded") return "Completado";
  if (status === "failed" || status === "cancelled") return "No fue posible verificar la fuente restringida.";
  return status;
}

export function SourceConnectionCheckControl({ enabled }: { enabled: boolean }) {
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
      const nextJob = payload.jobs?.find((job) => job.id === jobId && job.job_type === "source_connection_check") ?? null;

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

  async function createSourceConnectionCheck() {
    if (isSubmitting || !enabled) {
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
      const response = await fetch("/api/orquestador/source-connection-check", {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        setMessage(response.status === 409 ? "La prueba de conexion esta deshabilitada." : "No fue posible crear la prueba de conexion.");
        return;
      }

      const payload = (await response.json()) as { job?: CreatedJob; ok?: boolean };
      if (!payload.ok || !payload.job) {
        setMessage("No fue posible crear la prueba de conexion.");
        return;
      }

      setCreatedJob(payload.job);
      setJobStatus({
        id: payload.job.id,
        job_type: payload.job.jobType,
        status: payload.job.status,
        worker_id: null,
      });
      await pollJob(payload.job.id, controller.signal);
    } catch (error) {
      if (!isAbortError(error) && isMountedRef.current) {
        setMessage("No fue posible crear la prueba de conexion.");
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

  const result = jobStatus?.source_connection_result;
  const isTerminalFailure = jobStatus?.status === "failed" || jobStatus?.status === "cancelled";
  const isRunning = isSubmitting && !jobStatus?.status.match(/^(succeeded|failed|cancelled)$/);
  const status = enabled ? (isRunning ? "Comprobando conexion..." : statusLabel(jobStatus?.status ?? "queued")) : "No disponible";

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-lg border border-[#d6e1ea] bg-white p-3 text-sm text-slate-600 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-navy">Probar conexion restringida</p>
          <p className="mt-1 text-xs leading-5">Comprueba una fuente restringida mediante el worker local.</p>
        </div>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{status}</span>
      </div>

      {!enabled ? <p className="text-xs leading-5 text-slate-600">La prueba esta registrada, pero deshabilitada por seguridad.</p> : null}

      <button
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!enabled || isSubmitting}
        onClick={createSourceConnectionCheck}
        type="button"
      >
        <DatabaseZap className="h-4 w-4 text-sea" />
        {isRunning ? "Comprobando..." : "Probar conexion"}
      </button>

      {createdJob || jobStatus || message ? (
        <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2 text-xs leading-5 text-slate-600">
          {jobStatus?.status === "succeeded" ? <p className="font-medium text-navy">Completado</p> : null}
          {result && jobStatus?.status === "succeeded" ? (
            <>
              <p>Worker: {result.worker_id ?? jobStatus.worker_id ?? "Sin registro"}</p>
              <p>Solo lectura confirmado: {result.read_only === true ? "Si" : "Sin registro"}</p>
              <p>Duracion: {result.duration_ms === null ? "Sin registro" : `${Math.round(result.duration_ms)} ms`}</p>
              <p>Fecha/hora de comprobacion: {formatDate(result.checked_at)}</p>
            </>
          ) : null}
          {isTerminalFailure ? <p>No fue posible verificar la fuente restringida.</p> : null}
          {message ? <p>{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}