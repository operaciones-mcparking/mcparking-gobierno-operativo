"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CompositeRunViewModel } from "@/lib/orquestador/composite-runs";

const storageKey = "orquestador:actualizar-datos:last-month:run-id:v1";
const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type RunResponse = {
  ok?: boolean;
  run?: CompositeRunViewModel;
};

type CompositeOperationsStatus =
  | "idle"
  | "loading"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "network_error"
  | "unauthorized"
  | "readiness_unavailable";

function isTerminalRun(run: CompositeRunViewModel | null) {
  return Boolean(run && terminalStatuses.has(run.status));
}

function statusFromRun(run: CompositeRunViewModel | null): CompositeOperationsStatus {
  if (!run) return "idle";
  if (run.status === "succeeded") return "completed";
  if (run.status === "failed") return "failed";
  if (run.status === "cancelled") return "cancelled";
  return "running";
}

function publicErrorMessage(status: number) {
  if (status === 401 || status === 403) {
    return "No tienes permisos para ejecutar esta operacion.";
  }

  if (status === 404) {
    return "No se encontro la ejecucion guardada.";
  }

  if (status === 409) {
    return "La operacion no esta disponible en este momento.";
  }

  return "No fue posible consultar la ejecucion.";
}

async function readSafeError(response: Response) {
  const fallback = publicErrorMessage(response.status);

  try {
    const responseBody = (await response.json()) as { error?: unknown };
    return typeof responseBody.error === "string" && responseBody.error.trim() ? responseBody.error : fallback;
  } catch {
    return fallback;
  }
}

