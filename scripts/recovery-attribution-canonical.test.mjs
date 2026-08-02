import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

const helperPath = "src/lib/recuperacion/recovery-attribution.ts";
const dashboardPath = "src/lib/dashboard/data.ts";
const sqlViewPath = "supabase/migrations/20260715140000_create_recovery_attribution_view.sql";
const helperSource = readFileSync(helperPath, "utf8");
const dashboardSource = readFileSync(dashboardPath, "utf8");
const sqlViewSource = readFileSync(sqlViewPath, "utf8");

function loadHelper() {
  const compiled = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    exports: module.exports,
    module,
    require,
  };
  vm.runInNewContext(compiled, sandbox, { filename: helperPath });
  return sandbox.module.exports;
}

const {
  RECOVERY_ATTRIBUTION_CALCULATION_VERSION,
  buildRecoveryAttributionMatches,
  resolveRecoveryAttributions,
  summarizeRecoveryAttributions,
} = loadHelper();

function cart(overrides = {}) {
  return {
    batch_id: "cart-batch-1",
    email_normalized: "cliente@example.test",
    form_datetime: "2026-07-20T10:00:00.000Z",
    id: "cart-1",
    intended_arrival_at: "2026-07-20T18:00:00.000Z",
    message_sent: true,
    parking_code: "MCP",
    phone_normalized: "+56911112222",
    row_hash: "cart-hash-1",
    type: "abandoned",
    ...overrides,
  };
}

function purchase(overrides = {}) {
  return {
    batch_id: "purchase-batch-1",
    booking_created_at: "2026-07-20T12:00:00.000Z",
    booking_status: 2,
    email_normalized: "cliente@example.test",
    id: "purchase-1",
    is_valid_purchase: true,
    paying_status: "1",
    phone_normalized: "+56911112222",
    price: 12000,
    row_hash: "purchase-hash-1",
    ...overrides,
  };
}

function legacyMatches(carts, purchases) {
  return buildRecoveryAttributionMatches(carts, purchases);
}

function onlyResult(carts, purchases) {
  return resolveRecoveryAttributions(carts, purchases)[0];
}

test("A. version de calculo estable", () => {
  assert.equal(RECOVERY_ATTRIBUTION_CALCULATION_VERSION, "v1-intended-arrival");
  assert.doesNotMatch(RECOVERY_ATTRIBUTION_CALCULATION_VERSION, /20\d{2}-\d{2}-\d{2}/);
});

test("B. compra valida dentro de intended_arrival_at recupera con monto", () => {
  const result = onlyResult([cart()], [purchase()]);
  assert.equal(result.status, "recovered_with_amount");
  assert.equal(result.attributedPurchaseId, "purchase-1");
  assert.equal(result.attributedAmount, 12000);
  assert.equal(result.matchType, "email_phone");
  assert.equal(result.confidence, "high");
});

test("C. compra posterior a intended_arrival_at no recupera", () => {
  const result = onlyResult([cart({ intended_arrival_at: "2026-07-20T11:00:00.000Z" })], [purchase()]);
  assert.equal(result.status, "unrecovered");
  assert.equal(result.attributedPurchaseId, null);
});

test("D. sin intended_arrival_at usa ventana de 7 dias", () => {
  const result = onlyResult(
    [cart({ intended_arrival_at: null })],
    [purchase({ booking_created_at: "2026-07-26T09:59:59.000Z" })],
  );
  assert.equal(result.status, "recovered_with_amount");
});

test("E. sin intended_arrival_at compra fuera de 7 dias no recupera", () => {
  const result = onlyResult(
    [cart({ intended_arrival_at: null })],
    [purchase({ booking_created_at: "2026-07-27T10:00:00.000Z" })],
  );
  assert.equal(result.status, "unrecovered");
});

test("F. compra valida con monto cero o null clasifica pack", () => {
  assert.equal(onlyResult([cart()], [purchase({ price: 0 })]).status, "recovered_pack");
  assert.equal(onlyResult([cart()], [purchase({ price: null })]).status, "recovered_pack");
});

test("G. pago en revision usa booking_status 9 y paying_status 1", () => {
  const result = onlyResult(
    [cart()],
    [purchase({ id: "review-1", is_valid_purchase: false, booking_status: 9, paying_status: "1", price: 9900 })],
  );
  assert.equal(result.status, "payment_review");
  assert.equal(result.attributedPurchaseId, "review-1");
  assert.equal(result.attributedAmount, 9900);
});

test("H. compra invalida comun no recupera", () => {
  const result = onlyResult(
    [cart()],
    [purchase({ is_valid_purchase: false, booking_status: 1, paying_status: "0" })],
  );
  assert.equal(result.status, "unrecovered");
});

test("I. sin compra no recupera", () => {
  assert.equal(onlyResult([cart()], []).status, "unrecovered");
});

test("J. coincidencia solo por email y solo por telefono", () => {
  assert.equal(
    onlyResult([cart({ phone_normalized: "+56900000000" })], [purchase({ phone_normalized: "+56999999999" })]).matchType,
    "email",
  );
  assert.equal(
    onlyResult([cart({ email_normalized: "otro@example.test" })], [purchase({ email_normalized: "distinto@example.test" })]).matchType,
    "phone",
  );
});

