import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildRecoveryIncompleteBookingImportRows,
  normalizeQuotedAmount,
} = require("./recovery/incomplete-bookings-csv-validator.js");

const migration = readFileSync("supabase/migrations/20260819120000_add_recovery_cart_quoted_amount.sql", "utf8");
const mutableRowsMigration = readFileSync(
  "supabase/migrations/20260803110000_create_recovery_import_row_changes.sql",
  "utf8",
);
const route = readFileSync("src/app/api/recuperacion/carritos/importar/route.ts", "utf8");
const loader = readFileSync("src/lib/dashboard/data.ts", "utf8");
const ui = readFileSync("src/app/recuperacion/recovery-cart-audit-table.tsx", "utf8");
const backfill = readFileSync("scripts/recovery/backfill-incomplete-booking-quoted-amount.js", "utf8");
const {
  classifyRemoteRows,
  executeWrite,
  parseArguments,
  selectCandidates,
} = require("./recovery/backfill-incomplete-booking-quoted-amount.js");

function writableRecord(amount = 14309) {
  return {
    local: { quoted_amount: amount, source_id: "source-1" },
    remoteId: "remote-1",
    status: "null_to_value",
  };
}

function repository(initialRows) {
  const rows = initialRows.map((row) => ({ ...row }));
  const updates = [];

  return {
    updates,
    async findById(id) {
      return rows.filter((row) => row.id === id).map((row) => ({ ...row }));
    },
    async updateQuotedAmountIfNull(id, quotedAmount) {
      const row = rows.find((item) => item.id === id);
      if (!row || row.quoted_amount !== null) return false;
      updates.push({ id, quoted_amount: quotedAmount });
      row.quoted_amount = quotedAmount;
      return true;
    },
  };
}

function csvRow({ id = "source-1", price, calculatedPrice = 999 }) {
  const bform = JSON.stringify({
    arrival_date: "2026-08-20",
    calculated_price: calculatedPrice,
    departure_date: "2026-08-21",
    price,
  }).replaceAll('"', '""');

  return [
    "id,booking_id,type,form_datetime,bform",
    `${id},booking-${id},abandoned,2026-08-19 10:00:00,"${bform}"`,
  ].join("\n");
}

test("1. normaliza number, string y cero con maximo dos decimales", () => {
  assert.equal(normalizeQuotedAmount(14309), 14309);
  assert.equal(normalizeQuotedAmount(" 22500.50 "), 22500.5);
  assert.equal(normalizeQuotedAmount(0), 0);
  assert.equal(normalizeQuotedAmount("0"), 0);
});

test("2. rechaza valores ambiguos y no usa calculated_price", () => {
  for (const value of ["", "-1", "$10.000", "10,000", "10.000,50", {}, [], null, Number.NaN, Number.POSITIVE_INFINITY, 1.234]) {
    assert.equal(normalizeQuotedAmount(value), null);
  }

  const [row] = buildRecoveryIncompleteBookingImportRows(csvRow({ price: null, calculatedPrice: 231 }));
  assert.equal(row.quoted_amount, null);
});

test("3. bform.price viaja al contrato y participa en row_hash", () => {
  const [first] = buildRecoveryIncompleteBookingImportRows(csvRow({ price: "14309" }));
  const [second] = buildRecoveryIncompleteBookingImportRows(csvRow({ price: "22500" }));

  assert.equal(first.quoted_amount, 14309);
  assert.equal(second.quoted_amount, 22500);
  assert.notEqual(first.row_hash, second.row_hash);
  assert.match(route, /quoted_amount: number \| null/);
});

test("4. migracion agrega numeric nullable y actualiza por source_id sin insertar backfill", () => {
  assert.match(migration, /add column quoted_amount numeric\(12,2\)/i);
  assert.doesNotMatch(migration, /quoted_amount numeric\(12,2\) not null/i);
  assert.match(migration, /target\.source_id = first_input\.source_id/i);
  assert.match(migration, /target\.quoted_amount is distinct from first_input\.quoted_amount/i);
  assert.match(migration, /update public\.recovery_incomplete_bookings_import target/i);
  assert.doesNotMatch(migration, /insert into public\.recovery_incomplete_bookings_import[\s\S]*quoted_amount/i);
  assert.match(migration, /import_recovery_incomplete_bookings_without_quoted_amount/i);
});

test("5. read model entrega solo quoted_amount persistido", () => {
  assert.match(loader, /intended_departure_date,quoted_amount,row_hash/);
  assert.match(loader, /quoted_amount: cart\.quoted_amount === null \? null : Number\(cart\.quoted_amount\)/);
  assert.doesNotMatch(loader, /bform/);
});

