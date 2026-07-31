"use client";

import { AlertTriangle, Clipboard, FileText, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { JobTechnicalDetailViewModel, ReservasOperationalSummary } from "@/lib/orquestador/job-technical-detail";

type DetailResponse = {
  detail?: JobTechnicalDetailViewModel;
  error?: string;
  ok?: boolean;
};

type JobTechnicalDetailButtonProps = {
  ariaLabel?: string;
  autoOpenKey?: string | null;
  buttonClassName?: string;
  children?: React.ReactNode;
  hideTrigger?: boolean;
  jobId: string;
  showIcon?: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : String(value);
}

function formatDuration(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value)}s`;
}

const operationalResultNames: Record<string, string> = {
  banco_reservas_actualizar: "Banco de Reservas",
  banco_packs_actualizar: "Banco de Packs",
  banco_packs_actualizar_sin_consumos: "Banco de Packs",
  banco_personas_actualizar: "Banco de Personas",
  dashboard_actualizar: "Dashboard",
  dashboard_actualizar_metricas: "Dashboard",
};

function operationalResultTitle(jobType: string) {
  const name = operationalResultNames[jobType];
  return name ? `Resultado operacional \u00b7 ${name}` : "Resultado operacional";
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-b border-[#e6eef4] py-2 text-xs last:border-b-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-navy break-words">{value ?? "-"}</dd>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: ReservasOperationalSummary }) {
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
      <DetailRow label="Modo" value={summary.mode} />
      <DetailRow label="Fecha desde" value={summary.date_from} />
      <DetailRow label="Inicio interno" value={formatDate(summary.started_at)} />
      <DetailRow label="Fin interno" value={formatDate(summary.ended_at)} />
      <DetailRow label="Duracion interna" value={formatDuration(summary.internal_duration_seconds)} />
      <DetailRow label="Total validas" value={formatNumber(summary.total_valid)} />
      <DetailRow label="Insertadas" value={formatNumber(summary.inserted)} />
      <DetailRow label="Actualizadas" value={formatNumber(summary.updated)} />
      <DetailRow label="Sin cambios" value={formatNumber(summary.unchanged)} />
      <DetailRow label="Errores" value={formatNumber(summary.errors)} />
      <DetailRow label="MCP" value={formatNumber(summary.sources.MCP)} />
      <DetailRow label="MCP_BORRADOR" value={formatNumber(summary.sources.MCP_BORRADOR)} />
      <DetailRow label="OKP" value={formatNumber(summary.sources.OKP)} />
    </dl>
  );
}

function technicalSummaryText(detail: JobTechnicalDetailViewModel) {
  return [
    `Job ${detail.short_id} ${detail.job_type}`,
    `Estado: ${detail.status}`,
    `Worker: ${detail.worker_id ?? "-"}`,
    `Duracion: ${formatDuration(detail.duration_seconds)}`,
    `Return code: ${formatNumber(detail.returncode)}`,
    detail.operational_summary ? `Reservas validas: ${formatNumber(detail.operational_summary.total_valid)}` : null,
    detail.operational_summary ? `Insertadas: ${formatNumber(detail.operational_summary.inserted)}` : null,
    detail.operational_summary ? `Actualizadas: ${formatNumber(detail.operational_summary.updated)}` : null,
  ].filter(Boolean).join("\n");
}

export function JobTechnicalDetailButton({
  ariaLabel,
  autoOpenKey = null,
  buttonClassName = "inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[#cbd8e3] bg-white px-2.5 text-xs font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]",
  children = "Abrir ficha",
  hideTrigger = false,
  jobId,
  showIcon = true,
}: JobTechnicalDetailButtonProps) {
  const [detail, setDetail] = useState<JobTechnicalDetailViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastAutoOpenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const loadDetail = useCallback(async () => {
    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    setCopyMessage(null);

    try {
      const response = await fetch(`/api/orquestador/jobs/${jobId}/detail`, { cache: "no-store" });
      const responseBody = (await response.json()) as DetailResponse;

      if (!response.ok || !responseBody.ok || !responseBody.detail) {
        setError(responseBody.error ?? "No fue posible consultar el detalle tecnico del job.");
        setDetail(null);
        return;
      }

      setDetail(responseBody.detail);
    } catch {
      setError("No fue posible consultar el detalle tecnico del job.");
      setDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!autoOpenKey || autoOpenKey === lastAutoOpenKeyRef.current) {
      return;
    }

    lastAutoOpenKeyRef.current = autoOpenKey;
    void loadDetail();
  }, [autoOpenKey, loadDetail]);

  async function copySummary() {
    if (!detail || !navigator.clipboard) return;

    await navigator.clipboard.writeText(technicalSummaryText(detail));
    setCopyMessage("Resumen copiado.");
  }

  return (
    <>
      {hideTrigger ? null : (
        <button
          aria-label={ariaLabel}
          className={buttonClassName}
          onClick={loadDetail}
          type="button"
        >
          {showIcon ? <FileText className="h-3.5 w-3.5 text-sea" /> : null}
          {children}
        </button>
      )}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3" role="presentation">
          <div
            aria-labelledby="job-technical-detail-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#d6e1ea] bg-white p-4 text-sm text-slate-600 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#d6e1ea] pb-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-navy" id="job-technical-detail-title">Ficha tecnica del job</h2>
                <p className="mt-1 text-xs leading-5">Detalle sanitizado de ejecucion del orquestador.</p>
              </div>
              <button
                aria-label="Cerrar detalle tecnico"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#cbd8e3] bg-white text-navy transition hover:border-sea"
                onClick={() => setIsOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] p-3 text-sm">
                <LoaderCircle className="h-4 w-4 animate-spin text-sea" />
                Cargando detalle tecnico...
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-3 text-sm text-[#8a4a00]">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                {error}
              </div>
            ) : null}

            {detail ? (
              <div className="mt-4 grid gap-4">
                <section className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] p-3">
                  <h3 className="font-medium text-navy">Resumen</h3>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailRow label="Job" value={detail.short_id} />
                    <DetailRow label="Tipo" value={detail.job_label} />
                    <DetailRow label="Estado" value={detail.status} />
                    <DetailRow label="Worker" value={detail.worker_id} />
                    <DetailRow label="Intentos" value={`${detail.attempts ?? "-"}/${detail.max_attempts ?? "-"}`} />
                    <DetailRow label="Duracion" value={formatDuration(detail.duration_seconds)} />
                    <DetailRow label="Inicio" value={formatDate(detail.started_at)} />
                    <DetailRow label="Fin" value={formatDate(detail.finished_at)} />
                    <DetailRow label="Return code" value={formatNumber(detail.returncode)} />
                    <DetailRow label="Timeout" value={detail.timed_out === null ? "-" : detail.timed_out ? "Si" : "No"} />
                  </dl>
                </section>

                <section className="rounded-lg border border-[#d6e1ea] bg-white p-3">
                  <h3 className="font-medium text-navy">Ejecucion</h3>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <DetailRow label="Modo" value={detail.execution_mode} />
                    <DetailRow label="Requested source" value={detail.requested_source} />
                  </dl>
                </section>

                <section className="rounded-lg border border-[#d6e1ea] bg-white p-3">
                  <h3 className="font-medium text-navy">{operationalResultTitle(detail.job_type)}</h3>
                  {detail.operational_summary ? (
                    <SummaryGrid summary={detail.operational_summary} />
                  ) : (
                    <p className="mt-3 text-sm leading-6">El resultado tecnico no contiene metricas estructuradas disponibles.</p>
                  )}
                </section>

                <section className="rounded-lg border border-[#d6e1ea] bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-medium text-navy">Log tecnico sanitizado</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex h-8 w-fit items-center rounded-md border border-[#cbd8e3] bg-white px-2.5 text-xs font-medium text-navy transition hover:border-sea"
                        onClick={() => setIsLogOpen((value) => !value)}
                        type="button"
                      >
                        {isLogOpen ? "Ocultar log" : "Mostrar log"}
                      </button>
                      <button
                        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[#cbd8e3] bg-white px-2.5 text-xs font-medium text-navy transition hover:border-sea"
                        onClick={copySummary}
                        type="button"
                      >
                        <Clipboard className="h-3.5 w-3.5 text-sea" />
                        Copiar resumen tecnico
                      </button>
                    </div>
                  </div>
                  {copyMessage ? <p className="mt-2 text-xs text-[#22613b]">{copyMessage}</p> : null}
                  {!detail.technical_output_available ? (
                    <p className="mt-3 text-sm leading-6">El resultado tecnico no esta disponible para este job.</p>
                  ) : null}
                  {isLogOpen ? (
                    detail.safe_log_lines.length > 0 ? (
                      <ol className="mt-3 max-h-72 overflow-y-auto rounded-md border border-[#d6e1ea] bg-[#f8fbfd] p-3 text-xs leading-5">
                        {detail.safe_log_lines.map((line, index) => (
                          <li className="break-words" key={`${index}-${line}`}>{line}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-sm leading-6">No hay lineas tecnicas seguras para mostrar.</p>
                    )
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
