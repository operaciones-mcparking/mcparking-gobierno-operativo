const crypto = require("node:crypto");

const { parseCsv } = require("./purchases-csv-validator");
const { normalizePhone, parseDateSafe } = require("./recovery-normalizers");

const EXPECTED_COLUMNS = [
  "timestamp",
  "conversation_id",
  "api_phone",
  "wa_id",
  "message_bound_type",
  "processing_time",
  "message_type",
  "time_of_day",
  "day_of_week",
  "message_sentiment",
  "chat_state",
  "intent_category",
  "Message",
  "text_summary",
];

const MANDATORY_COLUMNS = ["timestamp", "conversation_id", "wa_id"];
const RECOMMENDED_COLUMNS = [
  "api_phone",
  "message_bound_type",
  "message_type",
  "message_sentiment",
  "chat_state",
  "intent_category",
];

function cleanText(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
}

function normalizeCategory(raw) {
  const value = cleanText(raw);

  return value ? value.toLowerCase() : null;
}

function parseNumberSafe(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestampSafe(raw) {
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

function dateTimeValue(raw) {
  const date = parseTimestampSafe(raw);

  return date ? date.toISOString() : null;
}

function normalizeMessagingPhone(raw) {
  if (raw === null || raw === undefined) return null;

  const digits = String(raw).replace(/\D/g, "");

  return digits.length >= 8 ? digits : null;
}

function summarizeSensitiveText(values) {
  const presentValues = values.map(cleanText).filter(Boolean);
  const totalLength = presentValues.reduce((total, value) => total + value.length, 0);

  return {
    averageLength: presentValues.length > 0 ? totalLength / presentValues.length : 0,
    maxLength: presentValues.reduce((max, value) => Math.max(max, value.length), 0),
    possibleEmails: presentValues.filter((value) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)).length,
    possiblePhones: presentValues.filter((value) => /(?:\+?56\s*)?(?:9[\s.-]*)?\d{4}[\s.-]*\d{4}/.test(value)).length,
    possibleRuts: presentValues.filter((value) => /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/.test(value)).length,
    urls: presentValues.filter((value) => /https?:\/\/|www\./i.test(value)).length,
  };
}

function parseDateForRange(raw) {
  const date = parseDateSafe(raw);

  return date ?? parseTimestampSafe(raw);
}

function countByValues(values) {
  const counts = new Map();

  for (const value of values) {
    const key = value ?? "(empty)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right, "es", { numeric: true }))
    .map(([value, count]) => ({ value, count }));
}

function duplicateGroupCount(values) {
  const counts = new Map();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function hashNormalizedRow(row) {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function normalizeMessageMemoryRow(row) {
  const normalized = {
    api_phone_normalized: normalizePhone(row.api_phone),
    chat_state: normalizeCategory(row.chat_state),
    conversation_id: cleanText(row.conversation_id),
    day_of_week: normalizeCategory(row.day_of_week),
    intent_category: normalizeCategory(row.intent_category),
    message_at: dateTimeValue(row.timestamp),
    message_bound_type: normalizeCategory(row.message_bound_type),
    message_sentiment: normalizeCategory(row.message_sentiment),
    message_type: normalizeCategory(row.message_type),
    processing_time: parseNumberSafe(row.processing_time),
    time_of_day: normalizeCategory(row.time_of_day),
    wa_id_normalized: normalizeMessagingPhone(row.wa_id),
  };

  return {
    ...normalized,
    row_hash: hashNormalizedRow(normalized),
  };
}

function validateMessageMemoryCsv(csvContent) {
  const { delimiter, headers, rows } = parseCsv(csvContent);
  const missingExpected = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  const missingMandatory = MANDATORY_COLUMNS.filter((column) => !headers.includes(column));
  const missingRecommended = RECOMMENDED_COLUMNS.filter((column) => !headers.includes(column));
  const extraColumns = headers.filter((column) => !EXPECTED_COLUMNS.includes(column));
  const normalizedRows = rows.map(normalizeMessageMemoryRow);
  const rowHashes = normalizedRows.map((row) => row.row_hash);
  const parsedDates = normalizedRows
    .map((row) => (row.message_at ? new Date(row.message_at) : null))
    .filter((date) => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    apiPhoneNormalizable: rows.filter((row) => normalizePhone(row.api_phone)).length,
    apiPhonePresent: rows.filter((row) => cleanText(row.api_phone)).length,
    chatStateCounts: countByValues(normalizedRows.map((row) => row.chat_state)),
    columns: headers.length,
    conversationIdPresent: rows.filter((row) => cleanText(row.conversation_id)).length,
    dayOfWeekCounts: countByValues(normalizedRows.map((row) => row.day_of_week)),
    delimiter,
    duplicateConversationIdGroups: duplicateGroupCount(rows.map((row) => cleanText(row.conversation_id))),
    duplicateRowHashGroups: duplicateGroupCount(rowHashes),
    extraColumns,
    intentCategoryCounts: countByValues(normalizedRows.map((row) => row.intent_category)),
    maxMessageAt: parsedDates.at(-1) ?? null,
    messageBoundTypeCounts: countByValues(normalizedRows.map((row) => row.message_bound_type)),
    messagePresent: rows.filter((row) => cleanText(row.Message)).length,
    messageSentimentCounts: countByValues(normalizedRows.map((row) => row.message_sentiment)),
    messageTypeCounts: countByValues(normalizedRows.map((row) => row.message_type)),
    minMessageAt: parsedDates[0] ?? null,
    missingExpected,
    missingMandatory,
    missingRecommended,
    parseableProcessingTime: rows.filter((row) => parseNumberSafe(row.processing_time) !== null).length,
    parseableTimestamp: normalizedRows.filter((row) => row.message_at).length,
    rowHashPresent: normalizedRows.filter((row) => row.row_hash).length,
    rows: rows.length,
    rowsWithoutConversationId: rows.filter((row) => !cleanText(row.conversation_id)).length,
    rowsWithoutTimestamp: rows.filter((row) => !parseDateForRange(row.timestamp)).length,
    rowsWithoutWaId: rows.filter((row) => !cleanText(row.wa_id)).length,
    textSummaryPresent: rows.filter((row) => cleanText(row.text_summary)).length,
    textSummarySensitivity: summarizeSensitiveText(rows.map((row) => row.text_summary)),
    timeOfDayCounts: countByValues(normalizedRows.map((row) => row.time_of_day)),
    uniqueConversationIds: new Set(rows.map((row) => cleanText(row.conversation_id)).filter(Boolean)).size,
    waIdNormalizable: rows.filter((row) => normalizeMessagingPhone(row.wa_id)).length,
    waIdPresent: rows.filter((row) => cleanText(row.wa_id)).length,
  };
}

module.exports = {
  EXPECTED_COLUMNS,
  normalizeMessageMemoryRow,
  validateMessageMemoryCsv,
};
