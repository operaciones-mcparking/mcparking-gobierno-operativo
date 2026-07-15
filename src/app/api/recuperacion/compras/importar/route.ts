import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { buildRecoveryBookingImportRows, validatePurchasesCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/purchases-csv-validator.js",
) as {
  buildRecoveryBookingImportRows: (csvContent: string) => RecoveryBookingImportRow[];
  validatePurchasesCsv: (csvContent: string) => PurchaseCsvReport;
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type StatusCount = {
  count: number;
  value: string;
};

type PurchaseCsvReport = {
  columns: number;
  delimiter: string;
  duplicateBookingNumberGroups: number;
  duplicateIdGroups: number;
  emailPresent: number;
  emailValid: number;
  extraColumns: string[];
  missingExpected: string[];
  missingMandatory: string[];
  parseableBookingDates: number;
  parseablePrices: number;
  phoneNormalizable: number;
  phonePresent: number;
  rows: number;
  statusCounts: StatusCount[];
  validAmount: number;
  validPurchaseRows: number;
};

type RecoveryBookingImportRow = {
  arrival_date: string | null;
  booking_created_at: string | null;
  booking_number: string | null;
  booking_status: number | null;
  customer_id: string | null;
  departure_date: string | null;
  duration_days: number | null;
  email_normalized: string | null;
  is_valid_purchase: boolean;
  location_code: string | null;
  parking_code: string | null;
  paying_status: string | null;
  phone_normalized: string | null;
  price: number | null;
  row_hash: string;
  source_booking_id: string;
};

type ImportRpcResult = {
  batchId?: string;
  conflictRows?: number;
  fileAlreadyImported?: boolean;
  insertedAmount?: number;
  insertedRows?: number;
  invalidRows?: number;
  ok?: boolean;
  rowsReceived?: number;
  rowsTotal?: number;
  skippedDuplicateRows?: number;
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

function statusCountsToRecord(statusCounts: StatusCount[]) {
  return Object.fromEntries(statusCounts.map((item) => [item.value, item.count]));
}

function safeSummary(report: PurchaseCsvReport) {
  return {
    bookingStatusCounts: statusCountsToRecord(report.statusCounts),
    columns: report.columns,
    delimiter: report.delimiter,
    duplicateBookingNumberGroups: report.duplicateBookingNumberGroups,
    duplicateIdGroups: report.duplicateIdGroups,
    emailsPresent: report.emailPresent,
    emailsTotal: report.rows,
    emailsValid: report.emailValid,
    extraColumnsCount: report.extraColumns.length,
    missingExpectedColumns: report.missingExpected,
    missingMandatoryColumns: report.missingMandatory,
    parseableBookingDates: report.parseableBookingDates,
    parseablePrices: report.parseablePrices,
    phonesNormalizable: report.phoneNormalizable,
    phonesPresent: report.phonePresent,
    phonesTotal: report.rows,
    rows: report.rows,
    validPurchaseAmount: report.validAmount,
    validPurchaseRows: report.validPurchaseRows,
  };
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function safeImportSummary(result: ImportRpcResult) {
  return {
    conflictRows: result.conflictRows ?? 0,
    fileAlreadyImported: result.fileAlreadyImported === true,
    insertedAmount: result.insertedAmount ?? 0,
    insertedRows: result.insertedRows ?? 0,
    invalidRows: result.invalidRows ?? 0,
    rowsReceived: result.rowsReceived ?? 0,
    rowsTotal: result.rowsTotal ?? 0,
    skippedDuplicateRows: result.skippedDuplicateRows ?? 0,
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
    return jsonError("El archivo supera el limite inicial de 5 MB.", 413);
  }

  const csvContent = await file.text();
  const report = validatePurchasesCsv(csvContent);
  const summary = safeSummary(report);
  const rows = buildRecoveryBookingImportRows(csvContent);
  const fileHash = hashContent(csvContent);

  const { data, error } = await admin.supabase.rpc("import_recovery_purchases", {
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
