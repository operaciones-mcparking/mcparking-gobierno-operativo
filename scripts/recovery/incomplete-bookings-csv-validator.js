const { normalizeEmail, normalizePhone, parseDateSafe } = require("./recovery-normalizers");
const { parseCsv } = require("./purchases-csv-validator");
const crypto = require("node:crypto");

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
const RECOVERY_TIME_ZONE = "America/Santiago";

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

function dateTimeValue(raw) {
  const date = parseDateSafe(raw);

  return date ? date.toISOString() : null;
}

function dateOnlyParts(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

    if (
      date.getUTCFullYear() === yearNumber &&
      date.getUTCMonth() === monthNumber - 1 &&
      date.getUTCDate() === dayNumber
    ) {
      return { day: dayNumber, month: monthNumber, year: yearNumber };
    }

    return null;
  }

  const localMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

  if (localMatch) {
    const [, day, month, year] = localMatch;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

    if (
      date.getUTCFullYear() === yearNumber &&
      date.getUTCMonth() === monthNumber - 1 &&
      date.getUTCDate() === dayNumber
    ) {
      return { day: dayNumber, month: monthNumber, year: yearNumber };
    }
  }

  return null;
}

function dateValue(raw) {
  const parts = dateOnlyParts(raw);

  if (parts) {
    return [
      String(parts.year).padStart(4, "0"),
      String(parts.month).padStart(2, "0"),
      String(parts.day).padStart(2, "0"),
    ].join("-");
  }

  const date = parseDateSafe(raw);

  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function integerValue(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) return null;

  return parsed;
}

function parseBform(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeHour(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  const match = value.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);

  if (!match) return null;

  const [, hour, minute = "0", second = "0"] = match;
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);

  if (
    !Number.isInteger(hourNumber) ||
    !Number.isInteger(minuteNumber) ||
    !Number.isInteger(secondNumber) ||
    hourNumber < 0 ||
    hourNumber > 23 ||
    minuteNumber < 0 ||
    minuteNumber > 59 ||
    secondNumber < 0 ||
    secondNumber > 59
  ) {
    return null;
  }

  return [
    String(hourNumber).padStart(2, "0"),
    String(minuteNumber).padStart(2, "0"),
    String(secondNumber).padStart(2, "0"),
  ].join(":");
}

function timeZoneParts(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  const valueFor = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    month: valueFor("month"),
    second: valueFor("second"),
    year: valueFor("year"),
  };
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = timeZoneParts(timeZone, date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

function santiagoWallTimeToUtcIso(year, month, day, hour, minute, second) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstPass = new Date(guess.getTime() - timeZoneOffsetMs(RECOVERY_TIME_ZONE, guess));
  const secondPass = new Date(guess.getTime() - timeZoneOffsetMs(RECOVERY_TIME_ZONE, firstPass));

  return secondPass.toISOString();
}

function intendedTimestamp(dateRaw, hourRaw) {
  const date = dateOnlyParts(dateRaw);
  const hour = normalizeHour(hourRaw);

  if (!date || !hour) return null;

  const [hourValue, minuteValue, secondValue] = hour.split(":").map(Number);

  return santiagoWallTimeToUtcIso(date.year, date.month, date.day, hourValue, minuteValue, secondValue);
}

function intendedFieldsFromBform(raw) {
  const bform = parseBform(raw);

  if (!bform) {
    return {
      intended_arrival_at: null,
      intended_arrival_date: null,
      intended_days: null,
      intended_departure_at: null,
      intended_departure_date: null,
    };
  }

  return {
    intended_arrival_at: intendedTimestamp(bform.arrival_date, bform.arrival_hour),
    intended_arrival_date: dateValue(bform.arrival_date),
    intended_days: integerValue(bform.days),
    intended_departure_at: intendedTimestamp(bform.departure_date, bform.departure_hour),
    intended_departure_date: dateValue(bform.departure_date),
  };
}

function hashNormalizedRow(row) {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function normalizeIncompleteBookingRow(row) {
  const intendedFields = intendedFieldsFromBform(row.bform);
  const normalizedForHash = {
    booking_id: cleanText(row.booking_id),
    created_at_source: dateTimeValue(row.createdAt),
    email_normalized: normalizeEmail(row.email),
    form_datetime: dateTimeValue(row.form_datetime),
    ...intendedFields,
    message_id: cleanText(row.Id_Mensaje),
    message_sent: parseBoolean(row.Message_Sent),
    parking_code: normalizeParkingCode(row.parking_code),
    phone_normalized: normalizePhone(row.phone),
    source_id: cleanText(row.id),
    type: normalizeType(row.type),
    updated_at_source: dateTimeValue(row.updatedAt),
  };

  return {
    ...normalizedForHash,
    cms_url: cleanText(row.cms_url),
    row_hash: hashNormalizedRow(normalizedForHash),
  };
}

function buildRecoveryIncompleteBookingImportRows(csvContent) {
  const { rows } = parseCsv(csvContent);

  return rows
    .map(normalizeIncompleteBookingRow)
    .filter((row) => row.source_id && row.booking_id && row.type);
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
  buildRecoveryIncompleteBookingImportRows,
  validateIncompleteBookingsCsv,
};
