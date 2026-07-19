const fs = require("node:fs");
const path = require("node:path");

const { validateMessageMemoryCsv } = require("./message-memory-csv-validator");

function formatDate(value) {
  return value ? value.toISOString() : "none";
}

function limitedCounts(counts, limit = 20) {
  if (counts.length <= limit) return counts;

  const visible = counts.slice(0, limit);
  const otherCount = counts.slice(limit).reduce((total, item) => total + item.count, 0);

  return [...visible, { value: "(other)", count: otherCount }];
}

function formatDecimal(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

function printReport(filePath, report) {
  console.log("Recovery WhatsApp Message Memory CSV validation");
  console.log(`File: ${path.basename(filePath)}`);
  console.log("");

  console.log("Structure");
  console.table([
    { metric: "Rows", value: report.rows },
    { metric: "Columns", value: report.columns },
    { metric: "Delimiter", value: report.delimiter },
    { metric: "Missing mandatory columns", value: report.missingMandatory.join(", ") || "none" },
    { metric: "Missing recommended columns", value: report.missingRecommended.join(", ") || "none" },
    { metric: "Missing expected columns", value: report.missingExpected.join(", ") || "none" },
    { metric: "Extra columns", value: report.extraColumns.length },
  ]);

  console.log("Conversation matching quality");
  console.table([
    { metric: "Conversation IDs present", value: `${report.conversationIdPresent} / ${report.rows}` },
    { metric: "Unique conversation IDs", value: report.uniqueConversationIds },
    { metric: "Rows without conversation_id", value: report.rowsWithoutConversationId },
    { metric: "WA IDs present", value: `${report.waIdPresent} / ${report.rows}` },
    { metric: "WA IDs normalizable", value: `${report.waIdNormalizable} / ${report.rows}` },
    { metric: "API phones present", value: `${report.apiPhonePresent} / ${report.rows}` },
    { metric: "API phones normalizable", value: `${report.apiPhoneNormalizable} / ${report.rows}` },
  ]);

  console.log("Dates and processing time");
  console.table([
    { metric: "timestamp parseable", value: `${report.parseableTimestamp} / ${report.rows}` },
    { metric: "Rows without parseable timestamp", value: report.rowsWithoutTimestamp },
    { metric: "Min timestamp", value: formatDate(report.minMessageAt) },
    { metric: "Max timestamp", value: formatDate(report.maxMessageAt) },
    { metric: "processing_time parseable", value: `${report.parseableProcessingTime} / ${report.rows}` },
  ]);

  console.log("Message metadata counts");
  console.log("message_bound_type");
  console.table(report.messageBoundTypeCounts);
  console.log("message_type");
  console.table(report.messageTypeCounts);
  console.log("time_of_day");
  console.table(limitedCounts(report.timeOfDayCounts));
  console.log("day_of_week");
  console.table(report.dayOfWeekCounts);
  console.log("message_sentiment");
  console.table(report.messageSentimentCounts);
  console.log("chat_state");
  console.table(report.chatStateCounts);
  console.log("intent_category");
  console.table(report.intentCategoryCounts);

  console.log("Safe content presence");
  console.table([
    { metric: "Message raw present", value: `${report.messagePresent} / ${report.rows}` },
    { metric: "text_summary present", value: `${report.textSummaryPresent} / ${report.rows}` },
  ]);

  console.log("text_summary sensitivity");
  console.table([
    { metric: "Average length", value: formatDecimal(report.textSummarySensitivity.averageLength) },
    { metric: "Max length", value: report.textSummarySensitivity.maxLength },
    { metric: "Possible emails", value: report.textSummarySensitivity.possibleEmails },
    { metric: "Possible phones", value: report.textSummarySensitivity.possiblePhones },
    { metric: "Possible RUT", value: report.textSummarySensitivity.possibleRuts },
    { metric: "URLs", value: report.textSummarySensitivity.urls },
  ]);

  console.log("Incremental duplicate signals");
  console.table([
    { metric: "Importable rows", value: `${report.importableRows} / ${report.rows}` },
    { metric: "Skipped missing conversation_id", value: report.skippedRows.missingConversationId },
    { metric: "Skipped missing wa_id_normalized", value: report.skippedRows.missingWaIdNormalized },
    { metric: "Skipped missing message_at", value: report.skippedRows.missingMessageAt },
    { metric: "Skipped missing row_hash", value: report.skippedRows.missingRowHash },
    { metric: "Row hash present", value: `${report.rowHashPresent} / ${report.rows}` },
    { metric: "Duplicate row_hash groups", value: report.duplicateRowHashGroups },
    { metric: "Duplicate conversation_id groups", value: report.duplicateConversationIdGroups },
  ]);

  console.log("Raw import duplicate signals");
  console.table([
    { metric: "Raw importable rows", value: `${report.rawImportableRows} / ${report.rows}` },
    { metric: "Raw skipped missing conversation_id", value: report.rawSkippedRows.missingConversationId },
    { metric: "Raw skipped missing wa_id_normalized", value: report.rawSkippedRows.missingWaIdNormalized },
    { metric: "Raw skipped missing message_at", value: report.rawSkippedRows.missingMessageAt },
    { metric: "Raw skipped missing message_text", value: report.rawSkippedRows.missingMessageText },
    { metric: "Raw skipped missing row_hash", value: report.rawSkippedRows.missingRowHash },
    { metric: "Raw row_hash present", value: `${report.rawRowHashPresent} / ${report.rows}` },
    { metric: "Raw duplicate row_hash groups", value: report.rawDuplicateRowHashGroups },
  ]);

  if (report.extraColumns.length > 0) {
    console.log("Extra columns for schema review");
    console.log(report.extraColumns.join(", "));
  }
}

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node scripts/recovery/validate-message-memory-csv.js "C:\\ruta\\Whatsapp BBDD - Message Memory.csv"');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const report = validateMessageMemoryCsv(content);
  printReport(filePath, report);
}

if (require.main === module) {
  main();
}

module.exports = {
  printReport,
};
