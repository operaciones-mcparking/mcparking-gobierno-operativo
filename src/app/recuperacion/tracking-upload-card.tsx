"use client";

import { CheckCircle2, Database, FileSpreadsheet, MessageCircle, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

type TrackingValidationSummary = {
  businessPhonesNormalizable: number;
  businessPhonesTotal: number;
  categoryCounts: Record<string, number>;
  chargeTypeCounts: Record<string, number>;
  clientPhonesNormalizable: number;
  clientPhonesTotal: number;
  columns: number;
  duplicateMessageIdGroups: number;
  failedAndDeliveredRows: number;
  failedAndReadRows: number;
  failedAndSentRows: number;
  messageIdPresent: number;
  missingMandatoryColumns: string[];
  rows: number;
  statusCounts: Record<string, number>;
  surveyJsonParseable: number;
  surveyJsonPresent: number;
};

type ValidationResponse = {
  error?: string;
  ok: boolean;
  summary?: TrackingValidationSummary;
};

type ImportSummary = {
  batchId: string | null;
  conflictRows: number;
  fileAlreadyImported: boolean;
  insertedRows: number;
  invalidRows: number;
  messageDuplicateRows: number;
  messageSentRows: number;
  rowsReceived: number;
  rowsTotal: number;
  skippedDuplicateRows: number;
  sourceDuplicateRows: number;
  status: string | null;
  trackingStatusCounts: Record<string, number>;
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
  { label: "Importar seguimiento", status: "controlado", tone: "warning" as BadgeTone },
  { label: "Cruzar con carritos", status: "pendiente", tone: "neutral" as BadgeTone },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function shortBatchId(batchId: string | null) {
  return batchId ? batchId.slice(0, 8) : "sin batch";
}

function errorMessageForStatus(status: number, fallback: string) {
  if (status === 401 || status === 403) {
    return "No tienes permisos para cargar seguimiento. Ingresa con un usuario administrador.";
  }

  if (status === 413) {
    return "El archivo supera el limite permitido de 30 MB.";
  }

  if (status === 400) {
    return fallback || "Revisa que el archivo exista y tenga formato CSV.";
  }

  return fallback || "No se pudo procesar el archivo. Intenta nuevamente.";
}

function countValue(counts: Record<string, number> | undefined, key: string) {
  return formatNumber(counts?.[key] ?? 0);
}

function topCounts(counts: Record<string, number> | undefined) {
  return Object.entries(counts ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5);
}

export function TrackingUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<TrackingValidationSummary | null>(null);
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
        { label: "Id_Mensaje presentes", value: "-" },
        { label: "Duplicados Id_Mensaje", value: "-" },
        { label: "Telefonos cliente normalizables", value: "-" },
        { label: "Telefonos negocio normalizables", value: "-" },
        { label: "Json_Encuesta presente", value: "-" },
        { label: "Json_Encuesta parseable", value: "-" },
      ];
    }

    return [
      { label: "Filas", value: formatNumber(summary.rows) },
      { label: "Columnas", value: formatNumber(summary.columns) },
      { label: "Columnas obligatorias faltantes", value: formatNumber(summary.missingMandatoryColumns.length) },
      { label: "Id_Mensaje presentes", value: formatNumber(summary.messageIdPresent) },
      { label: "Duplicados Id_Mensaje", value: formatNumber(summary.duplicateMessageIdGroups) },
      {
        label: "Telefonos cliente normalizables",
        value: `${formatNumber(summary.clientPhonesNormalizable)} / ${formatNumber(summary.clientPhonesTotal)}`,
      },
      {
        label: "Telefonos negocio normalizables",
        value: `${formatNumber(summary.businessPhonesNormalizable)} / ${formatNumber(summary.businessPhonesTotal)}`,
      },
      { label: "Json_Encuesta presente", value: formatNumber(summary.surveyJsonPresent) },
      { label: "Json_Encuesta parseable", value: formatNumber(summary.surveyJsonParseable) },
    ];
  }, [summary]);

  const statusCounts = useMemo(() => {
    const counts = summary?.statusCounts ?? {};

    return [
      { label: "read", tone: "success" as BadgeTone, value: countValue(counts, "read") },
      { label: "delivered", tone: "info" as BadgeTone, value: countValue(counts, "delivered") },
      { label: "sent", tone: "warning" as BadgeTone, value: countValue(counts, "sent") },
      { label: "failed", tone: "danger" as BadgeTone, value: countValue(counts, "failed") },
      { label: "unknown", tone: "neutral" as BadgeTone, value: countValue(counts, "unknown") },
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

      const response = await fetch("/api/recuperacion/seguimiento/validar", {
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
      setError("No se pudo conectar con el validador. Revisa la conexion o intenta nuevamente.");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleImport() {
    if (!selectedFile || !summary) {
      setImportError("Valida un archivo CSV antes de importar seguimiento.");
      return;
    }

    const confirmed = window.confirm(
      "Esta accion guardara el seguimiento WhatsApp normalizado en staging de recuperacion.\n" +
        "No se guardara Json_Encuesta, telefonos raw, payloads ni el CSV completo.\n" +
        "Confirmar importacion de seguimiento?",
    );

    if (!confirmed) {
      return;
    }

    setImportError(null);
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/seguimiento/importar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.ok || !payload.summary) {
        setImportError(errorMessageForStatus(response.status, payload.error ?? ""));
        return;
      }

      setImportSummary({
        ...payload.summary,
        batchId: payload.batchId ?? payload.summary.batchId ?? null,
      });
    } catch {
      setImportError("No se pudo conectar con el importador. Revisa la conexion o intenta nuevamente.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga Seguimiento WhatsApp</h2>
            <ValueBadge tone="warning">Validacion e importacion real</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube el CSV de n8n Seguimiento para saber si los mensajes fueron enviados, entregados, leidos o
            fallidos.
          </p>
        </div>
        <ValueBadge tone="info">Fuente n8n</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#9bcbdc] bg-[#f7fbfd] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#c5dce7] bg-white text-sea">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo Seguimiento</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado: <span className="font-medium text-navy">Seguimiento.csv</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Limite actual: 30 MB. Solo CSV.</p>
            {selectedFile ? (
              <div className="mt-4 rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm">
                <p className="font-medium text-navy">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-slate-500">Tamano aproximado: {formatFileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm text-slate-500">
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
                <CheckCircle2 className="h-4 w-4" />
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
                Validacion completada. El preview no muestra telefonos, Id_Mensaje ni contenido de encuestas.
              </p>
            ) : null}
            {importSummary ? (
              <p className="mt-3 rounded-lg border border-[#bfe5d2] bg-[#f1fbf6] px-3 py-2 text-sm leading-5 text-[#166534]">
                Seguimiento importado en staging. Batch: {shortBatchId(importSummary.batchId)}.
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
                No se muestran telefonos completos, Id_Mensaje, Json_Encuesta, payloads, filas crudas ni
                mensajes personales. Solo agregados seguros.
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
                    ? "Resultado real de validacion. No corresponde a una importacion."
                    : "Selecciona un CSV y validalo para ver el resumen real."}
                </p>
              </div>
              <ValueBadge tone={summary ? "success" : "warning"}>{summary ? "Validado" : "Pendiente"}</ValueBadge>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">tracking_status</h3>
              <div className="mt-3 grid gap-2">
                {statusCounts.map((item) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-2"
                    key={item.label}
                  >
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <ValueBadge tone={item.tone}>{item.value}</ValueBadge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Inconsistencias</h3>
              <div className="mt-3 grid gap-2">
                <MetricRow label="failed + read" value={summary ? formatNumber(summary.failedAndReadRows) : "-"} />
                <MetricRow
                  label="failed + delivered"
                  value={summary ? formatNumber(summary.failedAndDeliveredRows) : "-"}
                />
                <MetricRow label="failed + sent" value={summary ? formatNumber(summary.failedAndSentRows) : "-"} />
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Categorias</h3>
              <div className="mt-3 grid gap-2">
                {topCounts(summary?.categoryCounts).length > 0 ? (
                  topCounts(summary?.categoryCounts).map(([label, value]) => (
                    <MetricRow key={label} label={label} value={formatNumber(value)} />
                  ))
                ) : (
                  <MetricRow label="Sin resumen" value="-" />
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
            <h3 className="text-sm font-medium text-navy">Tipo_Cobro</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {topCounts(summary?.chargeTypeCounts).length > 0 ? (
                topCounts(summary?.chargeTypeCounts).map(([label, value]) => (
                  <MetricRow key={label} label={label} value={formatNumber(value)} />
                ))
              ) : (
                <MetricRow label="Sin resumen" value="-" />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-[#86510d]">
                  <Database className="h-4 w-4" />
                  <h3 className="text-sm font-medium">Importar seguimiento</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#86510d]">
                  Guarda estados normalizados de WhatsApp en staging. No almacena Json_Encuesta ni telefonos raw.
                </p>
                {importSummary ? (
                  <div className="mt-3 grid gap-1 rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-xs leading-5 text-[#86510d] sm:grid-cols-2">
                    <p>Batch: {shortBatchId(importSummary.batchId)}</p>
                    <p>Status: {importSummary.status ?? "-"}</p>
                    <p>Filas recibidas: {formatNumber(importSummary.rowsReceived)}</p>
                    <p>Insertadas: {formatNumber(importSummary.insertedRows)}</p>
                    <p>Duplicadas omitidas: {formatNumber(importSummary.skippedDuplicateRows)}</p>
                    <p>Duplicadas source: {formatNumber(importSummary.sourceDuplicateRows)}</p>
                    <p>Duplicadas mensaje: {formatNumber(importSummary.messageDuplicateRows)}</p>
                    <p>Conflictos: {formatNumber(importSummary.conflictRows)}</p>
                    <p>Invalidas: {formatNumber(importSummary.invalidRows)}</p>
                    <p>Con sent_at: {formatNumber(importSummary.messageSentRows)}</p>
                    <p>Read: {countValue(importSummary.trackingStatusCounts, "read")}</p>
                    <p>Delivered: {countValue(importSummary.trackingStatusCounts, "delivered")}</p>
                    <p>Sent: {countValue(importSummary.trackingStatusCounts, "sent")}</p>
                    <p>Failed: {countValue(importSummary.trackingStatusCounts, "failed")}</p>
                    {importSummary.fileAlreadyImported ? <p>Archivo ya importado anteriormente.</p> : null}
                  </div>
                ) : null}
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] disabled:opacity-55"
                disabled={!canImport}
                onClick={handleImport}
                type="button"
              >
                <MessageCircle className="h-4 w-4" />
                {isImporting ? "Importando..." : "Importar seguimiento"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-2">
      <span className="truncate text-sm text-slate-700">{label}</span>
      <ValueBadge tone="neutral">{value}</ValueBadge>
    </div>
  );
}
