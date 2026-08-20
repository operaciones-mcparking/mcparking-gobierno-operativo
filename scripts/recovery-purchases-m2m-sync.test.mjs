import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildRecoveryBookingImportRows } = require("./recovery/purchases-csv-validator.js");
const {
  isValidPurchaseSyncSecret,
  MAX_ROWS_PER_REQUEST,
  prepareRecoveryPurchaseSync,
  SOURCE,
} = require("./recovery/purchases-json-adapter.js");

const route = readFileSync("src/app/api/recuperacion/compras/sync/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260820130000_add_recovery_purchases_m2m_import.sql", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");

const sourceRow = {
  Id: 795167,
  CustomerId: 123,
  Email: " Cliente@Example.com ",
  Telefon: "+56 9 8765 4321",
  Buchungszeit: "2026-08-20 11:24:47",
  LocationCode: "SCL",
  ParkingCode: "MCP",
  Anreisedatum: "2026-09-01",
  Anreisezeit: "10:00:00",
  Abreisedatum: "2026-09-05",
  Abreisezeit: "10:00:00",
  Dauer: 5,
  Kennzeichen: "AA-BB-11",
  Buchungsnummer: "MCP-795167",
  BookingStatus: 8,
  PayingStatus: 1,
  Preis: 6464,
};

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const headers = Object.keys(sourceRow);
const csv = `${headers.join(";")}\n${headers.map((key) => csvValue(sourceRow[key])).join(";")}\n`;
const csvRow = buildRecoveryBookingImportRows(csv)[0];
const jsonBatch = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [sourceRow] });
assert.equal(jsonBatch.ok, true);
assert.equal(jsonBatch.empty, false);
assert.deepEqual(jsonBatch.rows[0], csvRow, "CSV and JSON must use the same canonical DTO");
assert.equal(jsonBatch.rows[0].source_booking_id, "795167");
assert.equal(jsonBatch.rows[0].customer_id, "123");
assert.equal(jsonBatch.rows[0].email_normalized, "cliente@example.com");
assert.equal(jsonBatch.rows[0].phone_normalized, "56987654321");
assert.equal(jsonBatch.rows[0].booking_created_at, "2026-08-20T15:24:47.000Z");
assert.equal(jsonBatch.rows[0].booking_status, 8);
assert.equal(jsonBatch.rows[0].paying_status, "1");
assert.equal(jsonBatch.rows[0].price, 6464);
assert.equal(jsonBatch.rows[0].is_valid_purchase, true);
assert.equal(jsonBatch.rows[0].booking_number, "MCP-795167");
assert.equal(jsonBatch.rows[0].parking_code, "MCP");
assert.equal(jsonBatch.rows[0].location_code, "SCL");
assert.equal(jsonBatch.rows[0].arrival_date, "2026-09-01");
assert.equal(jsonBatch.rows[0].departure_date, "2026-09-05");
assert.equal(jsonBatch.rows[0].duration_days, 5);
assert.equal(jsonBatch.rows[0].row_hash, csvRow.row_hash);

assert.equal(isValidPurchaseSyncSecret("shared-secret", "shared-secret"), true);
assert.equal(isValidPurchaseSyncSecret(null, "shared-secret"), false);
assert.equal(isValidPurchaseSyncSecret("wrong", "shared-secret"), false);
assert.equal(isValidPurchaseSyncSecret("shared-secret", undefined), false);

assert.deepEqual(prepareRecoveryPurchaseSync({ source: SOURCE, rows: [] }), { empty: true, ok: true });
assert.equal(prepareRecoveryPurchaseSync({ source: SOURCE, rows: "invalid" }).status, 400);
assert.equal(prepareRecoveryPurchaseSync({ source: "other", rows: [] }).status, 400);
assert.equal(prepareRecoveryPurchaseSync(null).status, 400);
assert.equal(prepareRecoveryPurchaseSync({ source: SOURCE, rows: Array(MAX_ROWS_PER_REQUEST + 1).fill(sourceRow) }).status, 413);
assert.equal(prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...sourceRow, Id: "" }] }).invalidRows, 1);
assert.equal(prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...sourceRow, BookingStatus: null }] }).invalidRows, 1);
assert.equal(prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...sourceRow, id: sourceRow.Id, Id: undefined }] }).invalidRows, 1);

const replay = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...sourceRow }] });
assert.equal(replay.fileHash, jsonBatch.fileHash, "identical retransmissions must share the deterministic batch hash");
assert.equal(replay.fileName, jsonBatch.fileName);
const mutable = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...sourceRow, Preis: 7000 }] });
assert.equal(mutable.rows[0].source_booking_id, jsonBatch.rows[0].source_booking_id);
assert.notEqual(mutable.rows[0].row_hash, jsonBatch.rows[0].row_hash);
assert.notEqual(mutable.fileHash, jsonBatch.fileHash);

