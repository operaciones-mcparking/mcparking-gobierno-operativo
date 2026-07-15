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

function dateTimeValue(raw) {
  const date = parseDateSafe(raw);

  return date ? date.toISOString() : null;
}

function dateOnlyValue(raw) {
  const date = parseDateSafe(raw);

  return date ? date.toISOString().slice(0, 10) : null;
}

function hashNormalizedRow(row) {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function normalizePurchaseRow(row) {
  const bookingStatus = integerValue(row.BookingStatus);
  const normalized = {
    arrival_date: dateOnlyValue(row.Anreisedatum),
    booking_created_at: dateTimeValue(row.Buchungszeit),
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
    phone_normalized: normalizePhone(row.Telefon),
    price: normalizePrice(row.Preis),
    source_booking_id: cleanText(row.Id),
  };

  return {
    ...normalized,
    row_hash: hashNormalizedRow(normalized),
  };
}

function buildRecoveryBookingImportRows(csvContent) {
  const { rows } = parseCsv(csvContent);

  return rows.map(normalizePurchaseRow).filter((row) => row.source_booking_id);
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
  detectDelimiter,
  parseCsv,
  parseCsvRecords,
  validatePurchasesCsv,
};
