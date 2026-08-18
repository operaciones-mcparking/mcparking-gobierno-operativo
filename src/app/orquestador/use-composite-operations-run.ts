"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CompositeRunViewModel } from "@/lib/orquestador/composite-runs";

const storageKey = "orquestador:actualizar-datos:last-month:run-id:v1";
const discoveryPollDelayMs = 5000;
const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunResponse = {
  ok?: boolean;
  run?: CompositeRunViewModel;
};

type ActiveRunResponse = RunResponse & {
  active?: boolean;
};

type StartConflictResponse = RunResponse & {
  activeRunId?: unknown;
  code?: unknown;
};

const runStatuses = new Set(["ready", "running", "waiting", "succeeded", "failed", "cancelled"]);

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

function isValidUuid(value: string) {
  return uuidPattern.test(value);
}

function normalizeStoredRunId(value: string) {
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return isValidUuid(unquoted) ? unquoted : null;
}

function isCompositeRunViewModel(value: unknown): value is CompositeRunViewModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<CompositeRunViewModel>;
  return (
    typeof candidate.run_id === "string" &&
    isValidUuid(candidate.run_id) &&
    typeof candidate.status === "string" &&
    runStatuses.has(candidate.status) &&
    Array.isArray(candidate.steps)
  );
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
  const isRefreshingRef = useRef(false);
  const isDiscoveringActiveRef = useRef(false);
  const recoveryStartedRef = useRef(false);
  const shouldRetryRef = useRef(false);
  const discoveryTimeoutRef = useRef<number | null>(null);
  const retryDelayRef = useRef(2500);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearDiscoveryTimer = useCallback(() => {
    if (discoveryTimeoutRef.current !== null) {
      window.clearTimeout(discoveryTimeoutRef.current);
      discoveryTimeoutRef.current = null;
    }
  }, []);

  const persistRunId = useCallback((runId: string) => {
    window.localStorage.setItem(storageKey, runId);
  }, []);

  const clearStoredRun = useCallback((_reason: "global_active_empty" | "invalid_stored_run_id" | "recovery_404" | "terminal_run" | "user_close_result") => {
    window.localStorage.removeItem(storageKey);
  }, []);

  const stopRequests = useCallback(
    (_reason: string) => {
      getControllerRef.current?.abort();
      getControllerRef.current = null;
      isRefreshingRef.current = false;
      isDiscoveringActiveRef.current = false;
      shouldRetryRef.current = false;
      clearDiscoveryTimer();
      clearTimer();
    },
    [clearDiscoveryTimer, clearTimer],
  );

  const clearRun = useCallback(() => {
    stopRequests("user_close_result");
    clearStoredRun("user_close_result");
    setRun(null);
    setMessage(null);
    setStatus("idle");
    setIsStarting(false);
  }, [clearStoredRun, stopRequests]);

  const loadRun = useCallback(
    async (runId: string, options: { allowNotFoundReset?: boolean } = {}) => {
      if (!isValidUuid(runId) || isRefreshingRef.current) {
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

        if (response.status === 404 && options.allowNotFoundReset) {
          shouldRetryRef.current = false;
          clearStoredRun("recovery_404");
          if (isMountedRef.current) {
            setRun(null);
            setStatus("idle");
            setMessage(null);
          }
          return null;
        }

        if (response.status === 404) {
          shouldRetryRef.current = true;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
          if (isMountedRef.current) {
            setMessage("No fue posible consultar la ejecucion.");
            setStatus("network_error");
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
        if (!responseBody.ok || !isCompositeRunViewModel(responseBody.run)) {
          shouldRetryRef.current = true;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
          if (isMountedRef.current) {
            setMessage("No fue posible consultar la ejecucion.");
            setStatus("network_error");
          }
          return null;
        }

        persistRunId(responseBody.run.run_id);
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
    [clearStoredRun, persistRunId],
  );

  const loadActiveRun = useCallback(async (options: { silent?: boolean } = {}) => {
    if (isDiscoveringActiveRef.current) {
      return null;
    }

    isDiscoveringActiveRef.current = true;
    getControllerRef.current?.abort();
    const controller = new AbortController();
    getControllerRef.current = controller;

    try {
      const response = await fetch("/api/orquestador/operaciones/actualizar-datos/active", {
        cache: "no-store",
        signal: controller.signal,
      });


      if (!response.ok) {
        const safeMessage = await readSafeError(response);
        if (!options.silent && isMountedRef.current) {
          setMessage(safeMessage);
          setStatus(response.status === 401 || response.status === 403 ? "unauthorized" : "network_error");
        }
        return null;
      }

      const responseBody = (await response.json()) as ActiveRunResponse;
      if (!responseBody.ok) {
        if (!options.silent && isMountedRef.current) {
          setMessage("No fue posible consultar la actualizacion operacional activa.");
          setStatus("network_error");
        }
        return null;
      }

      if (!responseBody.active) {
        clearStoredRun("global_active_empty");
        if (!options.silent && isMountedRef.current) {
          setRun(null);
          setStatus("idle");
          setMessage(null);
        }
        return null;
      }

      if (!isCompositeRunViewModel(responseBody.run)) {
        if (!options.silent && isMountedRef.current) {
          setMessage("No fue posible consultar la actualizacion operacional activa.");
          setStatus("network_error");
        }
        return null;
      }

      persistRunId(responseBody.run.run_id);
      if (isMountedRef.current) {
        setRun(responseBody.run);
        setStatus(statusFromRun(responseBody.run));
        setMessage(null);
      }
      return responseBody.run;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }

      if (!options.silent && isMountedRef.current) {
        setMessage("No fue posible consultar la actualizacion operacional activa.");
        setStatus("network_error");
      }
      return null;
    } finally {
      if (getControllerRef.current === controller) {
        getControllerRef.current = null;
      }
      isDiscoveringActiveRef.current = false;
    }
  }, [clearStoredRun, persistRunId]);

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

        scheduleNext(nextRun.run_id, retryDelayRef.current);
      }, delayMs);
    },
    [clearTimer, loadRun],
  );
  const scheduleActiveDiscovery = useCallback(
    (delayMs: number = discoveryPollDelayMs) => {
      clearDiscoveryTimer();
      discoveryTimeoutRef.current = window.setTimeout(async () => {
        if (document.visibilityState !== "visible") {
          scheduleActiveDiscovery(discoveryPollDelayMs);
          return;
        }

        const activeRun = await loadActiveRun({ silent: true });

        if (activeRun && !isTerminalRun(activeRun)) {
          clearDiscoveryTimer();
          scheduleNext(activeRun.run_id, 1000);
          return;
        }

        if (activeRun && isTerminalRun(activeRun)) {
          clearStoredRun("terminal_run");
        }

        scheduleActiveDiscovery(discoveryPollDelayMs);
      }, delayMs);
    },
    [clearDiscoveryTimer, clearStoredRun, loadActiveRun, scheduleNext],
  );

  useEffect(() => {
    isMountedRef.current = true;

    if (recoveryStartedRef.current) {
      return () => {
        isMountedRef.current = false;
        stopRequests("effect_cleanup_after_duplicate_recovery");
        recoveryStartedRef.current = false;
      };
    }

    recoveryStartedRef.current = true;
    setStatus("loading");
    void loadActiveRun().then((activeRun) => {
      if (activeRun && !isTerminalRun(activeRun)) {
        clearDiscoveryTimer();
        scheduleNext(activeRun.run_id, 1000);
        return;
      }

      if (activeRun && isTerminalRun(activeRun)) {
        clearStoredRun("terminal_run");
        return;
      }

      const storedRunId = window.localStorage.getItem(storageKey);
      const normalizedStoredRunId = storedRunId ? normalizeStoredRunId(storedRunId) : null;

      if (normalizedStoredRunId) {
        if (normalizedStoredRunId !== storedRunId) {
          persistRunId(normalizedStoredRunId);
        }

        void loadRun(normalizedStoredRunId, { allowNotFoundReset: true }).then((loadedRun) => {
          if (loadedRun && !isTerminalRun(loadedRun)) {
            scheduleNext(loadedRun.run_id, 1000);
            return;
          }

          if (loadedRun && isTerminalRun(loadedRun)) {
            clearStoredRun("terminal_run");
          }
        });
      } else if (storedRunId) {
        clearStoredRun("invalid_stored_run_id");
      }

      scheduleActiveDiscovery(discoveryPollDelayMs);
    });

    return () => {
      isMountedRef.current = false;
      stopRequests("effect_cleanup");
      recoveryStartedRef.current = false;
    };
  }, [clearDiscoveryTimer, clearStoredRun, loadActiveRun, loadRun, persistRunId, scheduleActiveDiscovery, scheduleNext, stopRequests]);

  useEffect(() => {
    if (!run || isTerminalRun(run)) {
      clearTimer();
      if (run && isTerminalRun(run)) {
        clearStoredRun("terminal_run");
      }
      scheduleActiveDiscovery(discoveryPollDelayMs);
      return;
    }

    clearDiscoveryTimer();
    scheduleNext(run.run_id, 2500);
  }, [clearDiscoveryTimer, clearStoredRun, clearTimer, run, scheduleActiveDiscovery, scheduleNext]);

  const startRun = useCallback(async () => {
    if (isStarting || (run && !isTerminalRun(run))) {
      return false;
    }

    stopRequests("start_run");
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


      if (response.status === 409) {
        const responseBody = (await response.json()) as StartConflictResponse;
        if (
          responseBody.code === "operational_update_already_running" &&
          typeof responseBody.activeRunId === "string" &&
          isValidUuid(responseBody.activeRunId) &&
          isCompositeRunViewModel(responseBody.run)
        ) {
          persistRunId(responseBody.activeRunId);
          if (isMountedRef.current) {
            setRun(responseBody.run);
            setStatus(statusFromRun(responseBody.run));
            setMessage(null);
          }
          scheduleNext(responseBody.activeRunId, 1000);
          return true;
        }
      }
      if (!response.ok) {
        const safeMessage = await readSafeError(response);
        if (isMountedRef.current) {
          setMessage(safeMessage);
          setStatus(response.status === 401 || response.status === 403 ? "unauthorized" : "readiness_unavailable");
        }
        return false;
      }

      const responseBody = (await response.json()) as RunResponse;
      if (!responseBody.ok || !isCompositeRunViewModel(responseBody.run)) {
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