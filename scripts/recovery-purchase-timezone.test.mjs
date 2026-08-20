import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildRecoveryBookingImportRows, dateOnlyValue } = require("./recovery/purchases-csv-validator.js");
const { parseDateSafe } = require("./recovery/recovery-normalizers.js");

function purchaseCsv({ bookingTime = "27/07/2026 14:33:39" } = {}) {
  return [
    "Id;CustomerId;Email;Telefon;Buchungszeit;LocationCode;ParkingCode;Anreisedatum;Anreisezeit;Abreisedatum;Abreisezeit;Dauer;Kennzeichen;Buchungsnummer;BookingStatus;PayingStatus;Preis",
    [
      "788493",
      "customer-1",
      "persona@example.com",
      "+56912345678",
      bookingTime,
      "LOC",
      "MPV",
      "28/07/2026",
      "04:00",
      "30/07/2026",
      "04:00",
      "2",
      "AA0000",
      "MCP49072",
      "8",
      "1",
      "14112",
    ].join(";"),
  ].join("\n");
}

function onlyPurchase(csv = purchaseCsv()) {
  const rows = buildRecoveryBookingImportRows(csv);
  assert.equal(rows.length, 1);
  return rows[0];
}

function attributionStatus(cart, purchase) {
  const cartDate = new Date(cart.form_datetime);
  const purchaseDate = new Date(purchase.booking_created_at);
  const intendedArrival = cart.intended_arrival_at ? new Date(cart.intended_arrival_at) : null;

  if (!purchase.booking_created_at || Number.isNaN(purchaseDate.getTime())) return "unrecovered";
  if (purchaseDate < cartDate) return "unrecovered";
  if (intendedArrival && purchaseDate > intendedArrival) return "unrecovered";

  const emailMatches = cart.email_normalized === purchase.email_normalized;
  const phoneMatches = cart.phone_normalized === purchase.phone_normalized;
  if (!emailMatches && !phoneMatches) return "unrecovered";

  return Number(purchase.price ?? 0) > 0 ? "recovered_with_amount" : "recovered_pack";
}

test("1. fecha local invierno Chile sin offset se interpreta como America/Santiago", () => {
  assert.equal(parseDateSafe("27/07/2026 14:33:39")?.toISOString(), "2026-07-27T18:33:39.000Z");
});

test("2. fecha local verano Chile sin offset usa horario de verano", () => {
  assert.equal(parseDateSafe("27/01/2026 14:33:39")?.toISOString(), "2026-01-27T17:33:39.000Z");
});

test("3. fecha UTC con Z se respeta", () => {
  assert.equal(parseDateSafe("2026-07-27T14:33:39.000Z")?.toISOString(), "2026-07-27T14:33:39.000Z");
});

test("4. fecha con offset -04:00 conserva su semantica", () => {
  assert.equal(parseDateSafe("2026-07-27T14:33:39-04:00")?.toISOString(), "2026-07-27T18:33:39.000Z");
});

test("5. fecha con offset -03:00 conserva su semantica", () => {
  assert.equal(parseDateSafe("2026-01-27T14:33:39-03:00")?.toISOString(), "2026-01-27T17:33:39.000Z");
});

test("6. cambio DST no usa offset fijo", () => {
  const winter = parseDateSafe("27/07/2026 14:33:39")?.toISOString();
  const summer = parseDateSafe("27/01/2026 14:33:39")?.toISOString();
  assert.equal(winter, "2026-07-27T18:33:39.000Z");
  assert.equal(summer, "2026-01-27T17:33:39.000Z");
  assert.notEqual(winter.slice(11, 19), summer.slice(11, 19));
});

test("7. fecha invalida devuelve null", () => {
  assert.equal(parseDateSafe("31/02/2026 14:33:39"), null);
  assert.equal(parseDateSafe("no es fecha"), null);
});

test("8. fecha vacia devuelve null", () => {
  assert.equal(parseDateSafe(""), null);
  assert.equal(parseDateSafe("   "), null);
  assert.equal(parseDateSafe(null), null);
});

test("9. no hay doble conversion para fecha ya normalizada con Z", () => {
  const first = parseDateSafe("2026-07-27T18:33:39.000Z")?.toISOString();
  const second = parseDateSafe(first)?.toISOString();
  assert.equal(first, "2026-07-27T18:33:39.000Z");
  assert.equal(second, first);
});