test("K. varias compras candidatas elige la primera compra para el carrito", () => {
  const result = onlyResult(
    [cart()],
    [
      purchase({ id: "purchase-late", booking_created_at: "2026-07-20T13:00:00.000Z" }),
      purchase({ id: "purchase-early", booking_created_at: "2026-07-20T12:30:00.000Z" }),
    ],
  );
  assert.equal(result.attributedPurchaseId, "purchase-early");
});

test("L. una compra duplicada se atribuye al carrito mas reciente", () => {
  const results = resolveRecoveryAttributions(
    [
      cart({ id: "cart-old", form_datetime: "2026-07-20T08:00:00.000Z" }),
      cart({ id: "cart-new", form_datetime: "2026-07-20T09:00:00.000Z" }),
    ],
    [purchase({ booking_created_at: "2026-07-20T12:00:00.000Z" })],
  );
  assert.equal(results.find((item) => item.cartId === "cart-old")?.status, "unrecovered");
  assert.equal(results.find((item) => item.cartId === "cart-new")?.status, "recovered_with_amount");
});

test("M. fechas invalidas no recuperan", () => {
  assert.equal(onlyResult([cart({ form_datetime: "fecha mala" })], [purchase()]).status, "unrecovered");
  assert.equal(onlyResult([cart()], [purchase({ booking_created_at: "fecha mala" })]).status, "unrecovered");
});

test("N. cambio mutable de intended_arrival_at puede cerrar la atribucion", () => {
  const open = onlyResult([cart({ intended_arrival_at: "2026-07-20T13:00:00.000Z" })], [purchase()]);
  const closed = onlyResult([cart({ intended_arrival_at: "2026-07-20T11:00:00.000Z" })], [purchase()]);
  assert.equal(open.status, "recovered_with_amount");
  assert.equal(closed.status, "unrecovered");
});

test("O. resumen semanal comparte formula operacional", () => {
  const summary = summarizeRecoveryAttributions([
    onlyResult([cart({ id: "cart-a" })], [purchase({ id: "purchase-a", price: 100 })]),
    onlyResult([cart({ id: "cart-b" })], [purchase({ id: "purchase-b", price: 0 })]),
    onlyResult([cart({ id: "cart-c" })], [purchase({ id: "purchase-c", is_valid_purchase: false, booking_status: 9, paying_status: "1", price: 50 })]),
    onlyResult([cart({ id: "cart-d" })], []),
  ]);
  assert.equal(JSON.stringify(summary), JSON.stringify({
    cartsTotal: 4,
    operationalRecovered: 3,
    recoveredAmount: 150,
    recoveredConfirmed: 2,
    recoveredReview: 1,
    recoveryRate: 75,
    unrecovered: 1,
  }));
});

test("P. resultado canonico no expone PII ni payloads", () => {
  const result = onlyResult([cart()], [purchase()]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /cliente@example|56911112222|nombre|wamid|message_text|payload/i);
  assert.equal(JSON.stringify(Object.keys(result).sort()), JSON.stringify([
    "attributedAmount",
    "attributedPurchaseAt",
    "attributedPurchaseId",
    "attributionReason",
    "cartBatchId",
    "cartFormDatetime",
    "cartId",
    "cartRowHash",
    "confidence",
    "intendedArrivalAt",
    "matchType",
    "purchaseBatchId",
    "purchaseRowHash",
    "status",
  ].sort()));
});

test("Q. paridad con adaptador usado por dashboard anterior", () => {
  const carts = [cart({ id: "cart-a" }), cart({ id: "cart-b", intended_arrival_at: null })];
  const purchases = [purchase({ id: "purchase-a" }), purchase({ id: "purchase-b", booking_created_at: "2026-07-26T09:00:00.000Z" })];
  const legacy = legacyMatches(carts, purchases).map((item) => [item.cart_id, item.purchase_id, item.purchase_amount]);
  const canonical = resolveRecoveryAttributions(carts, purchases)
    .filter((item) => item.status === "recovered_with_amount" || item.status === "recovered_pack")
    .map((item) => [item.cartId, item.attributedPurchaseId, item.attributedAmount]);
  assert.equal(JSON.stringify(canonical), JSON.stringify(legacy));
});

test("R. helper no usa vista SQL ni escrituras", () => {
  assert.doesNotMatch(helperSource, /v_recovery_attribution_cases/);
  assert.doesNotMatch(helperSource, /\b(?:supabase|client|db|adminClient|serviceRole)\s*\.\s*(?:from|rpc|insert|update|delete|upsert)\s*\(/i);
});

test("S. dashboard importa la fuente canonica", () => {
  assert.match(dashboardSource, /@\/lib\/recuperacion\/recovery-attribution/);
  assert.match(dashboardSource, /resolveRecoveryAttributions\(cartRows, purchaseRows\)/);
});

test("T. diferencia conocida con SQL queda documentada por el codigo", () => {
  assert.match(sqlViewSource, /purchases\.purchase_created_at < carts\.cart_form_datetime \+ interval '7 days'/);
  assert.doesNotMatch(sqlViewSource, /intended_arrival_at/);
  assert.match(helperSource, /intended_arrival_at/);
});
