const fs = require("node:fs");
const path = require("node:path");

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

function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;

  let digits = String(raw).replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("056")) digits = digits.slice(1);
  if (digits.length === 8) return `569${digits}`;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  if (digits.length === 10 && digits.startsWith("09")) return `56${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("56")) return digits;

  return null;
}

function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;

  const email = String(raw).trim().toLowerCase();

  if (!email) return null;

  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const cleaned = String(raw)
    .trim()
    .replace(/\$/g, "")
    .replace(/\s/g, "");

  if (!cleaned) return null;

  let normalized;

  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function isValidPurchase(bookingStatus) {
  const status = Number(bookingStatus);

  return status === 1 || status === 8;
}

function parseDateSafe(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  if (!value) return null;

  const direct = new Date(value);

  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) return null;

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

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
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);

  return values;
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
  const rows = records.slice(1).filter((values) => values.some((value) => value.trim().length > 0)).map((values) => {
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });

  return { delimiter, headers, rows };
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

function formatNumber(value) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatDate(date) {
  if (!date) return "";

  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function validatePurchasesCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const { delimiter, headers, rows } = parseCsv(content);
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

function printReport(filePath, report) {
  console.log("Recovery purchases CSV validation");
  console.log(`File: ${path.basename(filePath)}`);
  console.log("");
  console.log("Structure");
  console.table([
    { metric: "Rows", value: report.rows },
    { metric: "Columns", value: report.columns },
    { metric: "Delimiter", value: report.delimiter },
    { metric: "Missing mandatory columns", value: report.missingMandatory.join(", ") || "none" },
    { metric: "Missing expected columns", value: report.missingExpected.join(", ") || "none" },
    { metric: "Extra columns", value: report.extraColumns.length },
  ]);

  console.log("BookingStatus counts");
  console.table(report.statusCounts);

  console.log("Purchases");
  console.table([
    { metric: "Valid purchase rows", value: report.validPurchaseRows },
    { metric: "Valid purchase amount", value: formatNumber(report.validAmount) },
    { metric: "Parseable prices", value: `${report.parseablePrices} / ${report.rows}` },
  ]);

  console.log("Matching quality");
  console.table([
    { metric: "Emails present", value: `${report.emailPresent} / ${report.rows}` },
    { metric: "Emails valid", value: `${report.emailValid} / ${report.rows}` },
    { metric: "Phones present", value: `${report.phonePresent} / ${report.rows}` },
    { metric: "Phones normalizable", value: `${report.phoneNormalizable} / ${report.rows}` },
    { metric: "Rows without email and phone", value: report.missingEmailAndPhone },
  ]);

  console.log("Dates and duplicates");
  console.table([
    { metric: "Parseable Buchungszeit", value: `${report.parseableBookingDates} / ${report.rows}` },
    { metric: "Min Buchungszeit", value: formatDate(report.minBookingCreatedAt) },
    { metric: "Max Buchungszeit", value: formatDate(report.maxBookingCreatedAt) },
    { metric: "Duplicate Id groups", value: report.duplicateIdGroups },
    { metric: "Duplicate Buchungsnummer groups", value: report.duplicateBookingNumberGroups },
  ]);

  if (report.extraColumns.length > 0) {
    console.log("Extra columns for raw_payload review");
    console.log(report.extraColumns.join(", "));
  }
}

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node scripts/recovery/validate-purchases-csv.js "C:\\ruta\\mcp_Buchungen.csv"');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const report = validatePurchasesCsv(filePath);
  printReport(filePath, report);
}

if (require.main === module) {
  main();
}

module.exports = {
  isValidPurchase,
  normalizeEmail,
  normalizePhone,
  normalizePrice,
  parseCsv,
  validatePurchasesCsv,
};