test("6. UI muestra monto real, cotizado, pack y sin dato en desktop/mobile", () => {
  assert.match(ui, /function primaryAmountLabel/);
  assert.match(ui, /recovered_pack"\) return "Pack"/);
  assert.match(ui, /const label = row\.audit_status === "recovered_pack" \? "Valor reserva" : "Cotizado"/);
  assert.match(ui, /row\.quoted_amount === null \? "Sin dato"/);
  assert.equal((ui.match(/quotedAmountLabel\(row\)/g) ?? []).length, 2);
  assert.match(ui, /break-words text-\[11px\]/);
});

test("7. default y compare-db permanecen read-only", () => {
  assert.equal(parseArguments(["one.csv"]).write, false);
  assert.equal(parseArguments(["--compare-db", "one.csv"]).write, false);
  assert.equal(backfill.includes('mode: "local-dry-run"'), true);
  assert.equal(backfill.includes('mode: options.write ? "write-preflight" : "read-only-db-comparison"'), true);
});

test("8. write requiere compare-db y confirmacion exacta", () => {
  assert.throws(() => parseArguments(["--write", "one.csv"]), /Write blocked/);
  assert.throws(() => parseArguments(["--compare-db", "--write", "--confirm=BACKFILL", "one.csv"]), /Write blocked/);
  assert.equal(parseArguments(["--compare-db", "--write", "--confirm=BACKFILL_QUOTED_AMOUNT", "one.csv"]).write, true);
});

test("9. update contiene solo quoted_amount y usa id remoto", () => {
  assert.equal(backfill.includes('.update({ quoted_amount: quotedAmount })'), true);
  assert.equal(backfill.includes('.eq("id", id)'), true);
  assert.equal(backfill.includes('.is("quoted_amount", null)'), true);
  assert.doesNotMatch(backfill, /\.update\(\{[^}]*row_hash/s);
  assert.doesNotMatch(backfill, /\.insert\(|\.upsert\(|\.delete\(|\.rpc\(/);
});

test("10. remoto null actualiza y verifica", async () => {
  const repo = repository([{ id: "remote-1", quoted_amount: null, source_id: "source-1" }]);
  const result = await executeWrite([writableRecord()], repo);
  assert.deepEqual(repo.updates, [{ id: "remote-1", quoted_amount: 14309 }]);
  assert.equal(result.attempted, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.verified, 1);
});

test("11. mismo valor se omite sin escribir", async () => {
  const repo = repository([{ id: "remote-1", quoted_amount: 14309, source_id: "source-1" }]);
  const result = await executeWrite([{ ...writableRecord(), status: "already_filled" }], repo);
  assert.equal(result.already_filled, 1);
  assert.equal(result.updated, 0);
});

test("12. valor remoto diferente es conflicto y no sobreescribe", async () => {
  const classified = classifyRemoteRows(
    [{ quoted_amount: 14309, source_id: "source-1" }],
    [{ id: "remote-1", quoted_amount: 999, source_id: "source-1" }],
  );
  const repo = repository([{ id: "remote-1", quoted_amount: 999, source_id: "source-1" }]);
  const result = await executeWrite(classified.records, repo);
  assert.equal(result.conflicts, 1);
  assert.equal(repo.updates.length, 0);
});

test("13. source_id duplicado no escribe", async () => {
  const classified = classifyRemoteRows(
    [{ quoted_amount: 14309, source_id: "source-1" }],
    [
      { id: "remote-1", quoted_amount: null, source_id: "source-1" },
      { id: "remote-2", quoted_amount: null, source_id: "source-1" },
    ],
  );
  const repo = repository([]);
  const result = await executeWrite(classified.records, repo);
  assert.equal(classified.summary.duplicates, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(repo.updates.length, 0);
});

test("14. source_id no encontrado no escribe", async () => {
  const classified = classifyRemoteRows([{ quoted_amount: 14309, source_id: "source-1" }], []);
  const repo = repository([]);
  const result = await executeWrite(classified.records, repo);
  assert.equal(result.not_found, 1);
  assert.equal(repo.updates.length, 0);
});

test("15. limit y seleccion son deterministas", () => {
  const rows = [
    { quoted_amount: 3, source_id: "c" },
    { quoted_amount: 1, source_id: "a" },
    { quoted_amount: 2, source_id: "b" },
  ];
  assert.deepEqual(selectCandidates(rows, 2).map((row) => row.source_id), ["a", "b"]);
  assert.equal(selectCandidates(
    Array.from({ length: 20 }, (_, index) => ({
      quoted_amount: index,
      source_id: String(index).padStart(2, "0"),
    })),
    10,
  ).length, 10);
});

test("16. cero se persiste y row_hash permanece fuera del update", async () => {
  const repo = repository([{ id: "remote-1", quoted_amount: null, source_id: "source-1" }]);
  const result = await executeWrite([writableRecord(0)], repo);
  assert.deepEqual(repo.updates, [{ id: "remote-1", quoted_amount: 0 }]);
  assert.equal(result.verified, 1);
  assert.doesNotMatch(backfill, /row_hash/);
});

test("17. hash legacy converge en la primera reimportacion y la segunda queda estable", () => {
  const [input] = buildRecoveryIncompleteBookingImportRows(csvRow({ id: "source-stable", price: "71442" }));
  const existing = {
    id: "existing-pk",
    quoted_amount: 71442,
    row_hash: "legacy-hash-without-quoted-amount",
    source_id: "source-stable",
  };

  function importExisting(row, incoming) {
    assert.equal(row.source_id, incoming.source_id);

    if (row.row_hash === incoming.row_hash) {
      return { insertedRows: 0, row, updatedRows: 0 };
    }

    return {
      insertedRows: 0,
      row: { ...row, row_hash: incoming.row_hash },
      updatedRows: 1,
    };
  }

  const first = importExisting(existing, input);
  assert.equal(first.insertedRows, 0);
  assert.equal(first.updatedRows, 1);
  assert.equal(first.row.id, existing.id);
  assert.equal(first.row.source_id, existing.source_id);
  assert.equal(first.row.quoted_amount, 71442);
  assert.equal(first.row.row_hash, input.row_hash);

  const second = importExisting(first.row, input);
  assert.equal(second.insertedRows, 0);
  assert.equal(second.updatedRows, 0);
  assert.deepEqual(second.row, first.row);

  assert.match(mutableRowsMigration, /existing_source_row_hash is distinct from row_hash/i);
  assert.match(
    mutableRowsMigration,
    /update public\.recovery_incomplete_bookings_import target[\s\S]*row_hash = updateable_rows\.row_hash/i,
  );
  assert.match(mutableRowsMigration, /'updatedRows', v_updated_rows/i);
  assert.match(migration, /changes\.operation in \('inserted', 'updated'\)/i);
  assert.match(migration, /set quoted_amount = quote_changes\.current_quoted_amount/i);
});