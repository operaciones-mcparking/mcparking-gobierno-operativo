"use client";

import { CheckCircle2, Database, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import { ImportProgressModal, ImportResultGrid } from "./import-progress-modal";

type ValidationSummary = {
  bookingStatusCounts: Record<string, number>;
  columns: number;
  duplicateBookingNumberGroups: number;
  duplicateIdGroups: number;
  emailsTotal: number;
  emailsValid: number;
  missingMandatoryColumns: string[];
  phonesNormalizable: number;
  phonesTotal: number;
  rows: number;
  validPurchaseAmount: number;
  validPurchaseRows: number;
};

type ValidationResponse = {
  error?: string;
  ok: boolean;
  summary?: ValidationSummary;
};

type ImportSummary = {
  batchId: string | null;
  conflictRows: number;
  fileAlreadyImported: boolean;
  insertedAmount: number;
  insertedRows: number;
  invalidRows: number;
  rowsReceived: number;
  rowsTotal: number;
  skippedDuplicateRows: number;
};

type ImportResponse = {
  batchId?: string | null;
  error?: string;
  ok: boolean;
  summary?: ImportSummary;
};

type ImportModalStatus = "confirm" | "loading" | "success" | "error";

const steps = [
  { label: "Subir CSV", status: "disponible", tone: "info" as BadgeTone },
  { label: "Validar archivo", status: "disponible", tone: "info" as BadgeTone },
  { label: "Revisar preview", status: "seguro", tone: "warning" as BadgeTone },
  { label: "Confirmar importación", status: "disponible", tone: "info" as BadgeTone },
  { label: "Guardar en staging", status: "controlado", tone: "warning" as BadgeTone },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number) {
  return `$${formatNumber(value)}`;
}

function shortBatchId(batchId: string | null) {
  return batchId ? batchId.slice(0, 8) : "sin batch";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function errorMessageForStatus(status: number, fallback: string) {
  if (status === 401 || status === 403) {
    return "No tienes permisos para validar compras. Ingresa con un usuario administrador.";
  }

  if (status === 413) {
    return "El archivo supera el limite permitido para esta validacion.";
  }

  if (status === 400) {
    return fallback || "Revisa que el archivo exista y tenga formato CSV.";
  }

  return fallback || "No se pudo validar el archivo. Intenta nuevamente.";
}

export function PurchasesUploadMock() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [importModalStatus, setImportModalStatus] = useState<ImportModalStatus | null>(null);
  const canImport = Boolean(selectedFile && summary && !error && !isValidating && !isImporting);

  const previewMetrics = useMemo(() => {
    if (!summary) {
      return [
        { label: "Filas", value: "-" },
        { label: "Columnas", value: "-" },
        { label: "Columnas obligatorias faltantes", value: "-" },
        { label: "Compras validas", value: "-" },
        { label: "Monto valido", value: "-" },
        { label: "Emails validos", value: "-" },
        { label: "Telefonos normalizables", value: "-" },
        { label: "Duplicados por Id", value: "-" },
        { label: "Duplicados por Buchungsnummer", value: "-" },
      ];
    }

    return [
      { label: "Filas", value: formatNumber(summary.rows) },
      { label: "Columnas", value: formatNumber(summary.columns) },
      { label: "Columnas obligatorias faltantes", value: formatNumber(summary.missingMandatoryColumns.length) },
      { label: "Compras validas", value: formatNumber(summary.validPurchaseRows) },
      { label: "Monto valido", value: formatCurrency(summary.validPurchaseAmount) },
      { label: "Emails validos", value: `${formatNumber(summary.emailsValid)} / ${formatNumber(summary.emailsTotal)}` },
      {
        label: "Telefonos normalizables",
        value: `${formatNumber(summary.phonesNormalizable)} / ${formatNumber(summary.phonesTotal)}`,
      },
      { label: "Duplicados por Id", value: formatNumber(summary.duplicateIdGroups) },
      {
        label: "Duplicados por Buchungsnummer",
        value: formatNumber(summary.duplicateBookingNumberGroups),
      },
    ];
  }, [summary]);

  const bookingStatusCounts = useMemo(() => {
    const counts = summary?.bookingStatusCounts ?? {};

    return ["1", "2", "8"].map((status) => ({
      label: `BookingStatus ${status}`,
      tone: status === "2" ? ("neutral" as BadgeTone) : ("success" as BadgeTone),
      value: counts[status] === undefined ? "-" : formatNumber(counts[status]),
    }));
  }, [summary]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setError(null);
    setImportError(null);
    setSummary(null);
    setImportSummary(null);
    setImportModalStatus(null);
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
    setImportSummary(null);
    setIsValidating(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/compras/validar", {
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

  function handleImport() {
    if (!selectedFile || !summary) {
      setImportError("Valida un archivo CSV antes de confirmar la importacion.");
      return;
    }

    setImportError(null);
    setImportModalStatus("confirm");
  }

  async function handleConfirmImport() {
    if (!selectedFile || !summary) return;

    setImportError(null);
    setImportModalStatus("loading");
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/compras/importar", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.ok || !payload.summary) {
        const nextError = errorMessageForStatus(response.status, payload.error ?? "");
        setImportError(nextError);
        setImportModalStatus("error");
        return;
      }

      setImportSummary({
        ...payload.summary,
        batchId: payload.batchId ?? payload.summary.batchId ?? null,
      });
      setImportModalStatus("success");
    } catch {
      setImportError("No se pudo conectar con el importador. Revisa la conexion o intenta nuevamente.");
      setImportModalStatus("error");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga de compras</h2>
            <ValueBadge tone="warning">Validacion real - aun no guarda datos</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube un CSV de compras para validar columnas, compras validas y montos antes de importarlo al
            modulo de recuperacion.
          </p>
        </div>
        <ValueBadge tone="info">Solo CSV por ahora</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#9bcbdc] bg-[#f7fbfd] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#c5dce7] bg-white text-sea">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo de compras</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado: <span className="font-medium text-navy">mcp_Buchungen.csv</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Por ahora solo CSV. Excel se evaluara despues.
            </p>
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
                Validacion completada. La vista previa muestra solo agregados seguros.
              </p>
            ) : null}
            {importSummary ? (
              <p className="mt-3 rounded-lg border border-[#bfe5d2] bg-[#f1fbf6] px-3 py-2 text-sm leading-5 text-[#166534]">
                Importación completada en staging. Batch: {importSummary.batchId ?? "sin identificador"}.
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
                No se muestran emails, telefonos, patentes ni filas reales en la vista previa. Solo agregados
                seguros.
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
              <ValueBadge tone={summary ? "success" : "warning"}>
                {summary ? "Validado" : "Pendiente validacion"}
              </ValueBadge>
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

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">BookingStatus</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {bookingStatusCounts.map((status) => (
                  <div className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={status.label}>
                    <p className="text-xs text-slate-500">{status.label}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-medium text-navy">{status.value}</span>
                      <ValueBadge tone={status.tone}>{status.tone === "success" ? "valida" : "no valida"}</ValueBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4 md:w-56">
              <div className="flex items-center gap-2 text-[#86510d]">
                <Database className="h-4 w-4" />
                <h3 className="text-sm font-medium">Importación</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#86510d]">
                Guarda las compras normalizadas en staging. No se almacena el CSV completo ni PII cruda.
              </p>
              {importSummary ? (
                <div className="mt-3 rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-xs leading-5 text-[#86510d]">
                  <p>Filas insertadas: {formatNumber(importSummary.insertedRows)}</p>
                  <p>Duplicadas omitidas: {formatNumber(importSummary.skippedDuplicateRows)}</p>
                  <p>Monto insertado: {formatCurrency(importSummary.insertedAmount)}</p>
                  {importSummary.fileAlreadyImported ? <p>Archivo ya importado anteriormente.</p> : null}
                </div>
              ) : null}
              <button
                className="mt-3 w-full rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] disabled:opacity-55"
                disabled={!canImport}
                onClick={handleImport}
                type="button"
              >
                {isImporting ? "Importando..." : "Confirmar importación"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ImportProgressModal
        confirmLabel="Confirmar importacion"
        description="Guarda las compras normalizadas en staging de recuperacion. No se almacena el CSV completo ni PII cruda."
        errorMessage={importError}
        fileName={selectedFile?.name ?? null}
        importTypeLabel="Compras"
        loadingMessage="Se estan importando las compras..."
        onCancel={() => setImportModalStatus(null)}
        onClose={() => setImportModalStatus(null)}
        onConfirm={handleConfirmImport}
        open={importModalStatus !== null}
        status={importModalStatus ?? "confirm"}
        successMessage="Archivo de compras cargado correctamente"
        title="Confirmar importacion de compras"
      >
        {importModalStatus === "confirm" && summary ? (
          <ImportResultGrid
            items={[
              { label: "Filas archivo", value: formatNumber(summary.rows) },
              { label: "Compras validas", value: formatNumber(summary.validPurchaseRows) },
              { label: "Monto valido", value: formatCurrency(summary.validPurchaseAmount) },
              { label: "Duplicados por Id", value: formatNumber(summary.duplicateIdGroups) },
            ]}
            title="Resumen seguro de validacion"
          />
        ) : null}
        {(importModalStatus === "success" || importModalStatus === "error") && importSummary ? (
          <ImportResultGrid
            items={[
              { label: "Batch", value: shortBatchId(importSummary.batchId) },
              { label: "Filas recibidas", value: formatNumber(importSummary.rowsReceived) },
              { label: "Insertadas", value: formatNumber(importSummary.insertedRows) },
              { label: "Duplicadas omitidas", value: formatNumber(importSummary.skippedDuplicateRows) },
              { label: "Conflictos", value: formatNumber(importSummary.conflictRows) },
              { label: "Invalidas", value: formatNumber(importSummary.invalidRows) },
              { label: "Monto insertado", value: formatCurrency(importSummary.insertedAmount) },
            ]}
            title="Resultado seguro"
          />
        ) : null}
      </ImportProgressModal>
    </section>
  );
}
