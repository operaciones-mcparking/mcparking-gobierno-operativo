import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const mapperPath = "src/lib/customer-window/mcp-eap-booking-mapper.ts";
const mapperSource = readFileSync(mapperPath, "utf8");

function loadMapper() {
  const compiled = ts.transpileModule(mapperSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireFromMapper = createRequire(pathToFileURL(resolve(mapperPath)));
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: (specifier) => specifier === "server-only" ? {} : requireFromMapper(specifier),
  }, { filename: mapperPath });
  return module.exports;
}

const { mapMcpEapBookingSourceRow } = loadMapper();

function source(overrides = {}) {
  return {
    Abreisedatum: "2026-09-03",
    Abreisezeit: "19:30:00",
    Anreisedatum: "2026-09-01",
    Anreisezeit: "08:15:00",
    BookingPaid: "71442",
    BookingStatus: 1,
    Buchungsnummer: " MCP-100 ",
    Buchungszeit: "2026-08-31 10:11:12",
    CustomerId: "5001",
    Dauer: "2",
    Email: " CLIENTE@EXAMPLE.COM ",
    Id: "200001",
    Kennzeichen: "ab-cd 12",
    ParkingCode: "MPV",
    PayingStatus: "2",
    Personenzahl: "3",
    Preis: "71442",
    PromotionCode: " PROMO ",
    PromotionCodeCalculatedValue: "0",
    SubDaysUsed: "0",
    Telefon: "+56 9 1234 5678",
    Website: 1,
    ...overrides,
  };
}

test("maps the exact Website and ParkingCode business catalog", () => {
  const cases = [
    [{ Website: 1, ParkingCode: "MPV" }, "MCP", "MCPARKING VESPUCIO"],
    [{ Website: 1, ParkingCode: "OTHER" }, "MCP", "MCPARKING"],
    [{ Website: 1, ParkingCode: null }, "MCP", "MCPARKING"],
    [{ Website: 2, ParkingCode: "ANY" }, "EAP", "ESTACIONAMIENTO AEROPUERTO"],
    [{ Website: 4, ParkingCode: "MPV" }, "MCP", "MCPARKING VESPUCIO"],
    [{ Website: 4, ParkingCode: "OTHER" }, "MCP", "MCPARKING"],
  ];
  for (const [overrides, brand, parking] of cases) {
    const row = mapMcpEapBookingSourceRow(source(overrides));
    assert.equal(row.brand_normalized, brand);
    assert.equal(row.parking_normalized, parking);
  }
});

test("preserves valid and commercially invalid integer booking statuses", () => {
  assert.equal(mapMcpEapBookingSourceRow(source({ BookingStatus: 1 })).booking_status, 1);
  assert.equal(mapMcpEapBookingSourceRow(source({ BookingStatus: 8 })).booking_status, 8);
  assert.equal(mapMcpEapBookingSourceRow(source({ BookingStatus: 2 })).booking_status, 2);
  for (const BookingStatus of [null, "invalid", 1.5]) {
    assert.throws(() => mapMcpEapBookingSourceRow(source({ BookingStatus })));
  }
});

test("derives pack only when all four approved conditions hold", () => {
  const validPack = source({
    BookingPaid: 0,
    Preis: 0,
    PromotionCodeCalculatedValue: null,
    SubDaysUsed: 3,
  });
  assert.equal(mapMcpEapBookingSourceRow(validPack).is_pack, true);

  for (const override of [
    { BookingPaid: 1 },
    { Preis: 1 },
    { PromotionCodeCalculatedValue: 1 },
    { SubDaysUsed: 0 },
  ]) {
    assert.equal(mapMcpEapBookingSourceRow({ ...validPack, ...override }).is_pack, false);
  }
  assert.equal(mapMcpEapBookingSourceRow(source({ SubDaysUsed: 5 })).is_pack, false);
});

test("preserves zero values and maps source identity", () => {
  const row = mapMcpEapBookingSourceRow(source({
    BookingPaid: 0,
    Preis: 0,
    PromotionCodeCalculatedValue: 0,
    SubDaysUsed: 0,
  }));
  assert.equal(row.source, "MCP_EAP");
  assert.equal(row.source_row_id, 200001);
  assert.equal(row.source_customer_id, 5001);
  assert.equal(row.source_booking_code, "MCP-100");
  assert.equal(row.booking_paid, 0);
  assert.equal(row.source_total_amount, 0);
  assert.equal(row.promotion_discount_amount, 0);
  assert.equal(row.sub_days_used, 0);
});

test("keeps source timestamps timezone-free and combines arrival and departure", () => {
  const row = mapMcpEapBookingSourceRow(source());
  assert.equal(row.source_created_at, "2026-08-31 10:11:12");
  assert.equal(row.planned_arrival_at, "2026-09-01 08:15:00");
  assert.equal(row.planned_departure_at, "2026-09-03 19:30:00");
  assert.doesNotMatch(row.source_created_at, /Z|[+-]\d{2}:?\d{2}$/);
  assert.throws(() => mapMcpEapBookingSourceRow(source({ Buchungszeit: "2026-08-31T10:11:12Z" })));
});

test("normalizes phone email and plate while preserving raw values", () => {
  const row = mapMcpEapBookingSourceRow(source());
  assert.equal(row.phone_normalized, "56912345678");
  assert.equal(row.email_normalized, "cliente@example.com");
  assert.equal(row.plate_normalized, "ABCD12");
  assert.equal(row.phone_raw, "+56 9 1234 5678");
  assert.equal(row.email_raw, " CLIENTE@EXAMPLE.COM ");
  assert.equal(row.plate_raw, "ab-cd 12");
});

test("rejects missing mandatory identifiers and unsupported websites", () => {
  for (const overrides of [
    { Id: 0 },
    { CustomerId: null },
    { Buchungsnummer: " " },
    { Buchungszeit: null },
    { Website: null },
    { Website: 3 },
  ]) {
    assert.throws(() => mapMcpEapBookingSourceRow(source(overrides)));
  }
});

test("row hash is stable and changes for every representative mutable family", () => {
  const baseline = mapMcpEapBookingSourceRow(source());
  assert.equal(baseline.row_hash, mapMcpEapBookingSourceRow(source()).row_hash);
  const changes = [
    { Telefon: "+56 9 9999 9999" },
    { Email: "other@example.com" },
    { Kennzeichen: "ZZZZ99" },
    { BookingStatus: 8 },
    { BookingStatus: 2 },
    { PayingStatus: 3 },
    { Website: 2 },
    { ParkingCode: "OTHER" },
    { Anreisezeit: "09:00:00" },
    { Abreisezeit: "20:00:00" },
    { Preis: 70000 },
    { BookingPaid: 70000 },
    { PromotionCode: "OTHER" },
    { PromotionCodeCalculatedValue: 100 },
    { Dauer: 3 },
    { Personenzahl: 4 },
    { SubDaysUsed: 1 },
  ];
  for (const change of changes) {
    assert.notEqual(mapMcpEapBookingSourceRow(source(change)).row_hash, baseline.row_hash);
  }
  assert.doesNotMatch(mapperSource, /source_synced_at|(?<!source_)created_at|(?<!source_)updated_at/);
});
