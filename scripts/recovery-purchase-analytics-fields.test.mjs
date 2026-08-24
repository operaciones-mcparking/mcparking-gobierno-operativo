import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildRecoveryBookingImportRows,
  buildRecoveryBookingImportRowsFromRows,
  EXPECTED_COLUMNS,
} = require("./recovery/purchases-csv-validator.js");
const { MAX_ROWS_PER_REQUEST, prepareRecoveryPurchaseSync, SOURCE } = require("./recovery/purchases-json-adapter.js");

const migration = readFileSync(
  "supabase/migrations/20260824120000_add_recovery_purchase_analytics_fields.sql",
  "utf8",
);

const sourceRow = {
  Id: 795500,
  CustomerId: 123,
  Email: "cliente@example.com",
  Telefon: "+56 9 8765 4321",
  Buchungszeit: "2026-08-24 10:30:00",
  LocationCode: "SCL",
  ParkingCode: "MCP",
  Anreisedatum: "2026-09-01",
  Anreisezeit: "10:00:00",
  Abreisedatum: "2026-09-05",
  Abreisezeit: "10:00:00",
  Dauer: 5,
  Kennzeichen: "AA-BB-11",
  Buchungsnummer: "MCP-795500",
  BookingStatus: 8,
  PayingStatus: 1,
  Preis: 71442,
  Personenzahl: 3,
  PromotionCode: " PROMO20 ",
  PromotionCodeCalculatedValue: "3990.50",
  BookingPaid: "67451.50",
  Website: 2,
  SubDaysUsed: 0,
};

