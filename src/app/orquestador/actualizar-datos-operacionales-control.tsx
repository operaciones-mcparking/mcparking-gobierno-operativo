"use client";

import { AlertTriangle, CheckCircle2, DatabaseZap, Loader2, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CompositeRunViewer } from "./composite-run-viewer";
import { useCompositeOperationsRun } from "./use-composite-operations-run";

const steps = [
  "Banco de Reservas",
  "Banco de Packs",
  "Metricas del Dashboard",
];

const terminalRunStatuses = new Set(["succeeded", "failed", "cancelled"]);

function statusLabel(status: ReturnType<typeof useCompositeOperationsRun>["status"]) {
  if (status === "loading") return "Cargando ejecucion...";
  if (status === "starting") return "Iniciando...";
  if (status === "running") return "Ejecutando";
  if (status === "completed") return "Completado";
  if (status === "failed") return "Fallido";
  if (status === "cancelled") return "Cancelado";
  if (status === "network_error") return "Error de red";
  if (status === "unauthorized") return "No autorizado";
  if (status === "readiness_unavailable") return "No disponible";
  return "Listo";
}

type RefreshStatus = "idle" | "refreshing" | "success" | "failed";

type ActualizarDatosOperacionalesControlProps = {
  className?: string;
  controlHref?: string;
  onSucceeded?: () => Promise<boolean | void> | boolean | void;
  presentation?: "inline" | "overlay";
  triggerVariant?: "default" | "compact";
};

function isTerminalRun(run: ReturnType<typeof useCompositeOperationsRun>["run"]) {
  return Boolean(run && terminalRunStatuses.has(run.status));
}

function overlayCopy(run: ReturnType<typeof useCompositeOperationsRun>["run"], refreshStatus: RefreshStatus) {
  if (!run || !isTerminalRun(run)) {
    return {
      icon: <Loader2 className="h-5 w-5 animate-spin text-sea" aria-hidden="true" />,
      message: "Paso en curso y progreso actualizado automaticamente.",
      title: "Actualizando datos operacionales",
    };
  }

  if (run.status === "succeeded") {
    if (refreshStatus === "refreshing" || refreshStatus === "idle") {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin text-sea" aria-hidden="true" />,
        message: "Actualizando indicadores del Dashboard...",
        title: "Actualizacion de procesos completada",
      };
    }

    if (refreshStatus === "failed") {
      return {
        icon: <AlertTriangle className="h-5 w-5 text-[#8a4a00]" aria-hidden="true" />,
        message: "Los procesos finalizaron correctamente, pero no fue posible actualizar los indicadores visibles. Cierra esta ventana y vuelve a seleccionar la fecha para intentarlo nuevamente.",
        title: "Actualizacion de procesos completada",
      };
    }

    return {
      icon: <CheckCircle2 className="h-5 w-5 text-[#22613b]" aria-hidden="true" />,
      message: "Todos los procesos finalizaron correctamente.",
      title: "Actualizacion completada",
    };
  }

  if (run.status === "failed") {
    const failedStep = run.steps.find((step) => step.status === "failed");
    return {
      icon: <AlertTriangle className="h-5 w-5 text-[#8a4a00]" aria-hidden="true" />,
      message: failedStep?.label
        ? `La actualizacion se detuvo antes de completar todas las etapas. Etapa afectada: ${failedStep.label}.`
        : "La actualizacion se detuvo antes de completar todas las etapas.",
      title: "No se pudo completar la actualizacion",
    };
  }

  return {
    icon: <AlertTriangle className="h-5 w-5 text-[#8a4a00]" aria-hidden="true" />,
    message: "La actualizacion no alcanzo a completar todas las etapas.",
    title: "Actualizacion cancelada",
  };
}


