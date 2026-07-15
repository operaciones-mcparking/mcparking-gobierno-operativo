import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { validatePurchasesCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/purchases-csv-validator.js",
) as {
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

  return { ok: true as const };
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

  return NextResponse.json({
    file: {
      name: file.name,
      size: file.size,
    },
    ok: true,
    summary: safeSummary(report),
  });
}
