const { normalizeEmail, normalizePhone, parseDateSafe } = require("./recovery-normalizers");
const { parseCsv } = require("./purchases-csv-validator");

const EXPECTED_COLUMNS = [
  "id",
  "booking_id",
  "phone",
  "email",
  "type",
  "parking_code",
  "cms_url",
  "bform",
  "form_datetime",
  "Message_Sent",
  "Id_Mensaje",
  "createdAt",
  "updatedAt",
];

const MANDATORY_COLUMNS = ["id", "booking_id", "type", "form_datetime"];
const VALID_TYPES = new Set(["abandoned", "canceled"]);

function cleanText(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
}

function normalizeType(raw) {
  const value = cleanText(raw);

  return value ? value.toLowerCase() : null;
}

function normalizeParkingCode(raw) {
  const value = cleanText(raw);

  return value ? value.toUpperCase() : null;
}

function parseBoolean(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  const normalized = value.toLowerCase();

  if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;

  return null;
}

function duplicateGroupCount(rows, key) {
  const counts = new Map();

  for (const row of rows) {
    const value = cleanText(row[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
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

function validateIncompleteBookingsCsv(csvContent) {
  const { delimiter, headers, rows } = parseCsv(csvContent);
  const missingExpected = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  const missingMandatory = MANDATORY_COLUMNS.filter((column) => !headers.includes(column));
  const extraColumns = headers.filter((column) => !EXPECTED_COLUMNS.includes(column));
  const parsedFormDates = rows
    .map((row) => parseDateSafe(row.form_datetime))
    .filter((date) => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  const parsedCreatedAt = rows.filter((row) => parseDateSafe(row.createdAt)).length;
  const parsedUpdatedAt = rows.filter((row) => parseDateSafe(row.updatedAt)).length;
  const normalizedTypes = rows.map((row) => normalizeType(row.type));
  const unknownTypes = normalizedTypes.filter((type) => type && !VALID_TYPES.has(type));
  const messageSentValues = rows.map((row) => parseBoolean(row.Message_Sent));

  return {
    columns: headers.length,
    delimiter,
    duplicateBookingIdGroups: duplicateGroupCount(rows, "booking_id"),
    duplicateIdGroups: duplicateGroupCount(rows, "id"),
    duplicateMessageIdGroups: duplicateGroupCount(rows, "Id_Mensaje"),
    emailPresent: rows.filter((row) => cleanText(row.email)).length,
    emailValid: rows.filter((row) => normalizeEmail(row.email)).length,
    extraColumns,
    maxFormDatetime: parsedFormDates.at(-1) ?? null,
    messageIdPresent: rows.filter((row) => cleanText(row.Id_Mensaje)).length,
    messageSentFalse: messageSentValues.filter((value) => value === false).length,
    messageSentParseable: messageSentValues.filter((value) => value !== null).length,
    messageSentTrue: messageSentValues.filter((value) => value === true).length,
    minFormDatetime: parsedFormDates[0] ?? null,
    missingEmailAndPhone: rows.filter((row) => !normalizeEmail(row.email) && !normalizePhone(row.phone)).length,
    missingExpected,
    missingMandatory,
    parkingCodePresent: rows.filter((row) => normalizeParkingCode(row.parking_code)).length,
    parseableCreatedAt: parsedCreatedAt,
    parseableFormDatetime: parsedFormDates.length,
    parseableUpdatedAt: parsedUpdatedAt,
    phoneNormalizable: rows.filter((row) => normalizePhone(row.phone)).length,
    phonePresent: rows.filter((row) => cleanText(row.phone)).length,
    rows: rows.length,
    typeCounts: countByValues(normalizedTypes),
    unknownTypeCounts: countByValues(unknownTypes),
    unknownTypeRows: unknownTypes.length,
    validTypeRows: normalizedTypes.filter((type) => type && VALID_TYPES.has(type)).length,
  };
}

module.exports = {
  validateIncompleteBookingsCsv,
};
