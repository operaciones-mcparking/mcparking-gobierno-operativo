import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907140000_add_customer_window_booking_economics.sql",
  "utf8",
);
const promoMigration = readFileSync(
  "supabase/migrations/20260907150000_add_customer_window_booking_promo_codes.sql",
  "utf8",
);
const promoViewBlock = promoMigration.slice(
  promoMigration.indexOf("create or replace view public.customer_window_bookings_v"),
  promoMigration.indexOf("revoke all on public.customer_window_bookings_v"),
);
const readContractsMigration = readFileSync(
  "supabase/migrations/20260903103000_update_customer_window_read_contracts.sql",
  "utf8",
);
const viewBlock = migration.slice(
  migration.indexOf("create or replace view public.customer_window_bookings_v"),
  migration.indexOf("revoke all on public.customer_window_bookings_v"),
);

test("migration replaces the existing private view without rebuilding data", () => {
  assert.match(migration, /create or replace view public\.customer_window_bookings_v\s+with \(security_invoker = true\)/);
  assert.doesNotMatch(migration, /drop\s+(?:view|table)|create\s+table|delete\s+from|insert\s+into/i);
  assert.match(migration, /union all/);
  assert.equal((viewBlock.match(/link\.status = 'active'/g) ?? []).length, 2);
});

test("the deployed 140000 economics migration remains immutable", () => {
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "458949be608d903322eb1df956e70e61ad815de10ef4700b42f12400af716403",
  );
});

test("MCP EAP economics use paid amount plus promotion discount and source duration", () => {
  assert.match(viewBlock, /booking\.booking_paid \+ booking\.promotion_discount_amount/);
  assert.match(viewBlock, /booking\.booking_paid,[\s\S]*booking\.list_amount_value,[\s\S]*booking\.duration_days/);
  assert.match(viewBlock, /booking\.promotion_discount_amount \/ booking\.list_amount_value/);
  assert.match(viewBlock, /booking\.booking_paid \/ booking\.duration_days/);
  assert.match(viewBlock, /booking\.list_amount_value \/ booking\.duration_days/);
  assert.match(viewBlock, /booking\.promotion_discount_amount >= 0/);
  assert.match(viewBlock, /booking\.is_pack is false and booking\.paying_status = 1/);
  assert.doesNotMatch(viewBlock, /source_total_amount \+ booking\.promotion_discount_amount/);
});

test("OKP economics combine both non-negative discounts and use inclusive days", () => {
  assert.match(viewBlock, /coalesce\(booking\.discount_amount, 0\)[\s\S]*coalesce\(booking\.coupon_amount, 0\)/);
  assert.match(viewBlock, /prepared\.source_total_amount \+ prepared\.canonical_discount_amount/);
  assert.match(viewBlock, /planned_departure_at::date[\s\S]*-[\s\S]*planned_arrival_at::date[\s\S]*\+ 1/);
  assert.match(viewBlock, /booking\.source_total_amount as paid_amount/);
  assert.match(viewBlock, /booking\.canonical_discount_amount as discount_amount/);
  assert.doesNotMatch(viewBlock, /abs\s*\(/i);
  assert.doesNotMatch(viewBlock, /valor_reserva_amount as (?:list|paid)_amount/i);
});

test("PAGADA and REEMPLAZADA retain history but payment controls OKP eligibility", () => {
  assert.match(viewBlock, /status_raw = 'PAGADA'[\s\S]*is_confirmed is true[\s\S]*is_paid is true/);
  assert.match(viewBlock, /status_raw = 'REEMPLAZADA'[\s\S]*is_confirmed is true/);
  assert.match(viewBlock, /economics_available_value[\s\S]*booking\.is_pack is false[\s\S]*booking\.is_paid is true[\s\S]*as economic_eligible/);
});

test("availability preserves null zero and negative-discount semantics", () => {
  assert.match(viewBlock, /source_total_amount is not null/);
  assert.match(viewBlock, /economic_days_value > 0/);
  assert.match(viewBlock, /discount_amount is null or prepared\.discount_amount >= 0/);
  assert.match(viewBlock, /coupon_amount is null or prepared\.coupon_amount >= 0/);
  assert.match(viewBlock, /promotion_discount_amount is not null/);
  assert.doesNotMatch(viewBlock, /coalesce\([^)]*(?:paid_amount|booking_paid|source_total_amount)[^)]*,\s*0\)/i);
});

test("packs never become economically eligible or receive ADR", () => {
  assert.equal((viewBlock.match(/is_pack is false/g) ?? []).length >= 4, true);
  assert.match(viewBlock, /case[\s\S]*is_pack is false[\s\S]*then booking\.source_total_amount \/ booking\.economic_days_value[\s\S]*else null[\s\S]*end as paid_adr/);
  assert.match(viewBlock, /case[\s\S]*is_pack is false[\s\S]*then booking\.booking_paid \/ booking\.duration_days[\s\S]*else null/);
});

test("event ADR and discount are ratios, never averages of per-booking values", () => {
  assert.match(viewBlock, /canonical_discount_amount \/ booking\.list_amount_value/);
  assert.match(viewBlock, /promotion_discount_amount \/ booking\.list_amount_value/);
  assert.doesNotMatch(viewBlock, /avg\s*\([^)]*(?:paid_adr|list_adr|discount_percentage)/i);
});

test("economic columns are appended and the view remains service-role only", () => {
  for (const column of [
    "paid_amount", "list_amount", "discount_percentage", "economic_days",
    "paid_adr", "list_adr", "economic_eligible", "economics_available",
  ]) assert.match(viewBlock, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /revoke all on public\.customer_window_bookings_v[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on public\.customer_window_bookings_v to service_role/);
  assert.doesNotMatch(viewBlock, /phone_raw|email_raw|plate_raw|identity_value_normalized/i);
});

test("promo migration preserves economics and appends source-specific codes", () => {
  for (const column of [
    "paid_amount", "list_amount", "discount_percentage", "economic_days",
    "paid_adr", "list_adr", "economic_eligible", "economics_available",
  ]) assert.match(promoViewBlock, new RegExp(`\\b${column}\\b`));
  assert.match(promoViewBlock, /null::text as promotion_code,[\s\S]*booking\.coupon_code[\s\S]*from okp_economics booking/);
  assert.match(promoViewBlock, /booking\.promotion_code,[\s\S]*null::text[\s\S]*from mcp_eap_prepared booking/);
  assert.match(promoMigration, /create or replace view public\.customer_window_bookings_v/);
  assert.doesNotMatch(promoMigration, /create or replace function|drop\s+(?:view|function)|delete\s+from/i);
  assert.match(promoMigration, /grant select on public\.customer_window_bookings_v to service_role/);
});

test("the unchanged timeline RPC propagates appended view fields", () => {
  const timelineRpc = readContractsMigration.slice(
    readContractsMigration.indexOf("create or replace function public.customer_window_list_customer_bookings"),
    readContractsMigration.indexOf("create or replace function public.customer_window_get_customer_summary"),
  );

  assert.match(timelineRpc, /select \*/);
  assert.match(timelineRpc, /from public\.customer_window_bookings_v/);
  assert.match(timelineRpc, /pg_catalog\.to_jsonb\(paged\)/);
  assert.doesNotMatch(promoMigration, /customer_window_list_customer_bookings/);
});
