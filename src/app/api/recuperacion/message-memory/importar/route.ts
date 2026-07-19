import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { buildMessageMemoryImportRows, validateMessageMemoryCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/message-memory-csv-validator.js",
) as {
  buildMessageMemoryImportRows: (csvContent: string) => MessageMemoryImportRow[];
  validateMessageMemoryCsv: (csvContent: string) => MessageMemoryCsvReport;
};

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;
const MESSAGE_MEMORY_IMPORT_CHUNK_SIZE = 5000;

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
  dayOfWeekCounts: CountRow[];
  delimiter: string;
  duplicateConversationIdGroups: number;
  duplicateRowHashGroups: number;
  extraColumns: string[];
  intentCategoryCounts: CountRow[];
  importableRows: number;
  maxMessageAt: Date | null;
  messageBoundTypeCounts: CountRow[];
  messagePresent: number;
  messageSentimentCounts: CountRow[];
  messageTypeCounts: CountRow[];
  minMessageAt: Date | null;
  missingExpected: string[];
  missingMandatory: string[];
  missingRecommended: string[];
  parseableProcessingTime: number;
  parseableTimestamp: number;
  rowHashPresent: number;
  rows: number;
  rowsWithoutConversationId: number;
  rowsWithoutTimestamp: number;
  rowsWithoutWaId: number;
  skippedRows: {
    missingConversationId: number;
    missingMessageAt: number;
    missingRowHash: number;
    missingWaIdNormalized: number;
  };
  textSummaryPresent: number;
  textSummarySensitivity: TextSummarySensitivity;
  timeOfDayCounts: CountRow[];
  uniqueConversationIds: number;
  waIdNormalizable: number;
  waIdPresent: number;
};

type MessageMemoryImportRow = {
  api_phone_normalized: string | null;
  chat_state: string | null;
  conversation_id: string;
  day_of_week: string | null;
  intent_category: string | null;
  message_at: string;
  message_bound_type: string | null;
  message_sentiment: string | null;
  message_type: string | null;
  processing_time_seconds: number | null;
  row_hash: string;
  time_of_day: string | null;
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

function validationSummary(report: MessageMemoryCsvReport) {
  return {
    apiPhonesNormalizable: report.apiPhoneNormalizable,
    apiPhonesPresent: report.apiPhonePresent,
    chatStateCounts: countsToRecord(report.chatStateCounts),
    columns: report.columns,
    conversationIdPresent: report.conversationIdPresent,
    duplicateRowHashGroups: report.duplicateRowHashGroups,
    intentCategoryCounts: countsToRecord(report.intentCategoryCounts),
    importableRows: report.importableRows,
    maxMessageAt: dateToIso(report.maxMessageAt),
    messageBoundTypeCounts: countsToRecord(report.messageBoundTypeCounts),
    messagePresent: report.messagePresent,
    messageSentimentCounts: countsToRecord(report.messageSentimentCounts),
    messageTypeCounts: countsToRecord(report.messageTypeCounts),
    minMessageAt: dateToIso(report.minMessageAt),
    missingExpectedColumns: report.missingExpected,
    missingMandatoryColumns: report.missingMandatory,
    missingRecommendedColumns: report.missingRecommended,
    rowHashPresent: report.rowHashPresent,
    rows: report.rows,
    skippedRows: report.skippedRows,
    textSummaryPresent: report.textSummaryPresent,
    textSummarySensitivity: report.textSummarySensitivity,
    timestampParseable: report.parseableTimestamp,
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
    rowHashDuplicateGroups: report.duplicateRowHashGroups,
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

function chunkRows(rows: MessageMemoryImportRow[], size: number) {
  const chunks: MessageMemoryImportRow[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
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

  const csvContent = await file.text();
  const report = validateMessageMemoryCsv(csvContent);
  const summary = rpcSummary(report);
  const validation = validationSummary(report);
  const rows = buildMessageMemoryImportRows(csvContent);
  const fileHash = hashContent(csvContent);
  const chunks = chunkRows(rows, MESSAGE_MEMORY_IMPORT_CHUNK_SIZE);
  let batchId: string | null = null;

  try {
    const { data: startData, error: startError } = await admin.supabase.rpc(
      "start_recovery_whatsapp_message_memory_import",
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
      return jsonError("La importacion no devolvio un inicio valido.", 500);
    }

    const startResult = startData as StartImportRpcResult;
    batchId = startResult.batchId ?? null;

    if (!batchId) {
      return jsonError("La importacion no devolvio un batch valido.", 500);
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
        chunkSize: MESSAGE_MEMORY_IMPORT_CHUNK_SIZE,
        chunksTotal: 0,
        fileAlreadyImported: true,
        fileHash: fileHash.slice(0, 12),
        fileName: file.name,
        ok: true,
        status: importResult.status,
        summary: importResult,
        validation,
      });
    }

    const accumulated = emptyImportSummary();

    for (const chunk of chunks) {
      const { data: chunkData, error: chunkError } = await admin.supabase.rpc(
        "append_recovery_whatsapp_message_memory_import_rows",
        {
          p_batch_id: batchId,
          p_rows: chunk,
        },
      );

      if (chunkError) {
        throw chunkError;
      }

      if (!chunkData || typeof chunkData !== "object") {
        throw new Error("Un chunk de importacion no devolvio un resumen valido.");
      }

      const chunkResult = chunkData as ChunkImportRpcResult;

      accumulated.conflictRows = (accumulated.conflictRows ?? 0) + (chunkResult.conflictRows ?? 0);
      accumulated.insertedRows = (accumulated.insertedRows ?? 0) + (chunkResult.insertedRows ?? 0);
      accumulated.invalidRows = (accumulated.invalidRows ?? 0) + (chunkResult.invalidRows ?? 0);
      accumulated.rowsReceived = (accumulated.rowsReceived ?? 0) + (chunkResult.rowsReceived ?? 0);
      accumulated.skippedDuplicateRows =
        (accumulated.skippedDuplicateRows ?? 0) + (chunkResult.skippedDuplicateRows ?? 0);
    }

    const { data: finishData, error: finishError } = await admin.supabase.rpc(
      "finish_recovery_whatsapp_message_memory_import",
      {
        p_batch_id: batchId,
      },
    );

    if (finishError) {
      throw finishError;
    }

    if (!finishData || typeof finishData !== "object") {
      throw new Error("La importacion no devolvio un cierre valido.");
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
      chunkSize: MESSAGE_MEMORY_IMPORT_CHUNK_SIZE,
      chunksTotal: chunks.length,
      file: {
        hash: fileHash.slice(0, 12),
        name: file.name,
        size: file.size,
      },
      fileAlreadyImported: false,
      fileHash: fileHash.slice(0, 12),
      fileName: file.name,
      ok: true,
      status: importResult.status,
      summary: importResult,
      validation,
    });
  } catch (error) {
    const message = safeErrorMessage(error);

    if (batchId) {
      await admin.supabase.rpc("fail_recovery_whatsapp_message_memory_import", {
        p_batch_id: batchId,
        p_error_message: message,
      });
    }

    return jsonError(message, 500);
  }
}