export function ActualizarDatosOperacionalesControl({
  className = "",
  controlHref,
  onSucceeded,
  presentation = "inline",
  triggerVariant = "default",
}: ActualizarDatosOperacionalesControlProps) {
  const { clearRun, isStarting, message, run, startRun, status } = useCompositeOperationsRun();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const completedRunRef = useRef<string | null>(null);
  const refreshingRunRef = useRef<string | null>(null);
  const onSucceededRef = useRef(onSucceeded);
  const canStart = !isStarting && !run;
  const isBusy = isStarting || status === "starting";
  const triggerLabel = run ? "Actualizacion en curso" : isStarting ? "Iniciando actualizacion..." : "Actualizar datos operacionales";
  const useOverlay = presentation === "overlay";
  const hasRun = Boolean(run);
  const showOverlay = useOverlay && (isConfirming || isStarting || hasRun || isOverlayOpen);
  const isRefreshingAfterSuccess = run?.status === "succeeded" && (refreshStatus === "idle" || refreshStatus === "refreshing");
  const canCloseOverlay = Boolean(run && isTerminalRun(run) && !isRefreshingAfterSuccess);
  const copy = overlayCopy(run, refreshStatus);

  useEffect(() => {
    onSucceededRef.current = onSucceeded;
  }, [onSucceeded]);

  useEffect(() => {
    if (run && useOverlay) {
      setIsOverlayOpen(true);
    }
  }, [run, useOverlay]);

  useEffect(() => {
    if (!run || run.status !== "succeeded") {
      return;
    }

    if (completedRunRef.current === run.run_id || refreshingRunRef.current === run.run_id) {
      return;
    }

    refreshingRunRef.current = run.run_id;
    setRefreshStatus("refreshing");
    Promise.resolve(onSucceededRef.current?.())
      .then((result) => {
        completedRunRef.current = run.run_id;
        setRefreshStatus(result === false ? "failed" : "success");
      })
      .catch(() => {
        completedRunRef.current = run.run_id;
        setRefreshStatus("failed");
      })
      .finally(() => {
        refreshingRunRef.current = null;
      });
  }, [run]);

  useEffect(() => {
    if (!isConfirming && !showOverlay) {
      return;
    }

    if (isConfirming) {
      cancelButtonRef.current?.focus();
    } else if (canCloseOverlay) {
      closeButtonRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy && (!useOverlay || isConfirming)) {
        setIsConfirming(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canCloseOverlay, isBusy, isConfirming, showOverlay, useOverlay]);

  async function confirmRun() {
    if (!canStart) {
      return;
    }

    if (useOverlay) {
      setIsOverlayOpen(true);
    }

    const started = await startRun();
    if (started) {
      setIsConfirming(false);
    }
  }

  function openConfirmation() {
    completedRunRef.current = null;
    refreshingRunRef.current = null;
    setRefreshStatus("idle");
    setIsConfirming(true);
  }

  function closeBackdrop() {
    if (!isBusy) {
      if (!useOverlay || isConfirming) {
        setIsConfirming(false);
      }
    }
  }

  function closeOverlay() {
    if (!canCloseOverlay) {
      return;
    }

    clearRun();
    setIsOverlayOpen(false);
    setRefreshStatus("idle");
    completedRunRef.current = null;
    refreshingRunRef.current = null;
  }

  const actions = run ? (
    <>
      {controlHref ? (
        <Link
          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff] sm:w-fit"
          href={controlHref}
        >
          Ver en Centro de Control
        </Link>
      ) : null}
      {useOverlay ? (
        <button
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#08325e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
          disabled={!canCloseOverlay}
          onClick={closeOverlay}
          ref={closeButtonRef}
          type="button"
        >
          <X className="h-4 w-4 text-sea" />
          Cerrar
        </button>
      ) : (
        <button
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
          onClick={clearRun}
          type="button"
        >
          <X className="h-4 w-4 text-sea" />
          Cerrar resultado
        </button>
      )}
    </>
  ) : null;

  const viewer = run ? <CompositeRunViewer className="mt-4" compact={useOverlay} run={run} title="Progreso de actualizacion operacional" /> : null;

  const triggerButton = triggerVariant === "compact" ? (
    <button
      aria-label={triggerLabel}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#0b3554] bg-navy text-white shadow-sm transition hover:bg-[#08325e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-10"
      disabled={!canStart}
      onClick={openConfirmation}
      title={triggerLabel}
      type="button"
    >
      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
    </button>
  ) : (
    <button
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#08325e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
      disabled={!canStart}
      onClick={openConfirmation}
      type="button"
    >
      <DatabaseZap className="h-4 w-4" />
      {triggerLabel}
    </button>
  );

  const inlineControl = !useOverlay ? (
    <section className={`mt-5 rounded-lg border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-sm ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy">Actualizar datos operacionales</h2>
            <span className="rounded-md border border-[#ffd4a3] bg-[#fff8ef] px-2.5 py-1 text-xs font-medium text-[#8a4a00]">Ejecucion real</span>
          </div>
          <p className="mt-2 leading-6">
            Esta operacion ejecuta, en orden, Banco de Reservas, Banco de Packs y metricas del Dashboard.
          </p>
          <ol className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step} className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] px-3 py-2">
                <span className="font-medium text-navy">{index + 1}. </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <span className="w-fit rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600" aria-live="polite">
            {statusLabel(status)}
          </span>
          {triggerButton}
          {actions}
        </div>
      </div>

      {message ? (
        <p className="mt-4 max-h-28 overflow-y-auto break-words rounded-lg border border-[#ffd4a3] bg-[#fff8ef] px-3 py-2 text-sm text-[#8a4a00]" aria-live="polite">
          {message}
        </p>
      ) : null}

      {viewer}
    </section>
  ) : null;

  return (
    <>
      {useOverlay ? <div className={className}>{triggerButton}</div> : inlineControl}

      {isConfirming && !useOverlay ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeBackdrop}
          role="presentation"
        >
          <div
            aria-labelledby="actualizar-datos-title"
            aria-modal="true"
            className="max-h-[calc(100dvh-2rem)] min-w-0 w-full max-w-md overflow-x-hidden overflow-y-auto rounded-lg border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-medium text-navy" id="actualizar-datos-title">
                Actualizar datos operacionales
              </h2>
              <span className="rounded-md border border-[#ffd4a3] bg-[#fff8ef] px-2 py-1 text-xs font-medium text-[#8a4a00]">
                Confirmacion requerida
              </span>
            </div>
            <p className="mt-3 leading-6">Se actualizaran Banco de Reservas, Banco de Packs y las metricas del Dashboard.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5" aria-live="polite">
              {isBusy ? "Iniciando actualizacion..." : "El avance real queda controlado por el servidor y el worker."}
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                onClick={() => setIsConfirming(false)}
                ref={cancelButtonRef}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canStart}
                onClick={confirmRun}
                type="button"
              >
                {isBusy ? "Iniciando actualizacion..." : "Confirmar ejecucion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/35 p-3 sm:p-4" role="presentation">
          <div
            aria-describedby="actualizar-datos-overlay-description"
            aria-labelledby="actualizar-datos-overlay-title"
            aria-modal="true"
            className="max-h-[calc(100dvh-2rem)] min-w-0 w-full max-w-3xl overflow-x-hidden overflow-y-auto rounded-xl border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-xl sm:p-5"
            role="dialog"
          >
            {isConfirming ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-medium text-navy" id="actualizar-datos-overlay-title">
                    Actualizar datos operacionales
                  </h2>
                  <span className="rounded-md border border-[#ffd4a3] bg-[#fff8ef] px-2 py-1 text-xs font-medium text-[#8a4a00]">
                    Confirmacion requerida
                  </span>
                </div>
                <p className="mt-3 leading-6" id="actualizar-datos-overlay-description">
                  Se actualizaran Banco de Reservas, Banco de Packs y las metricas del Dashboard.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5" aria-live="polite">
                  {isBusy ? "Iniciando actualizacion..." : "El avance real queda controlado por el servidor y el worker."}
                </p>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isBusy}
                    onClick={() => setIsConfirming(false)}
                    ref={cancelButtonRef}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canStart}
                    onClick={confirmRun}
                    type="button"
                  >
                    {isBusy ? "Iniciando actualizacion..." : "Confirmar ejecucion"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d6e1ea] bg-[#f8fbfd]">
                    {copy.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-navy" id="actualizar-datos-overlay-title">
                        {copy.title}
                      </h2>
                      <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-0.5 text-xs font-medium text-slate-600">
                        {statusLabel(status)}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-sm leading-5" id="actualizar-datos-overlay-description" aria-live="polite">
                      {copy.message}
                    </p>
                  </div>
                </div>

                {message ? (
                  <p className="mt-4 max-h-28 overflow-y-auto break-words rounded-lg border border-[#ffd4a3] bg-[#fff8ef] px-3 py-2 text-sm text-[#8a4a00]" aria-live="polite">
                    {message}
                  </p>
                ) : null}

                {viewer}

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  {actions}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
