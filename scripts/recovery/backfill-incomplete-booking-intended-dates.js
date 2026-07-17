const fs = require("node:fs");
const path = require("node:path");

const { buildRecoveryIncompleteBookingImportRows } = require("./incomplete-bookings-csv-validator");
const { parseCsv } = require("./purchases-csv-validator");

function maskId(value) {
  if (!value) return null;

  const text = String(value);

  if (text.length <= 8) return `${text.slice(0, 2)}***`;

  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function duplicateGroupCount(values) {
  const counts = new Map();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function buildBackfillRows(csvContent) {
  return buildRecoveryIncompleteBookingImportRows(csvContent).map((row) => ({
    booking_id: row.booking_id,
    intended_arrival_at: row.intended_arrival_at,
    intended_arrival_date: row.intended_arrival_date,
    intended_days: row.intended_days,
    intended_departure_at: row.intended_departure_at,
    intended_departure_date: row.intended_departure_date,
    source_id: row.source_id,
  }));
}

function printDryRun(filePath, csvRows, backfillRows) {
  const readyRows = backfillRows.filter(
    (row) =>
      row.source_id &&
      row.booking_id &&
      (
        row.intended_arrival_date ||
        row.intended_departure_date ||
        row.intended_days !== null ||
        row.intended_arrival_at ||
        row.intended_departure_at
      ),
  );
  const rowsWithoutIntendedDates = backfillRows.filter(
    (row) => !row.intended_arrival_date && !row.intended_departure_date,
  );
  const examples = readyRows.slice(0, 3).map((row) => ({
    booking_id: maskId(row.booking_id),
    intended_arrival_at: row.intended_arrival_at ? "present" : "missing",
    intended_arrival_date: row.intended_arrival_date ? "present" : "missing",
    intended_days: row.intended_days !== null ? "present" : "missing",
    intended_departure_at: row.intended_departure_at ? "present" : "missing",
    intended_departure_date: row.intended_departure_date ? "present" : "missing",
    source_id: maskId(row.source_id),
  }));

  console.log("Recovery incomplete bookings intended dates backfill dry-run");
  console.log(`File: ${path.basename(filePath)}`);
  console.log("");
  console.table([
    { metric: "CSV rows read", value: csvRows.length },
    { metric: "Rows with source_id", value: backfillRows.filter((row) => row.source_id).length },
    { metric: "Rows with booking_id", value: backfillRows.filter((row) => row.booking_id).length },
    {
      metric: "Rows with intended_arrival_date",
      value: backfillRows.filter((row) => row.intended_arrival_date).length,
    },
    {
      metric: "Rows with intended_departure_date",
      value: backfillRows.filter((row) => row.intended_departure_date).length,
    },
    {
      metric: "Rows with intended_days",
      value: backfillRows.filter((row) => row.intended_days !== null).length,
    },
    {
      metric: "Rows with intended_arrival_at",
      value: backfillRows.filter((row) => row.intended_arrival_at).length,
    },
    {
      metric: "Rows with intended_departure_at",
      value: backfillRows.filter((row) => row.intended_departure_at).length,
    },
    { metric: "Rows ready for backfill", value: readyRows.length },
    { metric: "Rows without intended dates", value: rowsWithoutIntendedDates.length },
    {
      metric: "Duplicate source_id groups in CSV",
      value: duplicateGroupCount(backfillRows.map((row) => row.source_id)),
    },
  ]);

  console.log("");
  console.log("Anonymized examples");
  console.table(examples);
  console.log("");
  console.log("Dry-run only. No Supabase connection was opened and no data was updated.");
}

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error(
      'Usage: node scripts/recovery/backfill-incomplete-booking-intended-dates.js "C:\\ruta\\BackendIncompleteBookings2.csv"',
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const csvContent = fs.readFileSync(filePath, "utf8");
  const { rows: csvRows } = parseCsv(csvContent);
  const backfillRows = buildBackfillRows(csvContent);

  printDryRun(filePath, csvRows, backfillRows);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBackfillRows,
};
