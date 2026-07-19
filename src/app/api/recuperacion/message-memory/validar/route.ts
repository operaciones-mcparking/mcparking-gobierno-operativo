import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { validateMessageMemoryCsv } = requireFromRoute(
  "../../../../../../scripts/recovery/message-memory-csv-validator.js",
) as {
  validateMessageMemoryCsv: (csvContent: string) => MessageMemoryCsvReport;
};

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

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

function dateToIso(date: Date | null) {
  return date ? date.toISOString() : null;
}

function safeSummary(report: MessageMemoryCsvReport) {
  return {
    apiPhonesNormalizable: report.apiPhoneNormalizable,
    apiPhonesPresent: report.apiPhonePresent,
    apiPhonesTotal: report.rows,
    chatStateCounts: countsToRecord(report.chatStateCounts),
    columns: report.columns,
    conversationIdPresent: report.conversationIdPresent,
    dayOfWeekCounts: countsToRecord(report.dayOfWeekCounts),
    delimiter: report.delimiter,
    duplicateConversationIdGroups: report.duplicateConversationIdGroups,
    duplicateRowHashGroups: report.duplicateRowHashGroups,
    extraColumnsCount: report.extraColumns.length,
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
    parseableProcessingTime: report.parseableProcessingTime,
    rowHashPresent: report.rowHashPresent,
    rows: report.rows,
    rowsWithoutConversationId: report.rowsWithoutConversationId,
    rowsWithoutTimestamp: report.rowsWithoutTimestamp,
    rowsWithoutWaId: report.rowsWithoutWaId,
    skippedRows: report.skippedRows,
    textSummaryPresent: report.textSummaryPresent,
    textSummarySensitivity: report.textSummarySensitivity,
    timeOfDayCounts: countsToRecord(report.timeOfDayCounts),
    timestampParseable: report.parseableTimestamp,
    timestampTotal: report.rows,
    uniqueConversationIds: report.uniqueConversationIds,
    waIdNormalizable: report.waIdNormalizable,
    waIdPresent: report.waIdPresent,
    waIdTotal: report.rows,
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
  const report = validateMessageMemoryCsv(csvContent);

  return NextResponse.json({
    file: {
      name: file.name,
      size: file.size,
    },
    ok: true,
    summary: safeSummary(report),
  });
}
