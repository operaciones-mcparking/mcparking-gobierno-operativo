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

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

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
    return jsonError("El archivo supera el limite inicial de 20 MB.", 413);
  }

  const csvContent = await file.text();
  const report = validateTrackingCsv(csvContent);
  const summary = safeSummary(report);
  const rows = buildTrackingImportRows(csvContent);
  const fileHash = hashContent(csvContent);

  const { data, error } = await admin.supabase.rpc("import_recovery_whatsapp_tracking", {
    p_file_hash: fileHash,
    p_file_name: file.name,
    p_file_size: file.size,
    p_rows: rows,
    p_summary: summary,
  });

  if (error) {
    return jsonError(error.message, 500);
  }

  if (!data || typeof data !== "object") {
    return jsonError("La importacion no devolvio un resumen valido.", 500);
  }

  const importResult = data as ImportRpcResult;

  return NextResponse.json({
    batchId: importResult.batchId ?? null,
    file: {
      hash: fileHash.slice(0, 12),
      name: file.name,
      size: file.size,
    },
    ok: true,
    summary: safeImportSummary(importResult),
    validation: summary,
  });
}
