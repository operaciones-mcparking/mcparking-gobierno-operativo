const { createHash, timingSafeEqual } = require("node:crypto");
const {
  buildRecoveryBookingImportRowsFromRows,
  EXPECTED_COLUMNS,
  MANDATORY_COLUMNS,
} = require("./purchases-csv-validator");

const MAX_ROWS_PER_REQUEST = 500;
const SOURCE = "mcp_Buchungen";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidPurchaseSyncSecret(incomingSecret, expectedSecret) {
  if (!incomingSecret || !expectedSecret) return false;

  const incomingBuffer = Buffer.from(incomingSecret);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (incomingBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

function missingRequiredFields(row) {
  return MANDATORY_COLUMNS.filter((column) => {
    if (!Object.hasOwn(row, column)) return true;
    const value = row[column];
    return value === null || value === undefined || String(value).trim() === "";
  });
}

function duplicateGroupCount(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function errorResult(error, status, invalidRows = 0) {
  return { error, invalidRows, ok: false, status };
}

function prepareRecoveryPurchaseSync(payload) {
  if (!isPlainObject(payload) || payload.source !== SOURCE) {
    return errorResult("source debe ser mcp_Buchungen.", 400);
  }
  if (!Array.isArray(payload.rows)) {
    return errorResult("rows debe ser un arreglo.", 400);
  }
  if (payload.rows.length > MAX_ROWS_PER_REQUEST) {
    return errorResult(`El lote supera el maximo de ${MAX_ROWS_PER_REQUEST} filas.`, 413);
  }
  if (payload.rows.length === 0) {
    return { empty: true, ok: true };
  }
  if (!payload.rows.every(isPlainObject)) {
    return errorResult("Cada fila debe ser un objeto JSON.", 400);
  }

  const invalidRows = payload.rows.filter((row) => missingRequiredFields(row).length > 0).length;
  if (invalidRows > 0) {
    return errorResult("El lote contiene filas sin campos obligatorios.", 400, invalidRows);
  }

  const rows = buildRecoveryBookingImportRowsFromRows(payload.rows);
  const canonicalPayload = JSON.stringify({ rows, source: SOURCE });
  const payloadHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  const statusCounts = rows.reduce((counts, row) => {
    const key = row.booking_status === null ? "(empty)" : String(row.booking_status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const summary = {
    bookingStatusCounts: statusCounts,
    columns: EXPECTED_COLUMNS.length,
    delimiter: "json",
    duplicateBookingNumberGroups: duplicateGroupCount(rows, "booking_number"),
    duplicateIdGroups: duplicateGroupCount(rows, "source_booking_id"),
    emailsPresent: payload.rows.filter((row) => String(row.Email ?? "").trim()).length,
    emailsTotal: rows.length,
    emailsValid: rows.filter((row) => row.email_normalized).length,
    extraColumnsCount: 0,
    missingExpectedColumns: [],
    missingMandatoryColumns: [],
    parseableBookingDates: rows.filter((row) => row.booking_created_at).length,
    parseablePrices: rows.filter((row) => row.price !== null).length,
    phonesNormalizable: rows.filter((row) => row.phone_normalized).length,
    phonesPresent: payload.rows.filter((row) => String(row.Telefon ?? "").trim()).length,
    phonesTotal: rows.length,
    rows: rows.length,
    source: "n8n_mcp_buchungen",
    validPurchaseAmount: rows.reduce((total, row) => total + (row.is_valid_purchase ? row.price ?? 0 : 0), 0),
    validPurchaseRows: rows.filter((row) => row.is_valid_purchase).length,
  };

  return {
    empty: false,
    fileHash: payloadHash,
    fileName: `n8n_mcp_buchungen_${payloadHash.slice(0, 16)}.json`,
    fileSize: Buffer.byteLength(canonicalPayload, "utf8"),
    ok: true,
    rows,
    summary,
  };
}

module.exports = {
  isValidPurchaseSyncSecret,
  MAX_ROWS_PER_REQUEST,
  prepareRecoveryPurchaseSync,
  SOURCE,
};