test("10. mismo CSV reimportado mantiene timestamp y row_hash", () => {
  const first = onlyPurchase();
  const second = onlyPurchase();
  assert.equal(first.booking_created_at, "2026-07-27T18:33:39.000Z");
  assert.equal(second.booking_created_at, first.booking_created_at);
  assert.equal(second.row_hash, first.row_hash);
});

test("11. caso real 27/07 14:33:39 queda posterior al carrito 12:48", () => {
  const purchase = onlyPurchase();
  const cart = {
    email_normalized: purchase.email_normalized,
    form_datetime: "2026-07-27T16:48:33+00:00",
    intended_arrival_at: "2026-07-28T08:00:00+00:00",
    phone_normalized: purchase.phone_normalized,
  };
  assert.equal(purchase.booking_created_at, "2026-07-27T18:33:39.000Z");
  assert.ok(new Date(purchase.booking_created_at).getTime() > new Date(cart.form_datetime).getTime());
  assert.equal(attributionStatus(cart, purchase), "recovered_with_amount");
});

test("12. parser no afecta booking_status, paying_status, price ni parking_code", () => {
  const purchase = onlyPurchase();
  assert.equal(purchase.booking_status, 8);
  assert.equal(purchase.paying_status, "1");
  assert.equal(purchase.price, 14112);
  assert.equal(purchase.parking_code, "MPV");
});

test("13. fecha ISO local sin offset se interpreta como America/Santiago", () => {
  assert.equal(parseDateSafe("2026-07-27T14:33:39")?.toISOString(), "2026-07-27T18:33:39.000Z");
});

test("14. date-only conserva el dia civil de Santiago", () => {
  assert.equal(parseDateSafe("27/07/2026")?.toISOString(), "2026-07-27T04:00:00.000Z");
  assert.equal(parseDateSafe("27-07-2026")?.toISOString(), "2026-07-27T04:00:00.000Z");
  assert.equal(parseDateSafe("2026-01-27")?.toISOString(), "2026-01-27T03:00:00.000Z");
});

test("15. el parser de compras no escribe snapshots ni llama RPC", () => {
  const parserSource = fs.readFileSync(new URL("./recovery/purchases-csv-validator.js", import.meta.url), "utf8");
  assert.doesNotMatch(parserSource, /create_recovery_weekly_snapshot/i);
  assert.doesNotMatch(parserSource, new RegExp("\\.rpc\\(", "i"));
  assert.doesNotMatch(parserSource, new RegExp("fetch\\(", "i"));
});
test("16. date-only conserva las fechas civiles durante el cambio DST Chile 2026", () => {
  assert.equal(dateOnlyValue("2026-09-05"), "2026-09-05");
  assert.equal(dateOnlyValue("2026-09-06"), "2026-09-06");
  assert.equal(dateOnlyValue("2026-09-07"), "2026-09-07");
});

test("17. date-only valida calendario y anos bisiestos", () => {
  assert.equal(dateOnlyValue("2024-02-29"), "2024-02-29");
  assert.equal(dateOnlyValue("2026-02-29"), null);
  assert.equal(dateOnlyValue("2026-02-30"), null);
  assert.equal(dateOnlyValue("2026-04-31"), null);
  assert.equal(dateOnlyValue("2026-13-01"), null);
  assert.equal(dateOnlyValue("texto"), null);
});

test("18. date-only conserva formatos civiles existentes y contrato de vacios", () => {
  assert.equal(dateOnlyValue("06/09/2026"), "2026-09-06");
  assert.equal(dateOnlyValue("06-09-2026"), "2026-09-06");
  assert.equal(dateOnlyValue("06.09.2026"), "2026-09-06");
  assert.equal(dateOnlyValue(""), null);
  assert.equal(dateOnlyValue("   "), null);
  assert.equal(dateOnlyValue(null), null);
});

test("19. date-only DST no altera la conversion zonificada de Buchungszeit", () => {
  const purchase = onlyPurchase(purchaseCsv({ bookingTime: "2026-08-20 11:24:47" }));
  assert.equal(purchase.booking_created_at, "2026-08-20T15:24:47.000Z");
  assert.equal(dateOnlyValue("2026-09-06"), "2026-09-06");
});