export function useCompositeOperationsRun() {
  const [run, setRun] = useState<CompositeRunViewModel | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<CompositeOperationsStatus>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const isMountedRef = useRef(true);
  const getControllerRef = useRef<AbortController | null>(null);
  const advanceControllerRef = useRef<AbortController | null>(null);
  const isRefreshingRef = useRef(false);
  const isAdvancingRef = useRef(false);
  const shouldRetryRef = useRef(false);
  const retryDelayRef = useRef(2500);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const persistRunId = useCallback((runId: string) => {
    window.localStorage.setItem(storageKey, runId);
  }, []);

  const clearStoredRun = useCallback(() => {
    window.localStorage.removeItem(storageKey);
  }, []);

  const stopRequests = useCallback(() => {
    getControllerRef.current?.abort();
    advanceControllerRef.current?.abort();
    getControllerRef.current = null;
    advanceControllerRef.current = null;
    isRefreshingRef.current = false;
    isAdvancingRef.current = false;
    shouldRetryRef.current = false;
    clearTimer();
  }, [clearTimer]);

  const clearRun = useCallback(() => {
    stopRequests();
    clearStoredRun();
    setRun(null);
    setMessage(null);
    setStatus("idle");
    setIsStarting(false);
  }, [clearStoredRun, stopRequests]);

  const loadRun = useCallback(
    async (runId: string, options: { allowNotFoundReset?: boolean } = {}) => {
      if (!uuidPattern.test(runId) || isRefreshingRef.current) {
        return null;
      }

      isRefreshingRef.current = true;
      getControllerRef.current?.abort();
      const controller = new AbortController();
      getControllerRef.current = controller;

      try {
        const response = await fetch(`/api/orquestador/operaciones/actualizar-datos/${runId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 404) {
          shouldRetryRef.current = false;
          clearStoredRun();
          if (isMountedRef.current) {
            setRun(null);
            setStatus("idle");
            setMessage(options.allowNotFoundReset ? null : "No se encontro la ejecucion guardada.");
          }
          return null;
        }

        if (!response.ok) {
          shouldRetryRef.current = true;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
          const safeMessage = await readSafeError(response);
          if (isMountedRef.current) {
            setMessage(safeMessage);
            setStatus(response.status === 401 || response.status === 403 ? "unauthorized" : "network_error");
          }
          return null;
        }

        const responseBody = (await response.json()) as RunResponse;
        if (!responseBody.ok || !responseBody.run) {
          shouldRetryRef.current = true;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
          if (isMountedRef.current) {
            setMessage("No fue posible consultar la ejecucion.");
            setStatus("network_error");
          }
          return null;
        }

        if (isMountedRef.current) {
          setRun(responseBody.run);
          setStatus(statusFromRun(responseBody.run));
          setMessage(null);
        }
        shouldRetryRef.current = false;
        retryDelayRef.current = 2500;
        return responseBody.run;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          shouldRetryRef.current = false;
          return null;
        }

        shouldRetryRef.current = true;
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
        if (isMountedRef.current) {
          setMessage("No fue posible consultar la ejecucion.");
          setStatus("network_error");
        }
        return null;
      } finally {
        if (getControllerRef.current === controller) {
          getControllerRef.current = null;
        }
        isRefreshingRef.current = false;
      }
    },
    [clearStoredRun],
  );

  const advanceRun = useCallback(async (runId: string) => {
    if (!uuidPattern.test(runId) || isAdvancingRef.current) {
      return null;
    }

    isAdvancingRef.current = true;
    advanceControllerRef.current?.abort();
    const controller = new AbortController();
    advanceControllerRef.current = controller;

    try {
      const response = await fetch("/api/orquestador/operaciones/actualizar-datos/advance", {
        body: JSON.stringify({ run_id: runId }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const safeMessage = await readSafeError(response);
        if (isMountedRef.current) {
          setMessage(safeMessage);
          setStatus(response.status === 401 || response.status === 403 ? "unauthorized" : "readiness_unavailable");
        }
        return null;
      }

      const responseBody = (await response.json()) as RunResponse;
      if (!responseBody.ok || !responseBody.run) {
        if (isMountedRef.current) {
          setMessage("No fue posible avanzar la ejecucion.");
          setStatus("network_error");
        }
        return null;
      }

      if (isMountedRef.current) {
        setRun(responseBody.run);
        setStatus(statusFromRun(responseBody.run));
        setMessage(null);
      }
      return responseBody.run;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && isMountedRef.current) {
        setMessage("No fue posible avanzar la ejecucion.");
        setStatus("network_error");
      }
      return null;
    } finally {
      if (advanceControllerRef.current === controller) {
        advanceControllerRef.current = null;
      }
      isAdvancingRef.current = false;
    }
  }, []);

  const scheduleNext = useCallback(
    (runId: string, delayMs: number) => {
      clearTimer();
      timeoutRef.current = window.setTimeout(async () => {
        if (document.visibilityState !== "visible") {
          scheduleNext(runId, retryDelayRef.current);
          return;
        }

        const nextRun = await loadRun(runId);

        if (!nextRun) {
          if (shouldRetryRef.current) {
            scheduleNext(runId, retryDelayRef.current);
          }
          return;
        }

        if (isTerminalRun(nextRun)) {
          return;
        }

        await advanceRun(nextRun.run_id);
        scheduleNext(nextRun.run_id, retryDelayRef.current);
      }, delayMs);
    },
    [advanceRun, clearTimer, loadRun],
  );

  useEffect(() => {
    isMountedRef.current = true;

    const storedRunId = window.localStorage.getItem(storageKey);
    if (storedRunId && uuidPattern.test(storedRunId)) {
      setStatus("loading");
      void loadRun(storedRunId, { allowNotFoundReset: true }).then((loadedRun) => {
        if (loadedRun && !isTerminalRun(loadedRun)) {
          scheduleNext(loadedRun.run_id, 1000);
        }
      });
    } else if (storedRunId) {
      clearStoredRun();
    }

    return () => {
      isMountedRef.current = false;
      stopRequests();
    };
  }, [clearStoredRun, loadRun, scheduleNext, stopRequests]);

  useEffect(() => {
    if (!run || isTerminalRun(run)) {
      clearTimer();
      return;
    }

    scheduleNext(run.run_id, 2500);
  }, [clearTimer, run, scheduleNext]);

  const startRun = useCallback(async () => {
    if (isStarting || (run && !isTerminalRun(run))) {
      return false;
    }

    stopRequests();
    setIsStarting(true);
    setStatus("starting");
    setMessage(null);

    const controller = new AbortController();
    getControllerRef.current = controller;

    try {
      const response = await fetch("/api/orquestador/operaciones/actualizar-datos", {
        body: JSON.stringify({ confirm: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const safeMessage = await readSafeError(response);
        if (isMountedRef.current) {
          setMessage(safeMessage);
          setStatus(response.status === 401 || response.status === 403 ? "unauthorized" : "readiness_unavailable");
        }
        return false;
      }

      const responseBody = (await response.json()) as RunResponse;
      if (!responseBody.ok || !responseBody.run || !uuidPattern.test(responseBody.run.run_id)) {
        if (isMountedRef.current) {
          setMessage("No fue posible iniciar la ejecucion.");
          setStatus("network_error");
        }
        return false;
      }

      persistRunId(responseBody.run.run_id);
      if (isMountedRef.current) {
        setRun(responseBody.run);
        setStatus(statusFromRun(responseBody.run));
      }
      scheduleNext(responseBody.run.run_id, 1000);
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && isMountedRef.current) {
        setMessage("No fue posible iniciar la ejecucion.");
        setStatus("network_error");
      }
      return false;
    } finally {
      if (getControllerRef.current === controller) {
        getControllerRef.current = null;
      }

      if (isMountedRef.current) {
        setIsStarting(false);
      }
    }
  }, [isStarting, persistRunId, run, scheduleNext, stopRequests]);

  return {
    clearRun,
    isStarting,
    message,
    run,
    startRun,
    status,
  };
}

export const compositeOperationsRunStorageKey = storageKey;
