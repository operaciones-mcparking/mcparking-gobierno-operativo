"use client";

import { DatabaseZap, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CompositeRunViewer } from "./composite-run-viewer";
import { useCompositeOperationsRun } from "./use-composite-operations-run";

const steps = [
  "Actualizar Reservas ultimo mes",
  "Actualizar Banco de Packs",
  "Actualizar metricas Dashboard ultimo mes",
];

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

type ActualizarDatosOperacionalesControlProps = {
  className?: string;
  controlHref?: string;
  onSucceeded?: () => Promise<void> | void;
};

export function ActualizarDatosOperacionalesControl({
  className = "",
  controlHref,
  onSucceeded,
}: ActualizarDatosOperacionalesControlProps) {
  const { clearRun, isStarting, message, run, startRun, status } = useCompositeOperationsRun();
  const [isConfirming, setIsConfirming] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const completedRunRef = useRef<string | null>(null);
  const onSucceededRef = useRef(onSucceeded);
  const canStart = !isStarting && !run;
  const isBusy = isStarting || status === "starting";

  useEffect(() => {
    onSucceededRef.current = onSucceeded;
  }, [onSucceeded]);

  useEffect(() => {
    if (run?.status !== "succeeded" || completedRunRef.current === run.run_id) {
      return;
    }

    completedRunRef.current = run.run_id;
    void onSucceededRef.current?.();
  }, [run?.run_id, run?.status]);

  useEffect(() => {
    if (!isConfirming) {
      return;
    }

    cancelButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        setIsConfirming(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isBusy, isConfirming]);

  async function confirmRun() {
    if (!canStart) {
      return;
    }

    const started = await startRun();
    if (started) {
      setIsConfirming(false);
    }
  }

  function closeBackdrop() {
    if (!isBusy) {
      setIsConfirming(false);
    }
  }

  return (
    <section className={`mt-5 rounded-lg border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-sm ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-navy">Actualizar datos operacionales</h2>
            <span className="rounded-md border border-[#ffd4a3] bg-[#fff8ef] px-2.5 py-1 text-xs font-medium text-[#8a4a00]">Ejecucion real</span>
          </div>
          <p className="mt-2 leading-6">
            Esta operacion ejecuta, en orden, la actualizacion de Reservas del ultimo mes, Banco de Packs y metricas Dashboard del ultimo mes.
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
          <button
            className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-navy px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#08325e] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canStart}
            onClick={() => setIsConfirming(true)}
            type="button"
          >
            <DatabaseZap className="h-4 w-4" />
            {isStarting ? "Iniciando..." : "Actualizar datos operacionales"}
          </button>
          {run ? (
            <>
              {controlHref ? (
                <Link
                  className="inline-flex h-9 w-fit items-center rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
                  href={controlHref}
                >
                  Ver en Centro de Control
                </Link>
              ) : null}
              <button
                className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
                onClick={clearRun}
                type="button"
              >
                <X className="h-4 w-4 text-sea" />
                Cerrar resultado
              </button>
            </>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] px-3 py-2 text-sm text-[#8a4a00]" aria-live="polite">
          {message}
        </p>
      ) : null}

      {run ? <CompositeRunViewer className="mt-4" run={run} title="Progreso de actualizacion operacional" /> : null}

      {isConfirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeBackdrop}
          role="presentation"
        >
          <div
            aria-labelledby="actualizar-datos-title"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-lg"
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
    </section>
  );
}
