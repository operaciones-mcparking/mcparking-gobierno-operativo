const { normalizePhone, parseDateSafe } = require("./recovery-normalizers");
const { parseCsv } = require("./purchases-csv-validator");

const EXPECTED_COLUMNS = [
  "id",
  "Id_Mensaje",
  "Telefono_Negocio",
  "Telefono_Cliente",
  "Categoria_Mensaje",
  "Tipo_Cobro",
  "Fecha_Sent",
  "Fecha_Delivered",
  "Fecha_Read",
  "Fecha_Failed",
  "Json_Encuesta",
  "createdAt",
  "updatedAt",
];

const MANDATORY_COLUMNS = ["id", "Id_Mensaje"];
const RECOMMENDED_COLUMNS = [
  "Telefono_Cliente",
  "Fecha_Sent",
  "Fecha_Delivered",
  "Fecha_Read",
  "Fecha_Failed",
  "createdAt",
  "updatedAt",
];

function cleanText(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
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

function normalizeCategory(raw) {
  const value = cleanText(raw);

  return value ? value.toLowerCase() : null;
}

function parseJsonSafe(raw) {
  const value = cleanText(raw);

  if (!value) return null;

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveTrackingStatus(row) {
  if (parseDateSafe(row.Fecha_Read)) return "read";
  if (parseDateSafe(row.Fecha_Delivered)) return "delivered";
  if (parseDateSafe(row.Fecha_Sent)) return "sent";
  if (parseDateSafe(row.Fecha_Failed)) return "failed";

  return "unknown";
}

function validateTrackingCsv(csvContent) {
  const { delimiter, headers, rows } = parseCsv(csvContent);
  const missingExpected = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
  const missingMandatory = MANDATORY_COLUMNS.filter((column) => !headers.includes(column));
  const missingRecommended = RECOMMENDED_COLUMNS.filter((column) => !headers.includes(column));
  const extraColumns = headers.filter((column) => !EXPECTED_COLUMNS.includes(column));
  const statusValues = rows.map(resolveTrackingStatus);
  const categoryValues = rows.map((row) => normalizeCategory(row.Categoria_Mensaje));
  const chargeTypeValues = rows.map((row) => cleanText(row.Tipo_Cobro));

  return {
    businessPhoneNormalizable: rows.filter((row) => normalizePhone(row.Telefono_Negocio)).length,
    businessPhonePresent: rows.filter((row) => cleanText(row.Telefono_Negocio)).length,
    categoryCounts: countByValues(categoryValues),
    chargeTypeCounts: countByValues(chargeTypeValues),
    clientPhoneNormalizable: rows.filter((row) => normalizePhone(row.Telefono_Cliente)).length,
    clientPhonePresent: rows.filter((row) => cleanText(row.Telefono_Cliente)).length,
    columns: headers.length,
    delimiter,
    duplicateIdGroups: duplicateGroupCount(rows, "id"),
    duplicateMessageIdGroups: duplicateGroupCount(rows, "Id_Mensaje"),
    extraColumns,
    failedAndDeliveredRows: rows.filter((row) => parseDateSafe(row.Fecha_Failed) && parseDateSafe(row.Fecha_Delivered)).length,
    failedAndReadRows: rows.filter((row) => parseDateSafe(row.Fecha_Failed) && parseDateSafe(row.Fecha_Read)).length,
    failedAndSentRows: rows.filter((row) => parseDateSafe(row.Fecha_Failed) && parseDateSafe(row.Fecha_Sent)).length,
    failedAtParseable: rows.filter((row) => parseDateSafe(row.Fecha_Failed)).length,
    deliveredAtParseable: rows.filter((row) => parseDateSafe(row.Fecha_Delivered)).length,
    messageIdPresent: rows.filter((row) => cleanText(row.Id_Mensaje)).length,
    missingExpected,
    missingMandatory,
    missingRecommended,
    parseableCreatedAt: rows.filter((row) => parseDateSafe(row.createdAt)).length,
    parseableUpdatedAt: rows.filter((row) => parseDateSafe(row.updatedAt)).length,
    readAtParseable: rows.filter((row) => parseDateSafe(row.Fecha_Read)).length,
    rows: rows.length,
    rowsWithoutMessageId: rows.filter((row) => !cleanText(row.Id_Mensaje)).length,
    rowsWithoutMessageIdAndClientPhone: rows.filter(
      (row) => !cleanText(row.Id_Mensaje) && !normalizePhone(row.Telefono_Cliente),
    ).length,
    sentAtParseable: rows.filter((row) => parseDateSafe(row.Fecha_Sent)).length,
    statusCounts: countByValues(statusValues),
    surveyJsonParseable: rows.filter((row) => parseJsonSafe(row.Json_Encuesta)).length,
    surveyJsonPresent: rows.filter((row) => cleanText(row.Json_Encuesta)).length,
  };
}

module.exports = {
  validateTrackingCsv,
};
