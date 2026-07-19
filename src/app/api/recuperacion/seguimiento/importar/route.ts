import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { buildTrackingImportRows, validateTrackingCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/tracking-csv-validator.js",
) as {
  buildTrackingImportRows: (csvContent: string) => TrackingImportRow[];
  validateTrackingCsv: (csvContent: string) => TrackingCsvReport;
};

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;
const TRACKING_IMPORT_CHUNK_SIZE = 5000;

type CountRow = {
  count: number;
  value: string;
};

type TrackingCsvReport = {
  businessPhoneNormalizable: number;
  businessPhonePresent: number;
  categoryCounts: CountRow[];
  chargeTypeCounts: CountRow[];
  clientPhoneNormalizable: number;
  clientPhonePresent: number;
  columns: number;
  delimiter: string;
  duplicateIdGroups: number;
  duplicateMessageIdGroups: number;
  extraColumns: string[];
  failedAndDeliveredRows: number;
  failedAndReadRows: number;
  failedAndSentRows: number;
  failedAtParseable: number;
  deliveredAtParseable: number;
  messageIdPresent: number;
  missingExpected: string[];
  missingMandatory: string[];
  missingRecommended: string[];
  parseableCreatedAt: number;
  parseableUpdatedAt: number;
  readAtParseable: number;
  rows: number;
  rowsWithoutMessageId: number;
  rowsWithoutMessageIdAndClientPhone: number;
  sentAtParseable: number;
  statusCounts: CountRow[];
  surveyJsonParseable: number;
  surveyJsonPresent: number;
};

type TrackingImportRow = {
  business_phone_normalized: string | null;
  charge_type: string | null;
  client_phone_normalized: string | null;
  created_at_source: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  message_category: string | null;
  message_id: string;
  read_at: string | null;
  row_hash: string;
  sent_at: string | null;
  source_id: string;
  tracking_status: "read" | "delivered" | "sent" | "failed" | "unknown";
  updated_at_source: string | null;
};

type ImportRpcResult = {
  batchId?: string;
  conflictRows?: number;
  fileAlreadyImported?: boolean;
  insertedRows?: number;
  invalidRows?: number;
  messageDuplicateRows?: number;
  messageSentRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  rowsTotal?: number;
  skippedDuplicateRows?: number;
  sourceDuplicateRows?: number;
  status?: string;
  trackingStatusCounts?: Record<string, number>;
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
  messageDuplicateRows?: number;
  messageSentRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  skippedDuplicateRows?: number;
  sourceDuplicateRows?: number;
  trackingStatusCounts?: Record<string, number>;
};

type FinishImportRpcResult = {
  batchId?: string;
  conflictRows?: number;
  insertedRows?: number;
  invalidRows?: number;
  messageSentRows?: number;
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

function safeSummary(report: TrackingCsvReport) {
  const statusCounts = countsToRecord(report.statusCounts);

  return {
    businessPhonesNormalizable: report.businessPhoneNormalizable,
    businessPhonesPresent: report.businessPhonePresent,
    businessPhonesTotal: report.rows,
    categoryCounts: countsToRecord(report.categoryCounts),
    chargeTypeCounts: countsToRecord(report.chargeTypeCounts),
    clientPhonesNormalizable: report.clientPhoneNormalizable,
    clientPhonesPresent: report.clientPhonePresent,
    clientPhonesTotal: report.rows,
    columns: report.columns,
    columnsTotal: report.columns,
    delimiter: report.delimiter,
    duplicateIdGroups: report.duplicateIdGroups,
    duplicateMessageIdGroups: report.duplicateMessageIdGroups,
    extraColumnsCount: report.extraColumns.length,
    failedAndDeliveredRows: report.failedAndDeliveredRows,
    failedAndReadRows: report.failedAndReadRows,
    failedAndSentRows: report.failedAndSentRows,
    failedAtParseable: report.failedAtParseable,
    deliveredAtParseable: report.deliveredAtParseable,
    messageIdPresent: report.messageIdPresent,
    missingExpectedColumns: report.missingExpected,
    missingMandatory: report.missingMandatory,
    missingMandatoryColumns: report.missingMandatory,
    missingRecommendedColumns: report.missingRecommended,
    parseableCreatedAt: report.parseableCreatedAt,
    parseableUpdatedAt: report.parseableUpdatedAt,
    readAtParseable: report.readAtParseable,
    rows: report.rows,
    rowsTotal: report.rows,
    rowsWithoutMessageId: report.rowsWithoutMessageId,
    rowsWithoutMessageIdAndClientPhone: report.rowsWithoutMessageIdAndClientPhone,
    sentAtParseable: report.sentAtParseable,
    statusCounts,
    surveyJsonParseable: report.surveyJsonParseable,
    surveyJsonPresent: report.surveyJsonPresent,
    trackingStatusCounts: statusCounts,
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
    messageDuplicateRows: 0,
    messageSentRows: 0,
    rowsReceived: 0,
    skippedDuplicateRows: 0,
    sourceDuplicateRows: 0,
    trackingStatusCounts: {},
  };
}

function addTrackingStatusCounts(target: Record<string, number>, source: Record<string, number> | undefined) {
  for (const [status, count] of Object.entries(source ?? {})) {
    target[status] = (target[status] ?? 0) + count;
  }
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
    messageDuplicateRows: result.messageDuplicateRows ?? 0,
    messageSentRows: result.messageSentRows ?? 0,
    rowsReceived: result.rowsReceived ?? 0,
    rowsTotal: result.rowsTotal ?? 0,
    skippedDuplicateRows: result.skippedDuplicateRows ?? 0,
    sourceDuplicateRows: result.sourceDuplicateRows ?? 0,
    status: result.status ?? null,
    trackingStatusCounts: result.trackingStatusCounts ?? {},
  };
}

