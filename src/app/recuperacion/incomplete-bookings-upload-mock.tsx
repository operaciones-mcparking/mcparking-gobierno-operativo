"use client";

import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

type IncompleteBookingsValidationSummary = {
  columns: number;
  duplicateBookingIdGroups: number;
  duplicateIdGroups: number;
  duplicateMessageIdGroups: number;
  emailsTotal: number;
  emailsValid: number;
  formDatetimeParseable: number;
  messageSentCounts: Record<string, number>;
  missingCriticalColumns: string[];
  missingRecommendedColumns: string[];
  missingRequiredColumns: string[];
  phonesNormalizable: number;
  phonesTotal: number;
  rows: number;
  rowsWithoutEmailOrPhone: number;
  typeCounts: Record<string, number>;
  unknownTypeRows: number;
};

type ValidationResponse = {
  error?: string;
  ok: boolean;
  summary?: IncompleteBookingsValidationSummary;
};

type ImportSummary = {
  bookingDuplicateRows: number;
  conflictRows: number;
  fileAlreadyImported: boolean;
  insertedAbandonedRows: number;
  insertedCanceledRows: number;
  insertedRows: number;
  invalidRows: number;
  messageDuplicateRows: number;
  messageSentRows: number;
  rowsReceived: number;
  rowsTotal: number;
  skippedDuplicateRows: number;
  sourceDuplicateRows: number;
};

type ImportResponse = {
  batchId?: string | null;
  error?: string;
  ok: boolean;
  summary?: ImportSummary;
};

