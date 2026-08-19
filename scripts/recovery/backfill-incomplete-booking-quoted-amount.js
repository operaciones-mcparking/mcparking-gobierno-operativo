const fs = require("node:fs");
const path = require("node:path");

const { buildRecoveryIncompleteBookingImportRows } = require("./incomplete-bookings-csv-validator");

const WRITE_CONFIRMATION = "BACKFILL_QUOTED_AMOUNT";
const TABLE_NAME = "recovery_incomplete_bookings_import";

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { createClient } = require("@supabase/supabase-js");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function sourceTimestamp(row) {
  const value = row.updated_at_source ?? row.created_at_source;
  const timestamp = value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function deduplicateLatest(files) {
  const latestBySourceId = new Map();
  let invalid = 0;
  let rowsRead = 0;

  files.forEach((filePath, fileIndex) => {
    const rows = buildRecoveryIncompleteBookingImportRows(fs.readFileSync(filePath, "utf8"));
    rowsRead += rows.length;

    for (const row of rows) {
      if (row.quoted_amount === null) invalid += 1;

      const current = latestBySourceId.get(row.source_id);
      const candidateOrder = [sourceTimestamp(row), fileIndex];
      const currentOrder = current ? [sourceTimestamp(current.row), current.fileIndex] : null;

      if (
        !currentOrder ||
        candidateOrder[0] > currentOrder[0] ||
        (candidateOrder[0] === currentOrder[0] && candidateOrder[1] >= currentOrder[1])
      ) {
        latestBySourceId.set(row.source_id, { fileIndex, row });
      }
    }
  });

  return {
    invalid,
    rows: Array.from(latestBySourceId.values(), (item) => ({
      quoted_amount: item.row.quoted_amount,
      source_id: item.row.source_id,
    })),
    rowsRead,
  };
}

function parseArguments(argv) {
  const compareDb = argv.includes("--compare-db");
  const write = argv.includes("--write");
  const confirmationArgument = argv.find((argument) => argument.startsWith("--confirm="));
  const confirmation = confirmationArgument?.slice("--confirm=".length) ?? null;
  const limitArgument = argv.find((argument) => argument.startsWith("--limit="));
  const rawLimit = limitArgument?.slice("--limit=".length);
  const limit = rawLimit === undefined ? null : Number(rawLimit);
  const files = argv.filter(
    (argument) =>
      argument !== "--compare-db" &&
      argument !== "--write" &&
      !argument.startsWith("--confirm=") &&
      !argument.startsWith("--limit="),
  );

  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  if (write && (!compareDb || confirmation !== WRITE_CONFIRMATION)) {
    throw new Error("Write blocked: use --compare-db --write --confirm=BACKFILL_QUOTED_AMOUNT.");
  }

  return { compareDb, confirmation, files, limit, write };
}

function selectCandidates(rows, limit = null) {
  const candidates = rows
    .filter((row) => row.quoted_amount !== null)
    .sort((left, right) => left.source_id.localeCompare(right.source_id, "en"));

  return limit === null ? candidates : candidates.slice(0, limit);
}

async function fetchRemoteRows(supabase, sourceIds) {
  const rows = [];

  for (let index = 0; index < sourceIds.length; index += 250) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id,source_id,quoted_amount")
      .in("source_id", sourceIds.slice(index, index + 250));

    if (error) throw error;
    rows.push(...(data ?? []));
  }

  return rows;
}

function classifyRemoteRows(localRows, remoteRows) {
  const remoteBySourceId = new Map();

  for (const row of remoteRows) {
    const matches = remoteBySourceId.get(row.source_id) ?? [];
    matches.push(row);
    remoteBySourceId.set(row.source_id, matches);
  }

  const records = localRows.map((local) => {
    const matches = remoteBySourceId.get(local.source_id) ?? [];

    if (matches.length === 0) return { local, status: "not_found" };
    if (matches.length > 1) return { local, status: "duplicate" };

    const remote = matches[0];
    const remoteAmount = remote.quoted_amount === null ? null : Number(remote.quoted_amount);

    if (remoteAmount === null) return { local, remoteId: remote.id, status: "null_to_value" };
    if (remoteAmount === local.quoted_amount) return { local, remoteId: remote.id, status: "already_filled" };

    return { local, remoteId: remote.id, status: "conflict" };
  });

  return {
    records,
    summary: {
      already_filled: records.filter((record) => record.status === "already_filled").length,
      conflicts: records.filter((record) => record.status === "conflict" || record.status === "duplicate").length,
      duplicates: records.filter((record) => record.status === "duplicate").length,
      not_found: records.filter((record) => record.status === "not_found").length,
      null_to_value: records.filter((record) => record.status === "null_to_value").length,
    },
  };
}