function toCsv(row) {
  const headers = Object.keys(row);
  const values = headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`);
  return `${headers.join(";")}\n${values.join(";")}\n`;
}

function normalized(row = sourceRow) {
  return buildRecoveryBookingImportRowsFromRows([row])[0];
}

test("the six source columns are optional expected columns", () => {
  for (const column of [
    "Personenzahl",
    "PromotionCode",
    "PromotionCodeCalculatedValue",
    "BookingPaid",
    "Website",
    "SubDaysUsed",
  ]) {
    assert.equal(EXPECTED_COLUMNS.includes(column), true);
  }
});

test("CSV and JSON share the canonical six-field DTO", () => {
  const csvRow = buildRecoveryBookingImportRows(toCsv(sourceRow))[0];
  const json = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [sourceRow] });
  assert.equal(json.ok, true);
  assert.deepEqual(json.rows[0], csvRow);
  assert.deepEqual(
    {
      booking_paid: csvRow.booking_paid,
      person_count: csvRow.person_count,
      promotion_code: csvRow.promotion_code,
      promotion_discount_amount: csvRow.promotion_discount_amount,
      sub_days_used: csvRow.sub_days_used,
      website_source: csvRow.website_source,
    },
    {
      booking_paid: 67451.5,
      person_count: 3,
      promotion_code: "PROMO20",
      promotion_discount_amount: 3990.5,
      sub_days_used: 0,
      website_source: 2,
    },
  );
});

test("zero amounts and zero sub days remain zero", () => {
  const row = normalized({ ...sourceRow, BookingPaid: 0, SubDaysUsed: 0 });
  assert.equal(row.booking_paid, 0);
  assert.equal(row.sub_days_used, 0);
});

test("empty optional values normalize to null", () => {
  const row = normalized({
    ...sourceRow,
    BookingPaid: "",
    Personenzahl: "",
    PromotionCode: "  ",
    PromotionCodeCalculatedValue: null,
    SubDaysUsed: undefined,
    Website: "",
  });
  assert.equal(row.booking_paid, null);
  assert.equal(row.person_count, null);
  assert.equal(row.promotion_code, null);
  assert.equal(row.promotion_discount_amount, null);
  assert.equal(row.sub_days_used, null);
  assert.equal(row.website_source, null);
});

test("website source preserves known and unknown integer codes", () => {
  for (const code of [1, 2, 4, 99]) {
    assert.equal(normalized({ ...sourceRow, Website: code }).website_source, code);
  }
});

test("each analytics field participates in row_hash", () => {
  const baseline = normalized();
  const changes = {
    BookingPaid: 1,
    Personenzahl: 4,
    PromotionCode: "OTHER",
    PromotionCodeCalculatedValue: 10,
    SubDaysUsed: 2,
    Website: 4,
  };
  for (const [field, value] of Object.entries(changes)) {
    assert.notEqual(normalized({ ...sourceRow, [field]: value }).row_hash, baseline.row_hash, field);
  }
});

test("legacy CSV and JSON payloads without the six fields remain valid", () => {
  const legacy = { ...sourceRow };
  for (const field of [
    "BookingPaid",
    "Personenzahl",
    "PromotionCode",
    "PromotionCodeCalculatedValue",
    "SubDaysUsed",
    "Website",
  ]) delete legacy[field];
  const csvRow = buildRecoveryBookingImportRows(toCsv(legacy))[0];
  const json = prepareRecoveryPurchaseSync({ source: SOURCE, rows: [legacy] });
  assert.equal(json.ok, true);
  assert.deepEqual(json.rows[0], csvRow);
  for (const field of [
    "booking_paid",
    "person_count",
    "promotion_code",
    "promotion_discount_amount",
    "sub_days_used",
    "website_source",
  ]) assert.equal(csvRow[field], null, field);
});

test("M2M keeps its 500-row limit", () => {
  assert.equal(MAX_ROWS_PER_REQUEST, 500);
  assert.equal(
    prepareRecoveryPurchaseSync({ source: SOURCE, rows: Array(501).fill(sourceRow) }).status,
    413,
  );
});

test("schema adds nullable analytics columns and non-negative checks", () => {
  assert.match(migration, /add column if not exists person_count smallint/);
  assert.match(migration, /add column if not exists promotion_code text/);
  assert.match(migration, /add column if not exists promotion_discount_amount numeric\(10,2\)/);
  assert.match(migration, /add column if not exists booking_paid numeric\(10,2\)/);
  assert.match(migration, /add column if not exists website_source integer/);
  assert.match(migration, /add column if not exists sub_days_used integer/);
  assert.match(migration, /person_count is null or person_count >= 0/);
  assert.match(migration, /promotion_discount_amount is null or promotion_discount_amount >= 0/);
  assert.match(migration, /booking_paid is null or booking_paid >= 0/);
  assert.match(migration, /sub_days_used is null or sub_days_used >= 0/);
  assert.doesNotMatch(migration, /website_source\s+in\s*\(/i);
});

test("RPC reads, inserts, compares and updates every analytics field", () => {
  for (const field of [
    "person_count",
    "promotion_code",
    "promotion_discount_amount",
    "booking_paid",
    "website_source",
    "sub_days_used",
  ]) {
    assert.match(migration, new RegExp(`existing_source_${field} is distinct from ${field}`));
    assert.match(migration, new RegExp(`${field} = updateable_rows\\.${field}`));
    assert.match(migration, new RegExp(`existing_source_row\\.${field}`));
    assert.match(migration, new RegExp(`inserted_rows\\.${field}`));
  }
});

test("same source updates by existing UUID and booking collision rules remain intact", () => {
  assert.match(migration, /where target\.id = updateable_rows\.existing_source_id/);
  assert.match(migration, /where existing_source_id is not null\s+and has_mutable_changes\s+and \(existing_booking_id is null or existing_booking_id = existing_source_id\)/);
  assert.match(migration, /where existing_source_id is null\s+and existing_booking_id is null/);
  assert.match(migration, /existing_booking_id <> existing_source_id/);
});

test("row changes record old/current values and changed field names", () => {
  for (const field of [
    "person_count",
    "promotion_code",
    "promotion_discount_amount",
    "booking_paid",
    "website_source",
    "sub_days_used",
  ]) {
    assert.match(migration, new RegExp(`previous_${field}`));
    assert.match(migration, new RegExp(`current_${field}`));
    assert.match(migration, new RegExp(`then '${field}' end`));
  }
});

test("duplicate count response contract remains unchanged", () => {
  assert.match(migration, /'internalDuplicateRows', v_internal_duplicate_rows/);
  assert.match(migration, /'sourceDuplicateRows', v_source_duplicate_rows/);
  assert.match(migration, /'bookingDuplicateRows', v_booking_duplicate_rows/);
  assert.match(migration, /'skippedDuplicateRows', v_internal_duplicate_rows \+ v_source_duplicate_rows \+ v_booking_duplicate_rows/);
});

test("no derived analytics fields are persisted", () => {
  assert.doesNotMatch(migration, /\bpayment_mode\b|\buses_pack\b|\buses_promotion\b/);
  assert.doesNotMatch(migration, /add column if not exists brand\b/);
});