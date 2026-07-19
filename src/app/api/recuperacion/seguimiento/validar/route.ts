import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { validateTrackingCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/tracking-csv-validator.js",
) as {
  validateTrackingCsv: (csvContent: string) => TrackingCsvReport;
};

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

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

function countsToRecord(counts: CountRow[]) {
  return Object.fromEntries(counts.map((item) => [item.value, item.count]));
}

function safeSummary(report: TrackingCsvReport) {
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
    missingMandatoryColumns: report.missingMandatory,
    missingRecommendedColumns: report.missingRecommended,
    parseableCreatedAt: report.parseableCreatedAt,
    parseableUpdatedAt: report.parseableUpdatedAt,
    readAtParseable: report.readAtParseable,
    rows: report.rows,
    rowsWithoutMessageId: report.rowsWithoutMessageId,
    rowsWithoutMessageIdAndClientPhone: report.rowsWithoutMessageIdAndClientPhone,
    sentAtParseable: report.sentAtParseable,
    statusCounts: countsToRecord(report.statusCounts),
    surveyJsonParseable: report.surveyJsonParseable,
    surveyJsonPresent: report.surveyJsonPresent,
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
    return jsonError("El archivo supera el limite inicial de 30 MB.", 413);
  }

  const csvContent = await file.text();
  const report = validateTrackingCsv(csvContent);

  return NextResponse.json({
    file: {
      name: file.name,
      size: file.size,
    },
    ok: true,
    summary: safeSummary(report),
  });
}
