const {
  isValidPurchase,
  normalizeEmail,
  normalizePhone,
  normalizePrice,
  parseDateSafe,
} = require("./recovery-normalizers");
const crypto = require("node:crypto");

const EXPECTED_COLUMNS = [
  "Id",
  "CustomerId",
  "Email",
  "Telefon",
  "Buchungszeit",
  "LocationCode",
  "ParkingCode",
  "Anreisedatum",
  "Anreisezeit",
  "Abreisedatum",
  "Abreisezeit",
  "Dauer",
  "Kennzeichen",
  "Buchungsnummer",
  "BookingStatus",
  "PayingStatus",
  "Preis",
  "Personenzahl",
  "PromotionCode",
  "PromotionCodeCalculatedValue",
  "BookingPaid",
  "Website",
  "SubDaysUsed",
];

const MANDATORY_COLUMNS = ["Id", "Email", "Telefon", "Buchungszeit", "BookingStatus", "Preis"];

function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvRecords(content, delimiter) {
  const records = [];
  let record = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      record.push(current);
      current = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      record.push(current);
      records.push(record);
      record = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || record.length > 0) {
    record.push(current);
    records.push(record);
  }

  return records;
}

function parseCsv(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n", 1)[0] ?? "";

  if (!firstLine) {
    return { delimiter: ",", headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(firstLine);
  const records = parseCsvRecords(normalized, delimiter);
  const headers = (records[0] ?? []).map((header) => header.trim());
  const rows = records
    .slice(1)
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => {
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });

      return row;
    });

  return { delimiter, headers, rows };
}

function countBy(rows, key) {
  const counts = new Map();

  for (const row of rows) {
    const value = String(row[key] ?? "").trim() || "(empty)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right, "es", { numeric: true }))
    .map(([value, count]) => ({ value, count }));
}

function duplicateGroupCount(rows, key) {
  const counts = new Map();

  for (const row of rows) {
    const value = String(row[key] ?? "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function cleanText(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
}

function integerValue(raw) {
  const value = Number(String(raw ?? "").trim());

  return Number.isInteger(value) ? value : null;
}

function nullableIntegerValue(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  return integerValue(raw);
}

function dateTimeValue(raw) {
  const date = parseDateSafe(raw);

  return date ? date.toISOString() : null;
}

function dateOnlyValue(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();
  if (!value) return null;

  const dayFirstMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dayFirstMatch && !isoMatch) return null;

  const year = Number.parseInt(isoMatch ? isoMatch[1] : dayFirstMatch[3], 10);
  const month = Number.parseInt(isoMatch ? isoMatch[2] : dayFirstMatch[2], 10);
  const day = Number.parseInt(isoMatch ? isoMatch[3] : dayFirstMatch[1], 10);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function hashNormalizedRow(row) {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function normalizePurchaseRow(row) {
  const bookingStatus = integerValue(row.BookingStatus);
  const normalized = {
    arrival_date: dateOnlyValue(row.Anreisedatum),
    booking_created_at: dateTimeValue(row.Buchungszeit),
    booking_paid: normalizePrice(row.BookingPaid),
    booking_number: cleanText(row.Buchungsnummer),
    booking_status: bookingStatus,
    customer_id: cleanText(row.CustomerId),
    departure_date: dateOnlyValue(row.Abreisedatum),
    duration_days: integerValue(row.Dauer),
    email_normalized: normalizeEmail(row.Email),
    is_valid_purchase: isValidPurchase(bookingStatus),
    location_code: cleanText(row.LocationCode),
    parking_code: cleanText(row.ParkingCode),
    paying_status: cleanText(row.PayingStatus),
    person_count: nullableIntegerValue(row.Personenzahl),
    phone_normalized: normalizePhone(row.Telefon),
    price: normalizePrice(row.Preis),
    promotion_code: cleanText(row.PromotionCode),
    promotion_discount_amount: normalizePrice(row.PromotionCodeCalculatedValue),
    source_booking_id: cleanText(row.Id),
    sub_days_used: nullableIntegerValue(row.SubDaysUsed),
    website_source: nullableIntegerValue(row.Website),
  };

  return {
    ...normalized,
    row_hash: hashNormalizedRow(normalized),
  };
}

function buildRecoveryBookingImportRows(csvContent) {
  const { rows } = parseCsv(csvContent);

  return buildRecoveryBookingImportRowsFromRows(rows).filter((row) => row.source_booking_id);
}

function buildRecoveryBookingImportRowsFromRows(rows) {
  return rows.map(normalizePurchaseRow);
}

function validatePurchasesCsv(csvContent) {
  const { delimiter, headers, rows } = parseCsv(csvContent);
  const missingExpected = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  const missingMandatory = MANDATORY_COLUMNS.filter((column) => !headers.includes(column));
  const extraColumns = headers.filter((column) => !EXPECTED_COLUMNS.includes(column));
  const validRows = rows.filter((row) => isValidPurchase(row.BookingStatus));
  const validAmount = validRows.reduce((total, row) => total + (normalizePrice(row.Preis) ?? 0), 0);
  const parsedDates = rows
    .map((row) => parseDateSafe(row.Buchungszeit))
    .filter((date) => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    columns: headers.length,
    delimiter,
    duplicateBookingNumberGroups: duplicateGroupCount(rows, "Buchungsnummer"),
    duplicateIdGroups: duplicateGroupCount(rows, "Id"),
    emailPresent: rows.filter((row) => String(row.Email ?? "").trim()).length,
    emailValid: rows.filter((row) => normalizeEmail(row.Email)).length,
    extraColumns,
    maxBookingCreatedAt: parsedDates.at(-1) ?? null,
    minBookingCreatedAt: parsedDates[0] ?? null,
    missingEmailAndPhone: rows.filter((row) => !normalizeEmail(row.Email) && !normalizePhone(row.Telefon)).length,
    missingExpected,
    missingMandatory,
    parseableBookingDates: parsedDates.length,
    parseablePrices: rows.filter((row) => normalizePrice(row.Preis) !== null).length,
    phoneNormalizable: rows.filter((row) => normalizePhone(row.Telefon)).length,
    phonePresent: rows.filter((row) => String(row.Telefon ?? "").trim()).length,
    rows: rows.length,
    statusCounts: countBy(rows, "BookingStatus"),
    validAmount,
    validPurchaseRows: validRows.length,
  };
}

module.exports = {
  buildRecoveryBookingImportRows,
  buildRecoveryBookingImportRowsFromRows,
  EXPECTED_COLUMNS,
  MANDATORY_COLUMNS,
  dateOnlyValue,
  normalizePurchaseRow,
  detectDelimiter,
  parseCsv,
  parseCsvRecords,
  validatePurchasesCsv,
};
