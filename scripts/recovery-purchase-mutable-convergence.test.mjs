import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildRecoveryBookingImportRows } = require("./recovery/purchases-csv-validator.js");

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260820120000_fix_recovery_purchase_mutable_convergence.sql", import.meta.url),
  "utf8",
);

const headers = [
  "Id", "CustomerId", "Email", "Telefon", "Buchungszeit", "LocationCode", "ParkingCode",
  "Anreisedatum", "Anreisezeit", "Abreisedatum", "Abreisezeit", "Dauer", "Kennzeichen",
  "Buchungsnummer", "BookingStatus", "PayingStatus", "Preis",
];

const defaults = {
  Id: "X-1",
  CustomerId: "customer-a",
  Email: "persona@example.com",
  Telefon: "+56912345678",
  Buchungszeit: "01/09/2026 10:00:00",
  LocationCode: "LOC-A",
  ParkingCode: "P-A",
  Anreisedatum: "10/09/2026",
  Anreisezeit: "10:00",
  Abreisedatum: "15/09/2026",
  Abreisezeit: "10:00",
  Dauer: "5",
  Kennzeichen: "AA0000",
  Buchungsnummer: "BOOK-1",
  BookingStatus: "1",
  PayingStatus: "1",
  Preis: "71442",
};

const mutableFields = [
  "customer_id",
  "location_code",
  "arrival_date",
  "departure_date",
  "duration_days",
  "email_normalized",
  "phone_normalized",
  "booking_created_at",
  "booking_status",
  "paying_status",
  "price",
  "is_valid_purchase",
  "booking_number",
  "parking_code",
];

function normalized(overrides = {}) {
  const row = { ...defaults, ...overrides };
  const csv = [headers.join(";"), headers.map((header) => row[header] ?? "").join(";")].join("\n");
  return buildRecoveryBookingImportRows(csv)[0];
}

function hasMutableChanges(stored, incoming) {
  return stored.row_hash !== incoming.row_hash
    || mutableFields.some((field) => stored[field] !== incoming[field]);
}

function converge(stored, incoming) {
  if (!hasMutableChanges(stored, incoming)) {
    return { row: stored, updatedRows: 0 };
  }

  return {
    row: {
      ...stored,
      ...Object.fromEntries(mutableFields.map((field) => [field, incoming[field]])),
      row_hash: incoming.row_hash,
    },
    updatedRows: 1,
  };
}

test("1. migration preserves the public RPC contract and security", () => {
  assert.match(migration, /import_recovery_purchases\(\s*p_file_name text,\s*p_file_size bigint,\s*p_file_hash text,\s*p_summary jsonb,\s*p_rows jsonb\s*\)/s);
  assert.match(migration, /security definer[\s\S]*if not public\.is_app_admin\(\)/i);
  assert.match(migration, /pg_advisory_xact_lock\(20260715123000\)/);
  assert.match(migration, /revoke execute[\s\S]*from anon/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});

test("2. all normalized mutable fields use null-safe direct comparisons", () => {
  for (const field of mutableFields) {
    assert.match(migration, new RegExp("existing_source_" + field + " is distinct from " + field, "i"));
  }
  assert.match(migration, /existing_source_row_hash is distinct from row_hash/i);
});

test("3. the five repaired fields converge through UPDATE", () => {
  for (const field of ["customer_id", "location_code", "arrival_date", "departure_date", "duration_days"]) {
    assert.match(migration, new RegExp("\\b" + field + "\\s*=\\s*updateable_rows\\." + field, "i"));
  }
});

const changeCases = [
  ["customer_id", { CustomerId: "customer-b" }],
  ["location_code", { LocationCode: "LOC-B" }],
  ["arrival_date", { Anreisedatum: "12/09/2026" }],
  ["departure_date", { Abreisedatum: "16/09/2026" }],
  ["duration_days", { Dauer: "6" }],
];

for (const [field, override] of changeCases) {
  test(`4.${field} A to B updates once and then remains stable`, () => {
    const initial = normalized();
    const incoming = normalized(override);
    assert.notEqual(initial.row_hash, incoming.row_hash);

    const first = converge(initial, incoming);
    assert.equal(first.updatedRows, 1);
    assert.equal(first.row[field], incoming[field]);
    assert.equal(first.row.row_hash, incoming.row_hash);

    const second = converge(first.row, incoming);
    assert.equal(second.updatedRows, 0);
    assert.equal(second.row[field], incoming[field]);
    assert.equal(second.row.row_hash, incoming.row_hash);
  });

  test(`5.${field} repairs a stale value even when hash already matches incoming`, () => {
    const initial = normalized();
    const incoming = normalized(override);
    const inconsistent = { ...initial, row_hash: incoming.row_hash };

    const first = converge(inconsistent, incoming);
    assert.equal(first.updatedRows, 1);
    assert.equal(first.row[field], incoming[field]);
    assert.equal(first.row.row_hash, incoming.row_hash);
    assert.equal(converge(first.row, incoming).updatedRows, 0);
  });
}

test("6. null transitions are detected with the same normalized contract", () => {
  for (const [field, emptyOverride] of [
    ["customer_id", { CustomerId: "" }],
    ["location_code", { LocationCode: "" }],
    ["arrival_date", { Anreisedatum: "" }],
    ["departure_date", { Abreisedatum: "" }],
    ["duration_days", { Dauer: "n/a" }],
  ]) {
    const value = normalized();
    const empty = normalized(emptyOverride);
    assert.equal(empty[field], null);
    assert.equal(converge(value, empty).updatedRows, 1);
    assert.equal(converge(empty, value).updatedRows, 1);
  }
});

test("7. events expose customer_id only as a changed field name", () => {
  assert.match(migration, /customer_id_changed then 'customer_id'/i);
  assert.doesNotMatch(migration, /previous_customer_id|current_customer_id/i);
  for (const field of ["location_code", "arrival_date", "departure_date", "duration_days"]) {
    assert.match(migration, new RegExp("previous_" + field, "i"));
    assert.match(migration, new RegExp("current_" + field, "i"));
    assert.match(migration, new RegExp("then '" + field + "'", "i"));
  }
});

test("8. booking-number conflicts remain excluded from updates", () => {
  assert.match(migration, /has_mutable_changes\s+and \(existing_booking_id is null or existing_booking_id = existing_source_id\)/i);
  assert.match(migration, /has_mutable_changes\s+and existing_booking_id is not null\s+and existing_booking_id <> existing_source_id/i);
});

test("9. persisted normalized values and row_hash converge to the same real input", () => {
  const incoming = normalized({ Anreisedatum: "12/09/2026", LocationCode: "LOC-B" });
  const first = converge(normalized(), incoming);
  assert.equal(first.updatedRows, 1);
  for (const field of mutableFields) {
    assert.equal(first.row[field], incoming[field]);
  }
  assert.equal(first.row.row_hash, incoming.row_hash);
  assert.equal(normalized({ Anreisedatum: "12/09/2026", LocationCode: "LOC-B" }).row_hash, first.row.row_hash);
});