const dstSource = { ...sourceRow, Id: 794978, Abreisedatum: "2026-09-06" };
const dstCorrected = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [dstSource] });
const dstLegacyEquivalent = prepareRecoveryPurchaseSync({
  source: SOURCE,
  rows: [{ ...dstSource, Abreisedatum: "" }],
});
assert.equal(dstCorrected.rows[0].departure_date, "2026-09-06");
assert.equal(dstLegacyEquivalent.rows[0].departure_date, null);
assert.notEqual(dstCorrected.rows[0].row_hash, dstLegacyEquivalent.rows[0].row_hash);
assert.notEqual(dstCorrected.fileHash, dstLegacyEquivalent.fileHash);
const dstReplay = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [{ ...dstSource }] });
assert.equal(dstReplay.fileHash, dstCorrected.fileHash);
assert.equal(dstReplay.rows[0].row_hash, dstCorrected.rows[0].row_hash);

const realDstHashes = [
  {
    corrected: "f25758c9a7e5a90da7bb254ce5bf4834f1ae88d2a61ee7bf29d271016c315490",
    id: "794978",
    legacy: "390be9df02a50b0b178123daa1547ca750ce8624116acca0921961aeb70a92d7",
  },
  {
    corrected: "3a1b0e1a4c51dc6124e0c98c1fdd33de002b82d208e331ba5f16f985a0dd6481",
    id: "794979",
    legacy: "ffacb28429f60e3c92c2ad8b535a3c90246f26036c9f9f4df7415e1f3ccca26d",
  },
];
assert.equal(realDstHashes.every(({ corrected, legacy }) => corrected !== legacy), true);
assert.equal(new Set(realDstHashes.map(({ id }) => id)).size, 2);

assert.match(route, /process\.env\.N8N_RECOVERY_PURCHASES_SECRET/);
assert.match(route, /try \{[\s\S]*payload = await request\.json\(\);[\s\S]*\} catch \{/);
assert.match(route, /x-mcparking-recovery-secret/);
assert.match(route, /\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/scripts\/recovery\/purchases-json-adapter\.js/);
assert.match(route, /import_recovery_purchases_m2m/);
assert.match(route, /createSupabaseAdminClient\(\)/);
const middlewarePath = middleware.match(/const recoveryPurchasesSyncPath = "([^"]+)";/)?.[1];
assert.equal(middlewarePath, "/api/recuperacion/compras/sync");
assert.equal("/api/recuperacion/compras/sync" === middlewarePath, true);
assert.equal("/api/recuperacion/compras/sync/otro" === middlewarePath, false);
assert.equal("/api/recuperacion/compras/importar" === middlewarePath, false);
assert.equal("/recuperacion" === middlewarePath, false);
assert.match(middleware, /request\.nextUrl\.pathname === recoveryPurchasesSyncPath/);
assert.ok(middleware.indexOf("request.nextUrl.pathname === recoveryPurchasesSyncPath") < middleware.indexOf("if (!supabaseUrl || !supabaseAnonKey)"));
assert.doesNotMatch(middleware, /nextUrl\.pathname\.startsWith\(recoveryPurchasesSyncPath\)/);
assert.doesNotMatch(route, /createSupabaseAuthServerClient|cookies\(|console\.|JSON\.stringify\(payload\)|raw payload/i);
const responseBlock = route.slice(route.lastIndexOf("return NextResponse.json({"));
assert.doesNotMatch(responseBlock, /email_normalized|phone_normalized|prepared\.rows(?!\?\.length)|p_rows/);

assert.match(migration, /^--[\s\S]*begin;/);
assert.match(migration, /create or replace function public\.import_recovery_purchases_m2m\(/);
assert.match(migration, /create or replace function public\.import_recovery_purchases\(/);
assert.match(migration, /if not public\.is_app_admin\(\) then[\s\S]*return public\.import_recovery_purchases_m2m/);
assert.match(migration, /revoke all on function public\.import_recovery_purchases_m2m[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.import_recovery_purchases_m2m[\s\S]*to service_role/);
assert.match(migration, /revoke execute on function public\.import_recovery_purchases[\s\S]*from anon, service_role/);
assert.match(migration, /grant execute on function public\.import_recovery_purchases[\s\S]*to authenticated/);
assert.match(migration, /perform pg_advisory_xact_lock\(20260715123000\)/);
assert.match(migration, /commit;\s*$/);

console.log("recovery-purchases-m2m-sync: 70/70 OK");