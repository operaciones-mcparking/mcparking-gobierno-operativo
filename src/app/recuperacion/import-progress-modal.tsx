"use client";

import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

import { ValueBadge } from "@/components/dashboard/badge";

type ImportModalStatus = "confirm" | "loading" | "success" | "error";

type ImportProgressModalProps = {
  children?: ReactNode;
  confirmLabel?: string;
  description: string;
  errorMessage?: string | null;
  fileName?: string | null;
  importTypeLabel: string;
  loadingMessage: string;
  onCancel: () => void;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  status: ImportModalStatus;
  successMessage: string;
  title: string;
};

export function ImportProgressModal({
  children,
  confirmLabel = "Confirmar importacion",
  description,
  errorMessage,
  fileName,
  importTypeLabel,
  loadingMessage,
  onCancel,
  onClose,
  onConfirm,
  open,
  status,
  successMessage,
  title,
}: ImportProgressModalProps) {
  if (!open) return null;

  const isLoading = status === "loading";
  const canDismiss = !isLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 px-4 py-6"
      onClick={canDismiss ? onCancel : undefined}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_24px_70px_rgba(2,53,116,0.24)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#edf2f6] px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-medium text-navy">{title}</h3>
              <ValueBadge tone={status === "success" ? "success" : status === "error" ? "danger" : "warning"}>
                {importTypeLabel}
              </ValueBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          {canDismiss ? (
            <button
              aria-label="Cerrar"
              className="rounded-lg border border-[#d6e1ea] bg-white p-2 text-slate-500 hover:text-navy"
              onClick={status === "confirm" ? onCancel : onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="space-y-4 px-5 py-5">
          {fileName ? (
            <div className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3 text-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Archivo</p>
              <p className="mt-1 break-all font-medium text-navy">{fileName}</p>
            </div>
          ) : null}

          {status === "confirm" ? (
            <div className="rounded-lg border border-[#ffd6b0] bg-[#fff7ef] px-3 py-3 text-sm leading-6 text-[#86510d]">
              Revisa el resumen antes de importar. No se mostraran filas crudas, payloads ni datos sensibles en esta confirmacion.
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin text-sea" />
              <div>
                <p className="font-medium text-navy">Se esta cargando el archivo, por favor espera.</p>
                <p className="mt-1 text-xs text-slate-500">{loadingMessage}</p>
              </div>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="flex items-start gap-3 rounded-lg border border-[#bfe5d2] bg-[#f1fbf6] px-3 py-3 text-sm leading-6 text-[#166534]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{successMessage}</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex items-start gap-3 rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-3 text-sm leading-6 text-[#9a3412]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">No se pudo cargar el archivo</p>
                <p className="mt-1">{errorMessage || "Ocurrio un error inesperado."}</p>
              </div>
            </div>
          ) : null}

          {children}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#edf2f6] px-5 py-4">
          {status === "confirm" ? (
            <>
              <button
                className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:text-navy"
                onClick={onCancel}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-[#163a5c]"
                onClick={onConfirm}
                type="button"
              >
                {confirmLabel}
              </button>
            </>
          ) : null}
          {status === "success" || status === "error" ? (
            <button
              className="rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-[#163a5c]"
              onClick={onClose}
              type="button"
            >
              Cerrar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}


type ImportResultGridProps = {
  items: Array<{ label: string; value: string }>;
  title?: string;
};

export function ImportResultGrid({ items, title }: ImportResultGridProps) {
  return (
    <div className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3">
      {title ? <h4 className="mb-3 text-sm font-medium text-navy">{title}</h4> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div className="rounded-md border border-[#edf2f6] bg-white px-3 py-2" key={item.label}>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-navy">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