const steps = [
  { label: "Subir CSV", status: "disponible", tone: "info" as BadgeTone },
  { label: "Validar archivo", status: "disponible", tone: "info" as BadgeTone },
  { label: "Revisar preview", status: "seguro", tone: "warning" as BadgeTone },
  { label: "Preparar staging", status: "disponible", tone: "info" as BadgeTone },
  { label: "Cruzar con compras", status: "pendiente", tone: "neutral" as BadgeTone },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function errorMessageForStatus(status: number, fallback: string) {
  if (status === 401 || status === 403) {
    return "No tienes permisos para validar carritos. Ingresa con un usuario administrador.";
  }

  if (status === 413) {
    return "El archivo supera el límite permitido de 10 MB.";
  }

  if (status === 400) {
    return fallback || "Revisa que el archivo exista y tenga formato CSV.";
  }

  return fallback || "No se pudo validar el archivo. Intenta nuevamente.";
}

export function IncompleteBookingsUploadMock() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<IncompleteBookingsValidationSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const canImport = Boolean(selectedFile && summary && !error && !isValidating && !isImporting);

  const previewMetrics = useMemo(() => {
    if (!summary) {
      return [
        { label: "Filas", value: "-" },
        { label: "Columnas", value: "-" },
        { label: "Columnas obligatorias faltantes", value: "-" },
        { label: "Columnas críticas faltantes", value: "-" },
        { label: "Columnas recomendadas faltantes", value: "-" },
        { label: "Emails válidos", value: "-" },
        { label: "Teléfonos normalizables", value: "-" },
        { label: "Sin email ni teléfono útil", value: "-" },
        { label: "form_datetime parseable", value: "-" },
        { label: "Duplicados id", value: "-" },
        { label: "Duplicados booking_id", value: "-" },
        { label: "Duplicados Id_Mensaje", value: "-" },
      ];
    }

    return [
      { label: "Filas", value: formatNumber(summary.rows) },
      { label: "Columnas", value: formatNumber(summary.columns) },
      { label: "Columnas obligatorias faltantes", value: formatNumber(summary.missingRequiredColumns.length) },
      { label: "Columnas críticas faltantes", value: formatNumber(summary.missingCriticalColumns.length) },
      { label: "Columnas recomendadas faltantes", value: formatNumber(summary.missingRecommendedColumns.length) },
      { label: "Emails válidos", value: `${formatNumber(summary.emailsValid)} / ${formatNumber(summary.emailsTotal)}` },
      {
        label: "Teléfonos normalizables",
        value: `${formatNumber(summary.phonesNormalizable)} / ${formatNumber(summary.phonesTotal)}`,
      },
      { label: "Sin email ni teléfono útil", value: formatNumber(summary.rowsWithoutEmailOrPhone) },
      {
        label: "form_datetime parseable",
        value: `${formatNumber(summary.formDatetimeParseable)} / ${formatNumber(summary.rows)}`,
      },
      { label: "Duplicados id", value: formatNumber(summary.duplicateIdGroups) },
      { label: "Duplicados booking_id", value: formatNumber(summary.duplicateBookingIdGroups) },
      { label: "Duplicados Id_Mensaje", value: formatNumber(summary.duplicateMessageIdGroups) },
    ];
  }, [summary]);

  const typeCounts = useMemo(() => {
    const counts = summary?.typeCounts ?? {};

    return [
      { label: "abandoned", value: counts.abandoned === undefined ? "-" : formatNumber(counts.abandoned), tone: "info" as BadgeTone },
      { label: "canceled", value: counts.canceled === undefined ? "-" : formatNumber(counts.canceled), tone: "warning" as BadgeTone },
      { label: "unknown", value: summary ? formatNumber(summary.unknownTypeRows) : "-", tone: "neutral" as BadgeTone },
    ];
  }, [summary]);

  const messageSentCounts = useMemo(() => {
    const counts = summary?.messageSentCounts ?? {};

    return [
      { label: "true", value: counts.true === undefined ? "-" : formatNumber(counts.true), tone: "success" as BadgeTone },
      { label: "false", value: counts.false === undefined ? "-" : formatNumber(counts.false), tone: "neutral" as BadgeTone },
      { label: "unknown", value: counts.unknown === undefined ? "-" : formatNumber(counts.unknown), tone: "warning" as BadgeTone },
    ];
  }, [summary]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setError(null);
    setImportError(null);
    setSummary(null);
    setImportSummary(null);
    setSelectedFile(file);
  }

  async function handleValidate() {
    if (!selectedFile) {
      setError("Selecciona un archivo CSV antes de validar.");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se aceptan archivos .csv en esta etapa.");
      return;
    }

    setError(null);
    setImportError(null);
    setSummary(null);
    setImportSummary(null);
    setIsValidating(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/carritos/validar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as ValidationResponse;

      if (!response.ok || !payload.ok || !payload.summary) {
        setError(errorMessageForStatus(response.status, payload.error ?? ""));
        return;
      }

      setSummary(payload.summary);
    } catch {
      setError("No se pudo conectar con el validador. Revisa la conexión o intenta nuevamente.");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleImport() {
    if (!selectedFile || !summary) {
      setImportError("Valida un archivo CSV antes de preparar la importación.");
      return;
    }

    const confirmed = window.confirm(
      "Esta acción guardará los carritos perdidos/cancelados normalizados en staging de recuperación.\n" +
        "No se guardará el CSV completo, cms_url, bform ni PII cruda.\n" +
        "¿Confirmar importación?",
    );

    if (!confirmed) {
      return;
    }

    setImportError(null);
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/carritos/importar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.ok || !payload.summary) {
        setImportError(errorMessageForStatus(response.status, payload.error ?? ""));
        return;
      }

      setImportSummary(payload.summary);
    } catch {
      setImportError("No se pudo conectar con el importador. Revisa la conexión o intenta nuevamente.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga de carritos perdidos</h2>
            <ValueBadge tone="warning">Validación real — aún no guarda datos</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube un CSV de BackendIncompleteBookings2 para validar reservas incompletas, abandonos y
            cancelaciones antes de cruzarlas con WhatsApp y compras posteriores.
          </p>
        </div>
        <ValueBadge tone="info">Fuente n8n</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#d9c7aa] bg-[#fffaf4] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#e8d7bd] bg-white text-[#9a621a]">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo de carritos</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado: <span className="font-medium text-navy">BackendIncompleteBookings2.csv</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Fuente n8n: BackendIncompleteBookings2.</p>
            {selectedFile ? (
              <div className="mt-4 rounded-lg border border-[#e8d7bd] bg-white px-3 py-3 text-sm">
                <p className="font-medium text-navy">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-slate-500">Tamaño aproximado: {formatFileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-[#e8d7bd] bg-white px-3 py-3 text-sm text-slate-500">
                Sin archivo seleccionado.
              </p>
            )}
            <input
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
              ref={inputRef}
              type="file"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-[#f8fafb]"
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Seleccionar CSV
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-45"
                disabled={!selectedFile || isValidating}
                onClick={handleValidate}
                type="button"
              >
                {isValidating ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {isValidating ? "Validando..." : "Validar CSV"}
              </button>
            </div>
            {error ? (
              <p className="mt-3 rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
                {error}
              </p>
            ) : null}
            {summary ? (
              <p className="mt-3 rounded-lg border border-[#bfe5d2] bg-[#f1fbf6] px-3 py-2 text-sm leading-5 text-[#166534]">
                Validación completada. La vista previa muestra solo agregados seguros.
              </p>
            ) : null}
            {importSummary ? (
              <p className="mt-3 rounded-lg border border-[#bfe5d2] bg-[#f1fbf6] px-3 py-2 text-sm leading-5 text-[#166534]">
                Importación preparada en staging. Filas insertadas: {formatNumber(importSummary.insertedRows)}.
              </p>
            ) : null}
            {importError ? (
              <p className="mt-3 rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
                {importError}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c5dce7] bg-white text-sea">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-sm leading-6 text-slate-600">
                No se muestran emails, teléfonos, cms_url, bform ni filas reales en la vista previa. Solo
                agregados seguros.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <h3 className="text-sm font-medium text-navy">Flujo propuesto</h3>
            <div className="mt-3 grid gap-2">
              {steps.map((step, index) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-2"
                  key={step.label}
                >
                  <span className="text-sm text-slate-700">
                    {index + 1}. {step.label}
                  </span>
                  <ValueBadge tone={step.tone}>{step.status}</ValueBadge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h3 className="text-sm font-medium text-navy">Preview seguro</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {summary
                    ? "Resultado real de validación. No corresponde a una importación."
                    : "Selecciona un CSV y valídalo para ver el resumen real."}
                </p>
              </div>
              <ValueBadge tone={summary ? "success" : "warning"}>{summary ? "Validado" : "Pendiente"}</ValueBadge>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {previewMetrics.map((metric) => (
                <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3" key={metric.label}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-base font-medium text-navy">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Tipos</h3>
              <div className="mt-3 grid gap-2">
                {typeCounts.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3"
                    key={item.label}
                  >
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <ValueBadge tone={item.tone}>{item.value}</ValueBadge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Message_Sent</h3>
              <div className="mt-3 grid gap-2">
                {messageSentCounts.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3"
                    key={item.label}
                  >
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <ValueBadge tone={item.tone}>{item.value}</ValueBadge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-[#86510d]">
                  <Database className="h-4 w-4" />
                  <h3 className="text-sm font-medium">Preparar importación</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#86510d]">
                  Guarda los carritos normalizados en staging. No se almacena el CSV completo ni PII cruda.
                </p>
                {importSummary ? (
                  <div className="mt-3 rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-xs leading-5 text-[#86510d]">
                    <p>Filas insertadas: {formatNumber(importSummary.insertedRows)}</p>
                    <p>Abandoned: {formatNumber(importSummary.insertedAbandonedRows)}</p>
                    <p>Canceled: {formatNumber(importSummary.insertedCanceledRows)}</p>
                    <p>Message_Sent true: {formatNumber(importSummary.messageSentRows)}</p>
                    <p>Duplicadas omitidas: {formatNumber(importSummary.skippedDuplicateRows)}</p>
                    {importSummary.fileAlreadyImported ? <p>Archivo ya importado anteriormente.</p> : null}
                  </div>
                ) : null}
              </div>
              <button
                className="rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] disabled:opacity-55"
                disabled={!canImport}
                onClick={handleImport}
                type="button"
              >
                {isImporting ? "Preparando..." : "Preparar importación"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