function chunkRows(rows: TrackingImportRow[], size: number) {
  const chunks: TrackingImportRow[][] = [];

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
  const report = validateTrackingCsv(csvContent);
  const summary = safeSummary(report);
  const rows = buildTrackingImportRows(csvContent);
  const fileHash = hashContent(csvContent);
  const chunks = chunkRows(rows, TRACKING_IMPORT_CHUNK_SIZE);
  let batchId: string | null = null;

  try {
    const { data: startData, error: startError } = await admin.supabase.rpc(
      "start_recovery_whatsapp_tracking_import",
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
        rowsTotal: summary.rows,
        status: startResult.status ?? "imported",
      });

      return NextResponse.json({
        batchId,
        chunkSize: TRACKING_IMPORT_CHUNK_SIZE,
        chunksTotal: 0,
        fileAlreadyImported: true,
        fileHash: fileHash.slice(0, 12),
        fileName: file.name,
        ok: true,
        status: importResult.status,
        summary: importResult,
        validation: summary,
      });
    }

    const accumulated = emptyImportSummary();

    for (const chunk of chunks) {
      const { data: chunkData, error: chunkError } = await admin.supabase.rpc(
        "append_recovery_whatsapp_tracking_import_rows",
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
      accumulated.messageDuplicateRows =
        (accumulated.messageDuplicateRows ?? 0) + (chunkResult.messageDuplicateRows ?? 0);
      accumulated.messageSentRows = (accumulated.messageSentRows ?? 0) + (chunkResult.messageSentRows ?? 0);
      accumulated.rowsReceived = (accumulated.rowsReceived ?? 0) + (chunkResult.rowsReceived ?? 0);
      accumulated.skippedDuplicateRows =
        (accumulated.skippedDuplicateRows ?? 0) + (chunkResult.skippedDuplicateRows ?? 0);
      accumulated.sourceDuplicateRows =
        (accumulated.sourceDuplicateRows ?? 0) + (chunkResult.sourceDuplicateRows ?? 0);
      addTrackingStatusCounts(accumulated.trackingStatusCounts ?? {}, chunkResult.trackingStatusCounts);
    }

    const { data: finishData, error: finishError } = await admin.supabase.rpc(
      "finish_recovery_whatsapp_tracking_import",
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
      messageSentRows: finishResult.messageSentRows ?? accumulated.messageSentRows,
      rowsTotal: summary.rows,
      skippedDuplicateRows: finishResult.skippedDuplicateRows ?? accumulated.skippedDuplicateRows,
      status: finishResult.status ?? "imported",
      trackingStatusCounts: accumulated.trackingStatusCounts,
    });

    return NextResponse.json({
      batchId,
      chunkSize: TRACKING_IMPORT_CHUNK_SIZE,
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
      validation: summary,
    });
  } catch (error) {
    const message = safeErrorMessage(error);

    if (batchId) {
      await admin.supabase.rpc("fail_recovery_whatsapp_tracking_import", {
        p_batch_id: batchId,
        p_error_message: message,
      });
    }

    return jsonError(message, 500);
  }
}
