import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { buildRecoveryIncompleteBookingImportRows, validateIncompleteBookingsCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/incomplete-bookings-csv-validator.js",
) as {
  buildRecoveryIncompleteBookingImportRows: (csvContent: string) => RecoveryIncompleteBookingImportRow[];
  validateIncompleteBookingsCsv: (csvContent: string) => IncompleteBookingsCsvReport;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CRITICAL_COLUMNS = ["phone", "email"];
const RECOMMENDED_COLUMNS = ["parking_code", "Message_Sent", "Id_Mensaje", "createdAt", "updatedAt"];

type CountRow = {
  count: number;
  value: string;
};

type IncompleteBookingsCsvReport = {
  columns: number;
  delimiter: string;
  duplicateBookingIdGroups: number;
  duplicateIdGroups: number;
  duplicateMessageIdGroups: number;
  emailPresent: number;
  emailValid: number;
  extraColumns: string[];
  messageIdPresent: number;
  messageSentFalse: number;
  messageSentParseable: number;
  messageSentTrue: number;
  missingEmailAndPhone: number;
  missingExpected: string[];
  missingMandatory: string[];
  parseableFormDatetime: number;
  phoneNormalizable: number;
  phonePresent: number;
  rows: number;
  typeCounts: CountRow[];
  unknownTypeRows: number;
};

type RecoveryIncompleteBookingImportRow = {
  booking_id: string;
  created_at_source: string | null;
  email_normalized: string | null;
  form_datetime: string | null;
  message_id: string | null;
  message_sent: boolean | null;
  parking_code: string | null;
  phone_normalized: string | null;
  row_hash: string;
  source_id: string;
  type: string;
  updated_at_source: string | null;
};

type ImportRpcResult = {
  batchId?: string;
  bookingDuplicateRows?: number;
  conflictRows?: number;
  fileAlreadyImported?: boolean;
  insertedAbandonedRows?: number;
  insertedCanceledRows?: number;
  insertedRows?: number;
  invalidRows?: number;
  messageDuplicateRows?: number;
  messageSentRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  rowsTotal?: number;
  skippedDuplicateRows?: number;
  sourceDuplicateRows?: number;
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

function safeSummary(report: IncompleteBookingsCsvReport) {
  const missingCriticalColumns = CRITICAL_COLUMNS.filter((column) => report.missingExpected.includes(column));
  const missingRecommendedColumns = RECOMMENDED_COLUMNS.filter((column) => report.missingExpected.includes(column));

  return {
    columns: report.columns,
    delimiter: report.delimiter,
    duplicateBookingIdGroups: report.duplicateBookingIdGroups,
    duplicateIdGroups: report.duplicateIdGroups,
    duplicateMessageIdGroups: report.duplicateMessageIdGroups,
    emailsPresent: report.emailPresent,
    emailsTotal: report.rows,
    emailsValid: report.emailValid,
    extraColumnsCount: report.extraColumns.length,
    formDatetimeParseable: report.parseableFormDatetime,
    messageIdPresent: report.messageIdPresent,
    messageSentCounts: {
      false: report.messageSentFalse,
      true: report.messageSentTrue,
      unknown: report.rows - report.messageSentParseable,
    },
    missingCriticalColumns,
    missingRecommendedColumns,
    missingRequiredColumns: report.missingMandatory,
    phonesNormalizable: report.phoneNormalizable,
    phonesPresent: report.phonePresent,
    phonesTotal: report.rows,
    rows: report.rows,
    rowsWithoutEmailOrPhone: report.missingEmailAndPhone,
    typeCounts: countsToRecord(report.typeCounts),
    unknownTypeRows: report.unknownTypeRows,
  };
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function safeImportSummary(result: ImportRpcResult) {
  return {
    bookingDuplicateRows: result.bookingDuplicateRows ?? 0,
    conflictRows: result.conflictRows ?? 0,
    fileAlreadyImported: result.fileAlreadyImported === true,
    insertedAbandonedRows: result.insertedAbandonedRows ?? 0,
    insertedCanceledRows: result.insertedCanceledRows ?? 0,
    insertedRows: result.insertedRows ?? 0,
    invalidRows: result.invalidRows ?? 0,
    messageDuplicateRows: result.messageDuplicateRows ?? 0,
    messageSentRows: result.messageSentRows ?? 0,
    rowsReceived: result.rowsReceived ?? 0,
    rowsTotal: result.rowsTotal ?? 0,
    skippedDuplicateRows: result.skippedDuplicateRows ?? 0,
    sourceDuplicateRows: result.sourceDuplicateRows ?? 0,
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
    return jsonError("El archivo supera el limite inicial de 10 MB.", 413);
  }

  const csvContent = await file.text();
  const report = validateIncompleteBookingsCsv(csvContent);
  const summary = safeSummary(report);
  const rows = buildRecoveryIncompleteBookingImportRows(csvContent);
  const fileHash = hashContent(csvContent);

  const { data, error } = await admin.supabase.rpc("import_recovery_incomplete_bookings", {
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
    ok: true,
    summary: safeImportSummary(importResult),
  });
}
