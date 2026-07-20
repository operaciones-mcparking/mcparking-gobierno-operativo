"use client";

import { CheckCircle2, Database, FileSpreadsheet, MessageSquareText, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";

type TextSummarySensitivity = {
  averageLength: number;
  maxLength: number;
  possibleEmails: number;
  possiblePhones: number;
  possibleRuts: number;
  urls: number;
};

type MessageMemoryValidationSummary = {
  apiPhonesNormalizable: number;
  apiPhonesPresent: number;
  chatStateCounts: Record<string, number>;
  columns: number;
  conversationIdPresent: number;
  duplicateRowHashGroups: number;
  intentCategoryCounts: Record<string, number>;
  maxMessageAt: string | null;
  messageBoundTypeCounts: Record<string, number>;
  messagePresent: number;
  messageSentimentCounts: Record<string, number>;
  messageTypeCounts: Record<string, number>;
  minMessageAt: string | null;
  missingMandatoryColumns: string[];
  rowHashPresent: number;
  rows: number;
  textSummaryPresent: number;
  textSummarySensitivity: TextSummarySensitivity;
  timestampParseable: number;
  uniqueConversationIds: number;
  waIdNormalizable: number;
  waIdPresent: number;
};

type ValidationResponse = {
  error?: string;
  ok: boolean;
  summary?: MessageMemoryValidationSummary;
};

type ImportSummary = {
  batchId: string | null;
  conflictRows: number;
  fileAlreadyImported: boolean;
  insertedRows: number;
  invalidRows: number;
  rowsReceived: number;
  rowsTotal: number;
  skippedDuplicateRows: number;
  status: string | null;
};

type ImportResponse = {
  batchId?: string | null;
  error?: string;
  ok: boolean;
  summary?: ImportSummary;
  chunkSize?: number;
  chunksTotal?: number;
};

type SafeApiPayload = {
  error?: string;
  ok?: boolean;
};

const steps = [
  { label: "Subir CSV", status: "disponible", tone: "info" as BadgeTone },
  { label: "Validar archivo", status: "disponible", tone: "info" as BadgeTone },
  { label: "Revisar preview", status: "seguro", tone: "warning" as BadgeTone },
  { label: "Importar memoria", status: "por chunks", tone: "warning" as BadgeTone },
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

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function shortBatchId(batchId: string | null) {
  return batchId ? batchId.slice(0, 8) : "sin batch";
}

function errorMessageForStatus(status: number, fallback: string) {
  if (status === 401 || status === 403) {
    return "No tienes permisos para cargar Message Memory. Ingresa con un usuario administrador.";
  }

  if (status === 413) {
    return "El archivo supera el limite permitido de 30 MB.";
  }

  if (status === 400) {
    return fallback || "Revisa que el archivo exista y tenga formato CSV.";
  }

  return fallback || "No se pudo procesar el archivo. Intenta nuevamente.";
}

async function readSafeJsonResponse<T extends SafeApiPayload>(response: Response) {
  const text = await response.text();

  if (!text) {
    return {
      data: null,
      error: `HTTP ${response.status}: respuesta vacia del servidor.`,
    };
  }

  try {
    return {
      data: JSON.parse(text) as T,
      error: null,
    };
  } catch {
    const shortText = /<html|<!doctype/i.test(text)
      ? "El servidor devolvio HTML en vez de JSON."
      : text.slice(0, 180);

    return {
      data: null,
      error: `HTTP ${response.status}: ${shortText}`,
    };
  }
}

function safeHttpError(status: number, fallback: string) {
  const message = errorMessageForStatus(status, fallback);

  return `HTTP ${status}: ${message}`;
}

function countValue(counts: Record<string, number> | undefined, key: string) {
  return formatNumber(counts?.[key] ?? 0);
}

function topCounts(counts: Record<string, number> | undefined, limit = 6) {
  return Object.entries(counts ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit);
}

export function MessageMemoryUploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<MessageMemoryValidationSummary | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [rawImportSummary, setRawImportSummary] = useState<ImportSummary | null>(null);
  const [chunksTotal, setChunksTotal] = useState<number | null>(null);
  const [rawChunksTotal, setRawChunksTotal] = useState<number | null>(null);
  const [chunkSize, setChunkSize] = useState<number | null>(null);
  const [rawChunkSize, setRawChunkSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [rawImportError, setRawImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const canImport = Boolean(selectedFile && summary && !error && !isValidating && !isImporting);

  const previewMetrics = useMemo(() => {
    if (!summary) {
      return [
        { label: "Filas", value: "-" },
        { label: "Columnas", value: "-" },
        { label: "Columnas obligatorias faltantes", value: "-" },
        { label: "conversation_id presentes", value: "-" },
        { label: "conversation_id unicos", value: "-" },
        { label: "wa_id normalizables", value: "-" },
        { label: "api_phone normalizables", value: "-" },
        { label: "timestamp parseable", value: "-" },
        { label: "Rango timestamp", value: "-" },
        { label: "Message presente", value: "-" },
        { label: "text_summary presente", value: "-" },
        { label: "row_hash presentes", value: "-" },
        { label: "Duplicados row_hash", value: "-" },
      ];
    }

    return [
      { label: "Filas", value: formatNumber(summary.rows) },
      { label: "Columnas", value: formatNumber(summary.columns) },
      { label: "Columnas obligatorias faltantes", value: formatNumber(summary.missingMandatoryColumns.length) },
      { label: "conversation_id presentes", value: formatNumber(summary.conversationIdPresent) },
      { label: "conversation_id unicos", value: formatNumber(summary.uniqueConversationIds) },
      {
        label: "wa_id normalizables",
        value: `${formatNumber(summary.waIdNormalizable)} / ${formatNumber(summary.rows)}`,
      },
      {
        label: "api_phone normalizables",
        value: `${formatNumber(summary.apiPhonesNormalizable)} / ${formatNumber(summary.rows)}`,
      },
      {
        label: "timestamp parseable",
        value: `${formatNumber(summary.timestampParseable)} / ${formatNumber(summary.rows)}`,
      },
      { label: "Rango timestamp", value: `${formatDate(summary.minMessageAt)} - ${formatDate(summary.maxMessageAt)}` },
      { label: "Message presente", value: formatNumber(summary.messagePresent) },
      { label: "text_summary presente", value: formatNumber(summary.textSummaryPresent) },
      { label: "row_hash presentes", value: formatNumber(summary.rowHashPresent) },
      { label: "Duplicados row_hash", value: formatNumber(summary.duplicateRowHashGroups) },
    ];
  }, [summary]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setError(null);
    setImportError(null);
    setRawImportError(null);
    setSummary(null);
    setImportSummary(null);
    setRawImportSummary(null);
    setChunksTotal(null);
    setRawChunksTotal(null);
    setChunkSize(null);
    setRawChunkSize(null);
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
    setRawImportError(null);
    setSummary(null);
    setImportSummary(null);
    setRawImportSummary(null);
    setChunksTotal(null);
    setRawChunksTotal(null);
    setChunkSize(null);
    setRawChunkSize(null);
    setIsValidating(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/recuperacion/message-memory/validar", {
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

  async function importMessageMemoryStage(endpoint: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(endpoint, {
      body: formData,
      method: "POST",
    });
    const { data: payload, error: parseError } = await readSafeJsonResponse<ImportResponse>(response);

    if (parseError || !payload) {
      return {
        error: parseError ?? `HTTP ${response.status}: respuesta invalida del importador.`,
        payload: null,
      };
    }

    if (!response.ok || !payload.ok || !payload.summary) {
      return {
        error: safeHttpError(response.status, payload.error ?? ""),
        payload: null,
      };
    }

    return { error: null, payload };
  }

  async function handleImportComplete() {
    if (!selectedFile || !summary) {
      setImportError("Valida un archivo CSV antes de importar memoria completa.");
      return;
    }

    const confirmed = window.confirm(
      "Esta accion importara metadata segura y texto real admin-only para Ver chat.\n" +
        "No se mostraran mensajes, text_summary, telefonos, payloads ni filas crudas en los resultados.\n" +
        "Confirmar importacion de memoria completa?",
    );

    if (!confirmed) {
      return;
    }

    setImportError(null);
    setRawImportError(null);
    setImportSummary(null);
    setRawImportSummary(null);
    setChunksTotal(null);
    setRawChunksTotal(null);
    setChunkSize(null);
    setRawChunkSize(null);
    setIsImporting(true);

    try {
      const metadataResult = await importMessageMemoryStage("/api/recuperacion/message-memory/importar", selectedFile);

      if (metadataResult.error || !metadataResult.payload?.summary) {
        setImportError(metadataResult.error ?? "No se pudo importar metadata segura.");
        return;
      }

      setImportSummary({
        ...metadataResult.payload.summary,
        batchId: metadataResult.payload.batchId ?? metadataResult.payload.summary.batchId ?? null,
      });
      setChunksTotal(metadataResult.payload.chunksTotal ?? null);
      setChunkSize(metadataResult.payload.chunkSize ?? null);

      const rawResult = await importMessageMemoryStage("/api/recuperacion/message-memory/raw/importar", selectedFile);

      if (rawResult.error || !rawResult.payload?.summary) {
        setRawImportError(`Metadata importada, pero fallo chat raw: ${rawResult.error ?? "error desconocido"}`);
        return;
      }

      setRawImportSummary({
        ...rawResult.payload.summary,
        batchId: rawResult.payload.batchId ?? rawResult.payload.summary.batchId ?? null,
      });
      setRawChunksTotal(rawResult.payload.chunksTotal ?? null);
      setRawChunkSize(rawResult.payload.chunkSize ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      setImportError(`No se pudo conectar con el importador de memoria completa: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-navy">Carga WhatsApp Message Memory</h2>
            <ValueBadge tone="warning">Validacion e importacion real</ValueBadge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Sube el CSV de memoria de conversaciones para analizar intencion, sentimiento y estado del chat sin
            guardar mensajes crudos.
          </p>
        </div>
        <ValueBadge tone="info">Fuente n8n</ValueBadge>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-[#b9d8c9] bg-[#f5fbf8] p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#cbe4d8] bg-white text-[#16704a]">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-navy">Seleccionar archivo Message Memory</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Formato esperado:{" "}
              <span className="font-medium text-navy">Whatsapp BBDD - Message Memory.csv</span>
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
                Validacion completada. El preview no muestra Message, text_summary, telefonos ni filas crudas.
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
                No se muestran Message raw, text_summary raw, telefonos completos, wa_id, api_phone, payloads,
                filas crudas ni CSV completo. Solo agregados seguros.
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
            <CountPanel
              counts={summary?.messageBoundTypeCounts}
              title="message_bound_type"
              tones={{ inbound: "info", outbound: "success" }}
            />
            <CountPanel counts={summary?.messageTypeCounts} title="message_type" />
            <CountPanel counts={summary?.chatStateCounts} title="chat_state" />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">intent_category principales</h3>
              <div className="mt-3 grid gap-2">
                {topCounts(summary?.intentCategoryCounts, 8).length > 0 ? (
                  topCounts(summary?.intentCategoryCounts, 8).map(([label, value]) => (
                    <MetricRow key={label} label={label} value={formatNumber(value)} />
                  ))
                ) : (
                  <MetricRow label="Sin resumen" value="-" />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
              <h3 className="text-sm font-medium text-navy">Sensibilidad text_summary</h3>
              <div className="mt-3 grid gap-2">
                <MetricRow
                  label="Posibles emails"
                  value={summary ? formatNumber(summary.textSummarySensitivity.possibleEmails) : "-"}
                />
                <MetricRow
                  label="Posibles telefonos"
                  value={summary ? formatNumber(summary.textSummarySensitivity.possiblePhones) : "-"}
                />
                <MetricRow
                  label="Posibles RUT"
                  value={summary ? formatNumber(summary.textSummarySensitivity.possibleRuts) : "-"}
                />
                <MetricRow label="URLs" value={summary ? formatNumber(summary.textSummarySensitivity.urls) : "-"} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#ffd6b0] bg-[#fff7ef] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-[#86510d]">
                  <Database className="h-4 w-4" />
                  <h3 className="text-sm font-medium">Importar memoria completa</h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#86510d]">
                  Guarda metadata segura y texto real admin-only para Ver chat. No muestra mensajes en el preview ni
                  en resultados.
                </p>
                {importSummary || rawImportSummary ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <ImportResultPanel
                      chunkSize={chunkSize}
                      chunksTotal={chunksTotal}
                      summary={importSummary}
                      title="Metadata segura"
                    />
                    <ImportResultPanel
                      chunkSize={rawChunkSize}
                      chunksTotal={rawChunksTotal}
                      summary={rawImportSummary}
                      title="Chat real admin-only"
                    />
                  </div>
                ) : null}
                {rawImportError ? (
                  <p className="mt-3 rounded-lg border border-[#f2b8b5] bg-white px-3 py-2 text-xs leading-5 text-[#9a3412]">
                    {rawImportError}
                  </p>
                ) : null}
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e8c394] bg-white px-3 py-2 text-sm font-medium text-[#9a621a] disabled:opacity-55"
                disabled={!canImport}
                onClick={handleImportComplete}
                type="button"
              >
                <MessageSquareText className="h-4 w-4" />
                {isImporting ? "Importando..." : "Importar memoria completa"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CountPanel({
  counts,
  title,
  tones = {},
}: {
  counts: Record<string, number> | undefined;
  title: string;
  tones?: Record<string, BadgeTone>;
}) {
  const entries = topCounts(counts, 5);

  return (
    <div className="rounded-xl border border-[#d6e1ea] bg-white p-4">
      <h3 className="text-sm font-medium text-navy">{title}</h3>
      <div className="mt-3 grid gap-2">
        {entries.length > 0 ? (
          entries.map(([label, value]) => (
            <MetricRow key={label} label={label} tone={tones[label] ?? "neutral"} value={formatNumber(value)} />
          ))
        ) : (
          <MetricRow label="Sin resumen" value="-" />
        )}
      </div>
    </div>
  );
}

function ImportResultPanel({
  chunkSize,
  chunksTotal,
  summary,
  title,
}: {
  chunkSize: number | null;
  chunksTotal: number | null;
  summary: ImportSummary | null;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[#e8c394] bg-white px-3 py-3 text-xs leading-5 text-[#86510d]">
      <h4 className="mb-2 text-sm font-medium text-navy">{title}</h4>
      {summary ? (
        <div className="grid gap-1 sm:grid-cols-2">
          <p>Batch: {shortBatchId(summary.batchId)}</p>
          <p>Status: {summary.status ?? "-"}</p>
          <p>Chunks: {chunksTotal === null ? "-" : formatNumber(chunksTotal)}</p>
          <p>Chunk size: {chunkSize === null ? "-" : formatNumber(chunkSize)}</p>
          <p>Filas recibidas: {formatNumber(summary.rowsReceived)}</p>
          <p>Insertadas: {formatNumber(summary.insertedRows)}</p>
          <p>Duplicadas omitidas: {formatNumber(summary.skippedDuplicateRows)}</p>
          <p>Conflictos: {formatNumber(summary.conflictRows)}</p>
          <p>Invalidas: {formatNumber(summary.invalidRows)}</p>
          {summary.fileAlreadyImported ? <p>Archivo ya importado anteriormente.</p> : null}
        </div>
      ) : (
        <p className="text-slate-500">Pendiente.</p>
      )}
    </div>
  );
}

function MetricRow({ label, tone = "neutral", value }: { label: string; tone?: BadgeTone; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-2">
      <span className="truncate text-sm text-slate-700">{label}</span>
      <ValueBadge tone={tone}>{value}</ValueBadge>
    </div>
  );
}
