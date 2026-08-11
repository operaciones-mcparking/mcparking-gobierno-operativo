"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";

import type {
  ProcessActivationCompleteness,
  ProcessActivationValidation,
} from "@/app/procesos/process-master/process-master-validation";

type ProcessActivationPanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  completeness: ProcessActivationCompleteness;
  processId: string;
  processName: string;
  validation: ProcessActivationValidation;
};

export function ProcessActivationPanel({
  action,
  completeness,
  processId,
  processName,
  validation,
}: ProcessActivationPanelProps) {
  const isReady = validation.isValid;
  const title = isReady ? "Listo para activar" : `Borrador - ${completeness.completionPercent}% completo`;

  function confirmActivation(event: React.FormEvent<HTMLFormElement>) {
    const warningText = validation.warnings.length
      ? `\n\nAdvertencias:\n${validation.warnings.map((warning) => `- ${warning.label}`).join("\n")}`
      : "";
    const confirmed = window.confirm(
      `Activar proceso\n\n${processName} pasara a formar parte del Diccionario de procesos oficiales.\n\nDespues de activarlo seguira siendo editable.${warningText}`,
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-[#d6e1ea] bg-white p-5 shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isReady ? (
              <CheckCircle2 className="h-5 w-5 text-[#247a4b]" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-[#b7791f]" aria-hidden="true" />
            )}
            <h2 className="text-lg font-bold text-navy">{title}</h2>
            <span className="rounded-full border border-[#d6e1ea] bg-[#f6f8fb] px-2.5 py-1 text-xs font-bold text-slate-600">
              {completeness.blockingCount} faltantes - {completeness.warningCount} advertencias
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef4]" aria-hidden="true">
            <div
              className="h-full rounded-full bg-navy transition-[width]"
              style={{ width: `${completeness.completionPercent}%` }}
            />
          </div>
        </div>

        <form action={action} onSubmit={confirmActivation}>
          <input name="process_id" type="hidden" value={processId} />
          <button
            className="inline-flex w-full items-center justify-center rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077] disabled:cursor-not-allowed disabled:border disabled:border-[#d6e1ea] disabled:bg-[#f1f5f9] disabled:text-slate-500 lg:w-auto"
            disabled={!isReady}
            type="submit"
          >
            Activar proceso
          </button>
        </form>
      </div>

      {!isReady ? (
        <div className="mt-4 rounded-md border border-[#ffd6b0] bg-[#fff7ed] p-4">
          <p className="text-sm font-bold text-[#86510d]">Falta:</p>
          <ul className="mt-2 grid gap-1 text-sm text-[#86510d]">
            {validation.missingFields.map((field) => (
              <li key={field.key}>- {field.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {validation.warnings.length > 0 ? (
        <div className="mt-4 rounded-md border border-[#cfe0ec] bg-[#f6f9fc] p-4">
          <p className="text-sm font-bold text-navy">Advertencias:</p>
          <ul className="mt-2 grid gap-1 text-sm text-slate-600">
            {validation.warnings.map((warning) => (
              <li key={warning.key}>- {warning.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isReady ? (
        <p className="mt-3 text-sm font-medium text-slate-600">
          Completa los requisitos bloqueantes para habilitar la activacion.
        </p>
      ) : null}
    </section>
  );
}
