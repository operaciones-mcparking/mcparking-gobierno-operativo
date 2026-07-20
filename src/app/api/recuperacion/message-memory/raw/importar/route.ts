import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { validateMessageMemoryCsv } = requireFromRoute(
  "../../../../../../../scripts/recovery/message-memory-csv-validator.js",
) as {
  validateMessageMemoryCsv: (csvContent: string) => MessageMemoryCsvReport;
};
const { parseCsv } = requireFromRoute("../../../../../../../scripts/recovery/purchases-csv-validator.js") as {
  parseCsv: (csvContent: string) => { rows: Array<Record<string, string>> };
};
const { normalizePhone, parseDateSafe } = requireFromRoute(
  "../../../../../../../scripts/recovery/recovery-normalizers.js",
) as {
  normalizePhone: (raw: unknown) => string | null;
  parseDateSafe: (raw: unknown) => Date | null;
};

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;
const MESSAGE_MEMORY_RAW_IMPORT_CHUNK_SIZE = 1000;

type CountRow = {
  count: number;
  value: string;
};

type TextSummarySensitivity = {
  averageLength: number;
  maxLength: number;
  possibleEmails: number;
  possiblePhones: number;
  possibleRuts: number;
  urls: number;
};

type MessageMemoryCsvReport = {
  apiPhoneNormalizable: number;
  apiPhonePresent: number;
  chatStateCounts: CountRow[];
  columns: number;
  conversationIdPresent: number;
  duplicateRowHashGroups: number;
  intentCategoryCounts: CountRow[];
  maxMessageAt: Date | null;
  messageBoundTypeCounts: CountRow[];
  messagePresent: number;
  messageSentimentCounts: CountRow[];
  messageTypeCounts: CountRow[];
  minMessageAt: Date | null;
  missingMandatory: string[];
  rawDuplicateRowHashGroups: number;
  rawImportableRows: number;
  rawRowHashPresent: number;
  rawSkippedRows: {
    missingConversationId: number;
    missingMessageAt: number;
    missingMessageText: number;
    missingRowHash: number;
    missingWaIdNormalized: number;
  };
  rows: number;
  textSummaryPresent: number;
  textSummarySensitivity: TextSummarySensitivity;
  uniqueConversationIds: number;
  waIdNormalizable: number;
  waIdPresent: number;
};

type MessageMemoryRawImportRow = {
  api_phone_normalized: string | null;
  chat_state: string | null;
  conversation_id: string;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_text: string;
  message_type: string | null;
  row_hash: string;
  wa_id_normalized: string;
};

type ImportRpcResult = {
  batchId?: string;
  conflictRows?: number;
  fileAlreadyImported?: boolean;
  insertedRows?: number;
  invalidRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  rowsTotal?: number;
  skippedDuplicateRows?: number;
  status?: string;
};

type StartImportRpcResult = {
  batchId?: string;
  fileAlreadyImported?: boolean;
  ok?: boolean;
  status?: string;
};

type ChunkImportRpcResult = {
  conflictRows?: number;
  insertedRows?: number;
  invalidRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  skippedDuplicateRows?: number;
  status?: string;
};

type FinishImportRpcResult = {
  batchId?: string;
  conflictRows?: number;
  insertedRows?: number;
  invalidRows?: number;
  ok?: boolean;
  skippedDuplicateRows?: number;
  status?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError(error.message, 500), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403), ok: false as const };
  }

  return { ok: true as const, supabase };
}

function countsToRecord(counts: CountRow[]) {
  return Object.fromEntries(counts.map((item) => [item.value, item.count]));
}

function dateToIso(date: Date | null) {
  return date ? date.toISOString() : null;
}

function cleanText(raw: unknown) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
}

function normalizeCategory(raw: unknown) {
  const value = cleanText(raw);

  return value ? value.toLowerCase() : null;
}