function createQuotedAmountRepository(supabase) {
  return {
    async findById(id) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("id,source_id,quoted_amount")
        .eq("id", id)
        .limit(2);

      if (error) throw error;

      return data ?? [];
    },
    async updateQuotedAmountIfNull(id, quotedAmount) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({ quoted_amount: quotedAmount })
        .eq("id", id)
        .is("quoted_amount", null)
        .select("id");

      if (error) throw error;

      return (data ?? []).length === 1;
    },
  };
}

async function executeWrite(records, repository) {
  const counters = {
    already_filled: 0,
    attempted: 0,
    conflicts: 0,
    errors: 0,
    not_found: 0,
    updated: 0,
    verified: 0,
  };

  for (const record of records) {
    if (record.status === "already_filled") {
      counters.already_filled += 1;
      continue;
    }

    if (record.status === "not_found") {
      counters.not_found += 1;
      continue;
    }

    if (record.status !== "null_to_value" || !record.remoteId) {
      counters.conflicts += 1;
      break;
    }

    counters.attempted += 1;

    try {
      const beforeRows = await repository.findById(record.remoteId);

      if (beforeRows.length !== 1 || beforeRows[0].source_id !== record.local.source_id) {
        if (beforeRows.length === 0) counters.not_found += 1;
        else counters.conflicts += 1;
        break;
      }

      const beforeAmount = beforeRows[0].quoted_amount === null ? null : Number(beforeRows[0].quoted_amount);

      if (beforeAmount !== null) {
        if (beforeAmount === record.local.quoted_amount) counters.already_filled += 1;
        else counters.conflicts += 1;
        break;
      }

      const updated = await repository.updateQuotedAmountIfNull(record.remoteId, record.local.quoted_amount);

      if (!updated) {
        const racedRows = await repository.findById(record.remoteId);
        const racedAmount =
          racedRows.length === 1 && racedRows[0].quoted_amount !== null
            ? Number(racedRows[0].quoted_amount)
            : null;

        if (racedRows.length === 1 && racedAmount === record.local.quoted_amount) counters.already_filled += 1;
        else if (racedRows.length === 0) counters.not_found += 1;
        else counters.conflicts += 1;
        break;
      }

      counters.updated += 1;

      const verifiedRows = await repository.findById(record.remoteId);
      const verifiedAmount =
        verifiedRows.length === 1 && verifiedRows[0].quoted_amount !== null
          ? Number(verifiedRows[0].quoted_amount)
          : null;

      if (
        verifiedRows.length !== 1 ||
        verifiedRows[0].source_id !== record.local.source_id ||
        verifiedAmount !== record.local.quoted_amount
      ) {
        counters.errors += 1;
        break;
      }

      counters.verified += 1;
    } catch {
      counters.errors += 1;
      break;
    }
  }

  return counters;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.files.length === 0) {
    throw new Error(
      "Usage: node scripts/recovery/backfill-incomplete-booking-quoted-amount.js [--compare-db] [--write --confirm=BACKFILL_QUOTED_AMOUNT] [--limit=N] <csv...>",
    );
  }

  const missing = options.files.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) throw new Error(`Missing CSV files: ${missing.join(", ")}`);

  const local = deduplicateLatest(options.files);
  const candidates = selectCandidates(local.rows, options.limit);

  if (!options.compareDb) {
    console.log(JSON.stringify({
      candidates: candidates.length,
      files: options.files.length,
      found: local.rows.length,
      invalid: local.invalid,
      mode: "local-dry-run",
      rowsRead: local.rowsRead,
      writesPerformed: 0,
    }, null, 2));
    return;
  }

  const supabase = createSupabaseServiceClient();
  const remoteRows = await fetchRemoteRows(supabase, candidates.map((row) => row.source_id));
  const comparison = classifyRemoteRows(candidates, remoteRows);

  const preWriteSummary = {
    candidates: candidates.length,
    conflicts: comparison.summary.conflicts,
    deletes: 0,
    inserts: 0,
    null_to_value: comparison.summary.null_to_value,
  };

  console.log(JSON.stringify({
    ...preWriteSummary,
    already_filled: comparison.summary.already_filled,
    duplicates: comparison.summary.duplicates,
    mode: options.write ? "write-preflight" : "read-only-db-comparison",
    not_found: comparison.summary.not_found,
    writesPerformed: 0,
  }, null, 2));

  if (!options.write) return;

  if (comparison.summary.conflicts > 0 || comparison.summary.not_found > 0) {
    throw new Error("Write blocked by conflicts, duplicate source_id, or missing rows.");
  }

  const counters = await executeWrite(
    comparison.records,
    createQuotedAmountRepository(supabase),
  );

  console.log(JSON.stringify({
    ...counters,
    mode: "write-result",
    writesPerformed: counters.updated,
  }, null, 2));

  if (counters.conflicts > 0 || counters.not_found > 0 || counters.errors > 0) {
    throw new Error("Backfill stopped after a conflict or verification error.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  WRITE_CONFIRMATION,
  classifyRemoteRows,
  createQuotedAmountRepository,
  deduplicateLatest,
  executeWrite,
  parseArguments,
  selectCandidates,
};