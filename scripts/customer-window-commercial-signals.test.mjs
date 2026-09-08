import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260908120000_add_customer_commercial_signals.sql", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");

test("creates a versioned durable signal model and evaluation record", () => {
  assert.match(migration, /create table public\.customer_commercial_signal_rules/);
  assert.match(migration, /create table public\.customer_commercial_signals/);
  assert.match(migration, /primary key \(customer_id, signal_key\)/);
  assert.match(migration, /create table public\.customer_commercial_signal_evaluations/);
  assert.match(migration, /rule_version = 'customer_signals_v1'/);
});

test("limits v1 to the five approved signals", () => {
  for (const key of ["PRICE_LIST_BUYER", "OCCASIONAL_PROMO", "DISCOUNT_DEPENDENT", "PACK_CANDIDATE", "RECOVERABLE"]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  for (const excluded of ["HIGH_VALUE", "PREMIUM", "MIGRATION_PRICE", "ALTERNATING_PRICE", "PACK_HABITUAL"]) {
    assert.doesNotMatch(migration, new RegExp(excluded));
  }
});

test("price list buyer requires three boletas and no discount use", () => {
  assert.match(migration, /'PRICE_LIST_BUYER'[\s\S]*from facts where boleta_count >= 3 and discount_usage_pct = 0/);
});

test("occasional promo uses the approved inclusive upper boundary", () => {
  assert.match(migration, /'OCCASIONAL_PROMO'[\s\S]*boleta_count >= 3[\s\S]*discount_usage_pct > 0[\s\S]*discount_usage_pct <= 0\.50/);
});

test("discount dependent requires four boletas and both discount thresholds", () => {
  assert.match(migration, /'DISCOUNT_DEPENDENT'[\s\S]*boleta_count >= 4[\s\S]*discount_usage_pct >= 0\.75[\s\S]*weighted_discount_pct >= 0\.25/);
});

test("pack candidate excludes pack users and distinguishes high from medium", () => {
  assert.match(migration, /pack_count = 0/);
  assert.match(migration, /boleta_count >= 4 and economic_days >= 23 and reservations_12m >= 2 then 'HIGH'/);
  assert.match(migration, /boleta_count >= 2 and economic_days >= 13 and reservations_12m >= 1/);
});

test("recoverable uses two intervals median and a relative recency ratio", () => {
  assert.match(migration, /pg_catalog\.percentile_cont\(0\.5\)/);
  assert.match(migration, /interval_count >= 2/);
  assert.match(migration, /total_reservations >= 3/);
  assert.match(migration, /recency_ratio >= 2/);
  assert.match(migration, /America\/Santiago/);
});

test("evidence is metric-only and excludes identity values", () => {
  for (const value of ["boletaCount", "discountUsagePct", "weightedDiscountPct", "economicDays", "medianPurchaseIntervalDays", "recencyRatio"]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.doesNotMatch(migration, /identity_value|phone_raw|email_normalized|plate_normalized/);
});

test("refresh is bounded set based idempotent and deactivates stale signals", () => {
  assert.match(migration, /cardinality\(p_customer_ids\)[\s\S]*> 500/);
  assert.match(migration, /calculated as materialized/);
  assert.match(migration, /on conflict \(customer_id, signal_key\) do update/);
  assert.match(migration, /is_active = false[\s\S]*deactivated_at/);
  assert.match(migration, /customer_commercial_signal_evaluations[\s\S]*on conflict \(customer_id\) do update/);
  assert.doesNotMatch(migration, /for[\s\S]+loop|foreach/);
});

test("candidate contract tracks zero-signal evaluations and metric changes", () => {
  assert.match(migration, /customer_window_get_commercial_signal_candidates_m2m/);
  assert.match(migration, /evaluation\.customer_id is null/);
  assert.match(migration, /metrics\.updated_at > evaluation\.source_metrics_updated_at/);
  assert.match(migration, /limit p_limit \+ 1/);
});

test("tables use RLS and all functions are service-role only", () => {
  assert.equal((migration.match(/enable row level security/g) ?? []).length, 3);
  assert.equal((migration.match(/revoke all on function/g) ?? []).length, 4);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 4);
  for (const line of migration.split(/\r?\n/).filter((value) => /^grant\s/i.test(value.trim()))) {
    assert.doesNotMatch(line, /\bto\s+(?:anon|authenticated|public)\b/i);
  }
});

test("admin-only route reads signals with the server-side helper", () => {
  assert.match(admin, /getCustomerWindowCommercialSignals[\s\S]*\.rpc\("customer_window_get_commercial_signals"/);
  assert.match(route, /action === "signals"[\s\S]*getCustomerWindowCommercialSignals\(customerId\)/);
  assert.match(route, /const admin = await getActiveAdminUser\(\)/);
});

test("drawer exposes a lazy animated purchase profile subview", () => {
  assert.match(view, /"main" \| "economics" \| "signals" \| "information"/);
  assert.match(view, />Perfil de compra<\/button>/);
  assert.match(view, /action=signals&customerId=/);
  assert.match(view, /detailView !== "signals"[\s\S]*motion-reduce:transition-none/);
  assert.match(view, /CustomerSignalsPanel/);
});

test("UI uses friendly labels confidence and summarized evidence without raw JSON", () => {
  for (const label of ["Compra a precio lista", "Ocasionalmente promocional", "Dependiente de descuento", "Candidato a Pack", "Recuperable"]) {
    assert.match(migration, new RegExp(label));
  }
  assert.match(view, /signal\.label/);
  assert.match(view, /signal\.confidence/);
  assert.match(view, /signalDescription\(signal\)/);
  assert.doesNotMatch(view, /JSON\.stringify\(signal\.evidence/);
});

test("existing economy information summary and timeline remain present", () => {
  assert.match(view, /CustomerEconomicsPanel/);
  assert.match(view, /CustomerInformationPanel/);
  assert.match(view, /Historial de compras/);
  assert.match(view, /MCP\/EAP izquierda|sm:col-start-1/);
  assert.match(view, /isOkpBooking[\s\S]*sm:col-start-3/);
});
