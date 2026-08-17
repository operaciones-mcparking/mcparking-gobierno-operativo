"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, X } from "lucide-react";

import { useProcessMasterActivationPrompt, useProcessMasterReadiness } from "@/app/procesos/process-master/process-master-save-coordinator";

type ProcessActivationPanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  processId: string;
  processName: string;
};

function ActivationSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Activando..." : "Activar proceso"}
    </button>
  );
}

export function ProcessActivationPanel({
  action,
  processId,
  processName,
}: ProcessActivationPanelProps) {
  const { completeness, hasChanges, isSaving, validation } = useProcessMasterReadiness();
  const registerActivationPrompt = useProcessMasterActivationPrompt();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isReady = validation.isValid;
  const hasDetails = validation.missingFields.length > 0 || validation.warnings.length > 0;
  const title = `Borrador - ${completeness.completionPercent}% completo`;

  useEffect(() => registerActivationPrompt(() => setConfirmOpen(true)), [registerActivationPrompt]);
  useEffect(() => {
    if (!confirmOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmOpen]);

  return (
    <>
      <section className="mt-5 rounded-lg border border-[#d6e1ea] bg-white p-5 shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isReady ? (
                <CheckCircle2 className="h-5 w-5 text-[#247a4b]" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-[#b7791f]" aria-hidden="true" />
              )}
              <h2 className="text-base font-bold text-navy">{title}</h2>
              <span className="rounded-full border border-[#d6e1ea] bg-[#f6f8fb] px-2.5 py-1 text-xs font-bold text-slate-600">
                {completeness.blockingCount} faltantes {"\u00b7"} {completeness.warningCount} advertencias
              </span>
              {isReady ? <span className="text-xs font-bold text-[#247a4b]">Proceso listo</span> : null}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef4]" aria-hidden="true">
              <div
                className="h-full rounded-full bg-navy transition-[width]"
                style={{ width: `${completeness.completionPercent}%` }}
              />
            </div>
            {hasChanges ? (
              <p className="mt-3 text-sm font-medium text-slate-600">Guarda la ficha para habilitar la activacion.</p>
            ) : !isReady ? (
              <p className="mt-3 text-sm font-medium text-slate-600">
                Completa los requisitos bloqueantes para habilitar la activacion.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {hasDetails ? (
              <button
                aria-expanded={detailsOpen}
                className="inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-semibold text-sea transition hover:bg-[#eef4f8] hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                onClick={() => setDetailsOpen((current) => !current)}
                type="button"
              >
                {detailsOpen ? "Ocultar detalles" : "Ver detalles"}
                {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              className="inline-flex items-center justify-center rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-not-allowed disabled:border disabled:border-[#d6e1ea] disabled:bg-[#f1f5f9] disabled:text-slate-500"
              disabled={!isReady || hasChanges || isSaving}
              onClick={() => setConfirmOpen(true)}
              type="button"
            >
              Activar proceso
            </button>
          </div>
        </div>

        {detailsOpen && hasDetails ? (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 lg:grid-cols-2">
            {validation.missingFields.length > 0 ? (
              <div className="rounded-md border border-[#ffd6b0] bg-[#fff7ed] p-4">
                <p className="text-sm font-bold text-[#86510d]">Faltantes</p>
                <ul className="mt-2 grid gap-1 text-sm text-[#86510d]">
                  {validation.missingFields.map((field) => <li key={field.key}>- {field.label}</li>)}
                </ul>
              </div>
            ) : null}

            {validation.warnings.length > 0 ? (
              <div className="rounded-md border border-[#cfe0ec] bg-[#f6f9fc] p-4">
                <p className="text-sm font-bold text-navy">Advertencias</p>
                <ul className="mt-2 grid gap-1 text-sm text-slate-600">
                  {validation.warnings.map((warning) => <li key={warning.key}>- {warning.label}</li>)}
                </ul>
                {isReady ? <p className="mt-2 text-xs text-slate-500">Estas advertencias no impiden activar el proceso.</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#032b4f]/30 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmOpen(false);
          }}
        >
          <section
            aria-labelledby="activate-process-confirm-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[#cbd8e3] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.20)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#d6e1ea] px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sea">Activar proceso</p>
                <h3 className="mt-1 text-lg font-medium text-navy" id="activate-process-confirm-title">Confirmar activacion</h3>
              </div>
              <button
                aria-label="Cerrar confirmacion"
                className="rounded-lg border border-[#cbd8e3] bg-white p-2 text-slate-500 transition hover:bg-[#f6f8fa] hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                onClick={() => setConfirmOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-4 p-5">
              <p className="text-sm leading-6 text-slate-700">
                <strong className="text-navy">{processName}</strong> pasara a formar parte del Diccionario de procesos oficiales. Despues de activarlo seguira siendo editable.
              </p>
              {validation.warnings.length > 0 ? (
                <div className="rounded-md border border-[#cfe0ec] bg-[#f6f9fc] p-3">
                  <p className="text-sm font-bold text-navy">Advertencias</p>
                  <ul className="mt-2 grid gap-1 text-sm text-slate-600">
                    {validation.warnings.map((warning) => <li key={warning.key}>- {warning.label}</li>)}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
                <button
                  className="rounded-lg border border-[#cbd8e3] bg-white px-4 py-2 text-sm font-medium text-navy transition hover:bg-[#f6f8fa]"
                  onClick={() => setConfirmOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <form action={action}>
                  <input name="process_id" type="hidden" value={processId} />
                  <ActivationSubmitButton />
                </form>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}