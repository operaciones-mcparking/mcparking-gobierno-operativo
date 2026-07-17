const fs = require("node:fs");
const path = require("node:path");

const { buildRecoveryIncompleteBookingImportRows } = require("./incomplete-bookings-csv-validator");
const { parseCsv } = require("./purchases-csv-validator");

const DEFAULT_BATCH_SIZE = 500;

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

function isReadyForBackfill(row) {
  return Boolean(
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
}

function sqlString(value) {
  if (value === null || value === undefined) return "null";

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInteger(value) {
  if (value === null || value === undefined) return "null";

  const parsed = Number(value);

  return Number.isInteger(parsed) ? String(parsed) : "null";
}

function sqlValueTuple(row) {
  return [
    sqlString(row.source_id),
    sqlString(row.booking_id),
    sqlString(row.intended_arrival_date),
    sqlString(row.intended_departure_date),
    sqlInteger(row.intended_days),
    sqlString(row.intended_arrival_at),
    sqlString(row.intended_departure_at),
  ].join(", ");
}

function chunkRows(rows, size) {
  const chunks = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function buildSqlBatch(rows, batchIndex) {
  const values = rows
    .map((row) => `    (${sqlValueTuple(row)})`)
    .join(",\n");

  return `-- Batch ${batchIndex}: ${rows.length} rows
update public.recovery_incomplete_bookings_import as target
set
  intended_arrival_date = source.intended_arrival_date::date,
  intended_departure_date = source.intended_departure_date::date,
  intended_days = source.intended_days::integer,
  intended_arrival_at = source.intended_arrival_at::timestamptz,
  intended_departure_at = source.intended_departure_at::timestamptz
from (
  values
${values}
) as source(
  source_id,
  booking_id,
  intended_arrival_date,
  intended_departure_date,
  intended_days,
  intended_arrival_at,
  intended_departure_at
)
where target.source_id = source.source_id
  and target.booking_id = source.booking_id
  and (
    target.intended_arrival_date is null
    or target.intended_departure_date is null
    or target.intended_days is null
    or target.intended_arrival_at is null
    or target.intended_departure_at is null
  );
`;
}

function buildBackfillSql(backfillRows, batchSize = DEFAULT_BATCH_SIZE) {
  const readyRows = backfillRows.filter(isReadyForBackfill);
  const batches = chunkRows(readyRows, batchSize);
  const header = [
    "-- Recovery incomplete bookings intended dates backfill.",
    "-- Generated locally from CSV. Review before running in Supabase SQL Editor.",
    "-- This SQL updates only intended_* columns and omits raw sensitive fields.",
    "begin;",
    "",
  ].join("\n");
  const footer = "\n-- commit;\n";

  return `${header}${batches.map((rows, index) => buildSqlBatch(rows, index + 1)).join("\n")}${footer}`;
}

function parseArgs(argv) {
  const args = [...argv];
  const filePath = args.shift();
  let sqlOut = null;
  let missingSqlOutPath = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--sql-out") {
      sqlOut = args[index + 1] ?? null;
      missingSqlOutPath = !sqlOut;
      index += 1;
    }
  }

  return { filePath, missingSqlOutPath, sqlOut };
}

function writeSqlFile(outputPath, backfillRows) {
  const resolvedPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(resolvedPath);

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(resolvedPath, buildBackfillSql(backfillRows), "utf8");

  return resolvedPath;
}

function printDryRun(filePath, csvRows, backfillRows) {
  const readyRows = backfillRows.filter(isReadyForBackfill);
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
  const { filePath, missingSqlOutPath, sqlOut } = parseArgs(process.argv.slice(2));

  if (!filePath || filePath === "--sql-out") {
    console.error(
      'Usage: node scripts/recovery/backfill-incomplete-booking-intended-dates.js "C:\\ruta\\BackendIncompleteBookings2.csv" [--sql-out tmp\\recovery-backfill-intended-dates.sql]',
    );
    process.exitCode = 1;
    return;
  }

  if (missingSqlOutPath) {
    console.error("--sql-out requires an output path.");
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

  if (sqlOut) {
    const outputPath = writeSqlFile(sqlOut, backfillRows);
    console.log(`SQL review file written: ${outputPath}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBackfillRows,
  buildBackfillSql,
};
