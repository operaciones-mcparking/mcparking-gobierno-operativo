import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const mapperPath = "src/lib/customer-window/okp-booking-mapper.ts";
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

const { mapOkpBookingSourceRow } = loadMapper();

function source(overrides = {}) {
  return {
    ID_BL: "9001",
    J2_descuento: "-100",
    J2_dias_pagados_paquete: "0",
    J2_paquetes: '{"pack":{"codtransa":"TX-1","codigo":"PACK-A"}}',
    J2_valorTotal: "70.000",
    J3_codcupon: " CUPON10 ",
    J3_montocupon: "3.990",
    admission: "2026-08-25 08:00:00",
    confirmada: 1,
    createdAt: "2026-08-24 10:11:12",
    departure: "2026-08-27 19:30:00",
    emailfactura: " CLIENTE@EXAMPLE.COM ",
    fh_confirma_entrada: null,
    fh_confirma_salida: null,
    fono: "+56 9 1234 5678",
    id_sede: "RC",
    inactiva: null,
    numreserva: " OKP-100 ",
    pagado: 0,
    patente: "ab-cd 12",
    status: "active",
    updatedAt: "2026-08-25 12:13:14",
    valorReserva: "71442",
    vanPassengers: "3",
    ...overrides,
  };
}

test("normalizes identity, conservative booleans, parking, and local timestamps", () => {
  const row = mapOkpBookingSourceRow(source());
  assert.equal(row.phone_normalized, "56912345678");
  assert.equal(row.email_normalized, "cliente@example.com");
  assert.equal(row.plate_normalized, "ABCD12");
  assert.equal(row.is_confirmed, true);
  assert.equal(row.is_paid, false);
  assert.equal(row.is_inactive, null);
  assert.equal(row.parking_normalized, "OKP_RC");
  assert.equal(row.planned_arrival_at, "2026-08-25 08:00:00");
  assert.equal(mapOkpBookingSourceRow(source({ admission: "2026-08-25T08:00:00Z" })).planned_arrival_at, null);
});

test("maps real parking UUIDs and keeps short identifiers as fallback", () => {
  const realSites = [
    ["31b57b05-ed68-421a-bf0f-f6520c3f65b4", "OKP_RC"],
    ["be352bf1-38a7-42d4-9169-ac5ea653d34a", "OKP_EXP"],
    ["1560f317-05f7-416b-8e30-e17950f6acc2", "OKP_PREMIUM"],
    ["7ece5c1a-40a4-49ae-aa24-96b21fc39c42", "OKP_FIDAE"],
  ];

  for (const [id_sede, expectedParking] of realSites) {
    const row = mapOkpBookingSourceRow(source({ id_sede }));
    assert.equal(row.source_site_id, id_sede);
    assert.equal(row.parking_normalized, expectedParking);
  }

  assert.deepEqual(
    ["RC", "EXPRESS", "PREMIUM", "FIDAE"].map((id_sede) => mapOkpBookingSourceRow(source({ id_sede })).parking_normalized),
    ["OKP_RC", "OKP_EXP", "OKP_PREMIUM", "OKP_FIDAE"],
  );

  const unknown = mapOkpBookingSourceRow(source({ id_sede: "unknown-site" }));
  assert.equal(unknown.source_site_id, "unknown-site");
  assert.equal(unknown.parking_normalized, null);
});

test("keeps valorReserva raw and safely accepts normal NaN and negative values", () => {
  assert.equal(mapOkpBookingSourceRow(source({ valorReserva: "71442" })).valor_reserva_amount, 71442);
  assert.equal(mapOkpBookingSourceRow(source({ valorReserva: "NaN" })).valor_reserva_amount, null);
  assert.equal(mapOkpBookingSourceRow(source({ valorReserva: "-1250" })).valor_reserva_amount, -1250);
  assert.equal(mapOkpBookingSourceRow(source({ valorReserva: " NaN " })).valor_reserva_raw, " NaN ");
});

test("parses valid packs, preserves invalid JSON, and derives pack by paid days", () => {
  const valid = mapOkpBookingSourceRow(source());
  assert.equal(valid.is_pack, true);
  assert.equal(valid.pack_reference, "TX-1");
  assert.equal(valid.pack_code, "PACK-A");
  assert.equal(valid.pack_payload.pack.codtransa, "TX-1");

  const invalid = mapOkpBookingSourceRow(source({ J2_dias_pagados_paquete: "0", J2_paquetes: "{invalid" }));
  assert.equal(invalid.pack_payload, null);
  assert.equal(invalid.j2_paquetes_raw, "{invalid");
  assert.equal(invalid.is_pack, false);

  const byDays = mapOkpBookingSourceRow(source({ J2_dias_pagados_paquete: "2", J2_paquetes: null }));
  assert.equal(byDays.is_pack, true);
  assert.equal(byDays.pack_paid_days, 2);
});

test("does not invent a scalar when pack references or codes conflict", () => {
  const row = mapOkpBookingSourceRow(source({
    J2_paquetes: '[{"codtransa":"A","codigo":"X"},{"codtransa":"B","codigo":"Y"}]',
  }));
  assert.equal(row.is_pack, true);
  assert.equal(row.pack_reference, null);
  assert.equal(row.pack_code, null);
  assert.equal(row.pack_payload.length, 2);
});

test("row hash is stable, changes with mutable data, and excludes sync metadata", () => {
  const first = mapOkpBookingSourceRow(source());
  const same = mapOkpBookingSourceRow(source());
  const changed = mapOkpBookingSourceRow(source({ fh_confirma_entrada: "2026-08-25 15:00:00" }));
  const changedSite = mapOkpBookingSourceRow(source({ id_sede: "31b57b05-ed68-421a-bf0f-f6520c3f65b4" }));
  const withSyncMetadata = mapOkpBookingSourceRow(source({ created_at: "other", source_synced_at: "other", updated_at: "other" }));
  assert.equal(first.row_hash, same.row_hash);
  assert.equal(first.row_hash, withSyncMetadata.row_hash);
  assert.notEqual(first.row_hash, changed.row_hash);
  assert.notEqual(first.row_hash, changedSite.row_hash);
  const contractualBlock = mapperSource.slice(mapperSource.indexOf("const contractual ="), mapperSource.indexOf("return {", mapperSource.indexOf("const contractual =")));
  assert.doesNotMatch(contractualBlock, /\bsource_synced_at\b|\bcreated_at\b|(?<!source_)\bupdated_at\b/);
  assert.equal(Object.hasOwn(first, "source_synced_at"), false);
  assert.equal(Object.hasOwn(first, "created_at"), false);
  assert.equal(Object.hasOwn(first, "updated_at"), false);
});

test("migration keeps the source table private and uses only the approved indexes", () => {
  const sql = readFileSync("supabase/migrations/20260825120000_create_customer_source_bookings_okp.sql", "utf8");
  assert.match(sql, /unique \(source, source_row_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.customer_source_bookings_okp from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select, insert, update on table public\.customer_source_bookings_okp to service_role/i);
  assert.doesNotMatch(sql, /grant[^;]*(?:delete|references|trigger|truncate)[^;]*to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /index[^;]+(?:row_hash|status_raw|is_pack|valor_reserva_amount|source_total_amount)/i);
});