function parseTimestampSafe(raw: unknown) {
  const value = cleanText(raw);

  if (!value) return null;

  if (/^\d{10}$/.test(value)) {
    const date = new Date(Number(value) * 1000);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{13}$/.test(value)) {
    const date = new Date(Number(value));

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return parseDateSafe(value);
}

function dateTimeValue(raw: unknown) {
  const date = parseTimestampSafe(raw);

  return date ? date.toISOString() : null;
}

function normalizeMessagingPhone(raw: unknown) {
  if (raw === null || raw === undefined) return null;

  const digits = String(raw).replace(/\D/g, "");

  return digits.length >= 8 ? digits : null;
}

function hashNormalizedRow(row: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function buildRawImportRow(row: Record<string, string>): MessageMemoryRawImportRow | null {
  const normalized = {
    api_phone_normalized: normalizePhone(row.api_phone),
    chat_state: normalizeCategory(row.chat_state),
    conversation_id: cleanText(row.conversation_id),
    intent_category: normalizeCategory(row.intent_category),
    message_at: dateTimeValue(row.timestamp),
    message_bound_type: normalizeCategory(row.message_bound_type),
    message_sentiment: normalizeCategory(row.message_sentiment),
    message_text: cleanText(row.Message),
    message_type: normalizeCategory(row.message_type),
    wa_id_normalized: normalizeMessagingPhone(row.wa_id),
  };
  const rowHash = hashNormalizedRow({
    chat_state: normalized.chat_state,
    conversation_id: normalized.conversation_id,
    intent_category: normalized.intent_category,
    message_at: normalized.message_at,
    message_bound_type: normalized.message_bound_type,
    message_sentiment: normalized.message_sentiment,
    message_text: normalized.message_text,
    message_type: normalized.message_type,
    wa_id_normalized: normalized.wa_id_normalized,
  });

  if (
    !normalized.conversation_id ||
    !normalized.wa_id_normalized ||
    !normalized.message_at ||
    !normalized.message_text ||
    !rowHash
  ) {
    return null;
  }

  return {
    api_phone_normalized: normalized.api_phone_normalized,
    chat_state: normalized.chat_state,
    conversation_id: normalized.conversation_id,
    intent_category: normalized.intent_category,
    message_at: normalized.message_at,
    message_bound_type: normalized.message_bound_type,
    message_sentiment: normalized.message_sentiment,
    message_text: normalized.message_text,
    message_type: normalized.message_type,
    row_hash: rowHash,
    wa_id_normalized: normalized.wa_id_normalized,
  };
}

function validationSummary(report: MessageMemoryCsvReport) {
  return {
    apiPhonesNormalizable: report.apiPhoneNormalizable,
    apiPhonesPresent: report.apiPhonePresent,
    chatStateCounts: countsToRecord(report.chatStateCounts),
    columns: report.columns,
    conversationIdPresent: report.conversationIdPresent,
    duplicateRowHashGroups: report.duplicateRowHashGroups,
    intentCategoryCounts: countsToRecord(report.intentCategoryCounts),
    maxMessageAt: dateToIso(report.maxMessageAt),
    messageBoundTypeCounts: countsToRecord(report.messageBoundTypeCounts),
    messagePresent: report.messagePresent,
    messageSentimentCounts: countsToRecord(report.messageSentimentCounts),
    messageTypeCounts: countsToRecord(report.messageTypeCounts),
    minMessageAt: dateToIso(report.minMessageAt),
    missingMandatoryColumns: report.missingMandatory,
    rawDuplicateRowHashGroups: report.rawDuplicateRowHashGroups,
    rawImportableRows: report.rawImportableRows,
    rawRowHashPresent: report.rawRowHashPresent,
    rawSkippedRows: report.rawSkippedRows,
    rows: report.rows,
    textSummaryPresent: report.textSummaryPresent,
    textSummarySensitivity: report.textSummarySensitivity,
    uniqueConversationIds: report.uniqueConversationIds,
    waIdNormalizable: report.waIdNormalizable,
    waIdPresent: report.waIdPresent,
  };
}

function rpcSummary(report: MessageMemoryCsvReport) {
  return {
    chatStateCounts: countsToRecord(report.chatStateCounts),
    columnsTotal: report.columns,
    intentCategoryCounts: countsToRecord(report.intentCategoryCounts),
    messageBoundTypeCounts: countsToRecord(report.messageBoundTypeCounts),
    messageSentimentCounts: countsToRecord(report.messageSentimentCounts),
    messageTypeCounts: countsToRecord(report.messageTypeCounts),
    missingMandatoryColumns: report.missingMandatory,
    rawRowHashDuplicateGroups: report.rawDuplicateRowHashGroups,
    rowsTotal: report.rows,
  };
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function emptyImportSummary(): ImportRpcResult {
  return {
    conflictRows: 0,
    insertedRows: 0,
    invalidRows: 0,
    rowsReceived: 0,
    skippedDuplicateRows: 0,
  };
}

function safeErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");
  const normalized = message.trim();

  if (!normalized || normalized === "[object Object]" || normalized.length > 500 || /<html|<!doctype|cloudflare/i.test(normalized)) {
    return "No se pudo completar la importacion por timeout o error de proveedor. Intenta nuevamente o baja el tamano del chunk.";
  }

  return normalized;
}

function safeImportSummary(result: ImportRpcResult) {
  return {
    batchId: result.batchId ?? null,
    conflictRows: result.conflictRows ?? 0,
    fileAlreadyImported: result.fileAlreadyImported === true,
    insertedRows: result.insertedRows ?? 0,
    invalidRows: result.invalidRows ?? 0,
    rowsReceived: result.rowsReceived ?? 0,
    rowsTotal: result.rowsTotal ?? 0,
    skippedDuplicateRows: result.skippedDuplicateRows ?? 0,
    status: result.status ?? null,
  };
}

async function appendRawChunk(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  batchId: string,
  chunk: MessageMemoryRawImportRow[],
) {
  const { data, error } = await supabase.rpc("append_recovery_whatsapp_message_memory_raw_import_rows", {
    p_batch_id: batchId,
    p_rows: chunk,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== "object") {
    throw new Error("Un chunk de importacion raw no devolvio un resumen valido.");
  }

  return data as ChunkImportRpcResult;
}

function addChunkResult(accumulated: ImportRpcResult, chunkResult: ChunkImportRpcResult) {
  accumulated.conflictRows = (accumulated.conflictRows ?? 0) + (chunkResult.conflictRows ?? 0);
  accumulated.insertedRows = (accumulated.insertedRows ?? 0) + (chunkResult.insertedRows ?? 0);
  accumulated.invalidRows = (accumulated.invalidRows ?? 0) + (chunkResult.invalidRows ?? 0);
  accumulated.rowsReceived = (accumulated.rowsReceived ?? 0) + (chunkResult.rowsReceived ?? 0);
  accumulated.skippedDuplicateRows =
    (accumulated.skippedDuplicateRows ?? 0) + (chunkResult.skippedDuplicateRows ?? 0);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("Debes enviar un archivo CSV en el campo file.", 400);
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return jsonError("Solo se aceptan archivos .csv en esta etapa.", 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError("El archivo supera el limite inicial de 30 MB.", 413);
  }

  let csvContent: string;
  let report: MessageMemoryCsvReport;
  let fileHash: string;

  try {
    csvContent = await file.text();
    report = validateMessageMemoryCsv(csvContent);
    fileHash = hashContent(csvContent);
  } catch (error) {
    return jsonError(safeErrorMessage(error), 500);
  }

  const summary = rpcSummary(report);
  const validation = validationSummary(report);
  const chunksTotal = Math.ceil(report.rawImportableRows / MESSAGE_MEMORY_RAW_IMPORT_CHUNK_SIZE);
  let batchId: string | null = null;

  try {
    const { data: startData, error: startError } = await admin.supabase.rpc(
      "start_recovery_whatsapp_message_memory_raw_import",
      {
        p_file_hash: fileHash,
        p_file_name: file.name,
        p_file_size: file.size,
        p_summary: summary,
      },
    );

    if (startError) {
      return jsonError(safeErrorMessage(startError), 500);
    }

    if (!startData || typeof startData !== "object") {
      return jsonError("La importacion raw no devolvio un inicio valido.", 500);
    }

    const startResult = startData as StartImportRpcResult;
    batchId = startResult.batchId ?? null;

    if (!batchId) {
      return jsonError("La importacion raw no devolvio un batch valido.", 500);
    }

    if (startResult.fileAlreadyImported === true) {
      const importResult = safeImportSummary({
        ...emptyImportSummary(),
        batchId,
        fileAlreadyImported: true,
        rowsTotal: report.rows,
        status: startResult.status ?? "imported",
      });

      return NextResponse.json({
        batchId,
        chunkSize: MESSAGE_MEMORY_RAW_IMPORT_CHUNK_SIZE,
        chunksTotal: 0,
        conflictRows: importResult.conflictRows,
        fileAlreadyImported: true,
        fileHash: fileHash.slice(0, 12),
        fileName: file.name,
        insertedRows: importResult.insertedRows,
        invalidRows: importResult.invalidRows,
        ok: true,
        rowsReceived: importResult.rowsReceived,
        skippedDuplicateRows: importResult.skippedDuplicateRows,
        status: importResult.status,
        summary: importResult,
        validation,
      });
    }

    const accumulated = emptyImportSummary();
    const currentChunk: MessageMemoryRawImportRow[] = [];
    const { rows: csvRows } = parseCsv(csvContent);

    for (const csvRow of csvRows) {
      const normalizedRow = buildRawImportRow(csvRow);

      if (!normalizedRow) {
        continue;
      }

      currentChunk.push(normalizedRow);

      if (currentChunk.length >= MESSAGE_MEMORY_RAW_IMPORT_CHUNK_SIZE) {
        const chunkResult = await appendRawChunk(admin.supabase, batchId, currentChunk);
        addChunkResult(accumulated, chunkResult);
        currentChunk.length = 0;
      }
    }

    if (currentChunk.length > 0) {
      const chunkResult = await appendRawChunk(admin.supabase, batchId, currentChunk);
      addChunkResult(accumulated, chunkResult);
    }

    const { data: finishData, error: finishError } = await admin.supabase.rpc(
      "finish_recovery_whatsapp_message_memory_raw_import",
      {
        p_batch_id: batchId,
      },
    );

    if (finishError) {
      throw finishError;
    }

    if (!finishData || typeof finishData !== "object") {
      throw new Error("La importacion raw no devolvio un cierre valido.");
    }

    const finishResult = finishData as FinishImportRpcResult;
    const importResult = safeImportSummary({
      ...accumulated,
      batchId,
      conflictRows: finishResult.conflictRows ?? accumulated.conflictRows,
      insertedRows: finishResult.insertedRows ?? accumulated.insertedRows,
      invalidRows: finishResult.invalidRows ?? accumulated.invalidRows,
      rowsTotal: report.rows,
      skippedDuplicateRows: finishResult.skippedDuplicateRows ?? accumulated.skippedDuplicateRows,
      status: finishResult.status ?? "imported",
    });

    return NextResponse.json({
      batchId,
      chunkSize: MESSAGE_MEMORY_RAW_IMPORT_CHUNK_SIZE,
      chunksTotal,
      conflictRows: importResult.conflictRows,
      fileAlreadyImported: false,
      fileHash: fileHash.slice(0, 12),
      fileName: file.name,
      insertedRows: importResult.insertedRows,
      invalidRows: importResult.invalidRows,
      ok: true,
      rowsReceived: importResult.rowsReceived,
      skippedDuplicateRows: importResult.skippedDuplicateRows,
      status: importResult.status,
      summary: importResult,
      validation,
    });
  } catch (error) {
    const message = safeErrorMessage(error);

    if (batchId) {
      await admin.supabase.rpc("fail_recovery_whatsapp_message_memory_raw_import", {
        p_batch_id: batchId,
        p_error_message: message,
      });
    }

    return jsonError(message, 500);
  }
}
