const fs = require("node:fs");
const path = require("node:path");

const { buildRecoveryIncompleteBookingImportRows } = require("./incomplete-bookings-csv-validator");
const { parseCsv } = require("./purchases-csv-validator");

const DEFAULT_BATCH_SIZE = 500;
const DB_COMPARE_CHUNK_SIZE = 500;

function maskId(value) {
  if (!value) return null;

  const text = String(value);

  if (text.length <= 8) return `${text.slice(0, 2)}***`;

  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function createSupabaseServiceClient() {
  loadDotEnvFile(path.resolve(process.cwd(), ".env.local"));
  loadDotEnvFile(path.resolve(process.cwd(), ".env"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for compare-db dry-run.");
  }

  const { createClient } = require("@supabase/supabase-js");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
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

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === "") return null;

  return String(value).slice(0, 10);
}

function normalizeTimestampValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeIntegerValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
}

function derivedFields(row) {
  return {
    intended_arrival_at: normalizeTimestampValue(row.intended_arrival_at),
    intended_arrival_date: normalizeDateValue(row.intended_arrival_date),
    intended_days: normalizeIntegerValue(row.intended_days),
    intended_departure_at: normalizeTimestampValue(row.intended_departure_at),
    intended_departure_date: normalizeDateValue(row.intended_departure_date),
  };
}

function fieldsDiffer(existingRow, incomingRow) {
  const existing = derivedFields(existingRow);
  const incoming = derivedFields(incomingRow);

  return Object.keys(incoming).some((key) => existing[key] !== incoming[key]);
}

function rowHasArrivalParseError(row) {
  return Boolean(row.intended_departure_date && !row.intended_arrival_date);
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
    target.intended_arrival_date is distinct from source.intended_arrival_date::date
    or target.intended_departure_date is distinct from source.intended_departure_date::date
    or target.intended_days is distinct from source.intended_days::integer
    or target.intended_arrival_at is distinct from source.intended_arrival_at::timestamptz
    or target.intended_departure_at is distinct from source.intended_departure_at::timestamptz
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
  let compareDb = false;
  let sqlOut = null;
  let missingSqlOutPath = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--compare-db") {
      compareDb = true;
      continue;
    }

    if (arg === "--sql-out") {
      sqlOut = args[index + 1] ?? null;
      missingSqlOutPath = !sqlOut;
      index += 1;
    }
  }

  return { compareDb, filePath, missingSqlOutPath, sqlOut };
}

function writeSqlFile(outputPath, backfillRows) {
  const resolvedPath = path.resolve(outputPath);
  const outputDirectory = path.dirname(resolvedPath);

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(resolvedPath, buildBackfillSql(backfillRows), "utf8");

  return resolvedPath;
}

async function fetchExistingRowsBySourceId(backfillRows) {
  const supabase = createSupabaseServiceClient();
  const sourceIds = Array.from(new Set(backfillRows.map((row) => row.source_id).filter(Boolean)));
  const existingRows = [];

  for (const chunk of chunkRows(sourceIds, DB_COMPARE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("recovery_incomplete_bookings_import")
      .select("source_id,booking_id,intended_arrival_date,intended_arrival_at,intended_departure_date,intended_departure_at,intended_days,created_at")
      .in("source_id", chunk);

    if (error) throw error;

    existingRows.push(...(data ?? []));
  }

  return existingRows;
}

function summarizeDbComparison(backfillRows, existingRows) {
  const existingBySourceId = new Map();
  const duplicateSourceIds = new Set();

  for (const row of existingRows) {
    if (!row.source_id) continue;

    if (existingBySourceId.has(row.source_id)) {
      duplicateSourceIds.add(row.source_id);
      continue;
    }

    existingBySourceId.set(row.source_id, row);
  }

  let equalRows = 0;
  let differentRows = 0;
  let notFoundRows = 0;
  let missingArrivalDate = 0;
  let parseErrorRows = 0;
  const examples = [];

  for (const row of backfillRows) {
    if (!row.source_id) continue;

    if (!row.intended_arrival_date) missingArrivalDate += 1;
    if (rowHasArrivalParseError(row)) parseErrorRows += 1;

    const existing = existingBySourceId.get(row.source_id);

    if (!existing) {
      notFoundRows += 1;
      continue;
    }

    if (fieldsDiffer(existing, row)) {
      differentRows += 1;

      if (examples.length < 5) {
        examples.push({
          booking_id: maskId(row.booking_id),
          current_arrival_date: normalizeDateValue(existing.intended_arrival_date),
          current_departure_date: normalizeDateValue(existing.intended_departure_date),
          source_id: maskId(row.source_id),
          target_arrival_date: normalizeDateValue(row.intended_arrival_date),
          target_departure_date: normalizeDateValue(row.intended_departure_date),
        });
      }
    } else {
      equalRows += 1;
    }
  }

  return {
    duplicateSourceRowsInDatabase: duplicateSourceIds.size,
    equalRows,
    examples,
    differentRows,
    missingArrivalDate,
    notFoundRows,
    parseErrorRows,
    reviewedRows: equalRows + differentRows,
  };
}

async function printDbCompareDryRun(backfillRows) {
  const existingRows = await fetchExistingRowsBySourceId(backfillRows);
  const summary = summarizeDbComparison(backfillRows, existingRows);

  console.log("Supabase comparison dry-run");
  console.log("No data was updated.");
  console.log("");
  console.table([
    { metric: "DB rows matched by source_id", value: summary.reviewedRows },
    { metric: "Dates equal", value: summary.equalRows },
    { metric: "Dates/derived fields different", value: summary.differentRows },
    { metric: "Rows not found by source_id", value: summary.notFoundRows },
    { metric: "Rows without arrival_date in CSV", value: summary.missingArrivalDate },
    { metric: "Rows with arrival parse issue", value: summary.parseErrorRows },
    { metric: "Duplicate source_id rows in DB", value: summary.duplicateSourceRowsInDatabase },
  ]);

  console.log("");
  console.log("Safe changed-row examples");
  console.table(summary.examples);
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
  console.log("Local dry-run only. No data was updated.");
}

async function main() {
  const { compareDb, filePath, missingSqlOutPath, sqlOut } = parseArgs(process.argv.slice(2));

  if (!filePath || filePath === "--sql-out") {
    console.error(
      'Usage: node scripts/recovery/backfill-incomplete-booking-intended-dates.js "C:\\ruta\\BackendIncompleteBookings2.csv" [--compare-db] [--sql-out tmp\\recovery-backfill-intended-dates.sql]',
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

  if (compareDb) {
    console.log("");
    await printDbCompareDryRun(backfillRows);
  }

  if (sqlOut) {
    const outputPath = writeSqlFile(sqlOut, backfillRows);
    console.log(`SQL review file written: ${outputPath}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildBackfillRows,
  buildBackfillSql,
  summarizeDbComparison,
};
