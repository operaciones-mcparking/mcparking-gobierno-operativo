import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904160000_add_customer_window_purchase_period_listing.sql",
  "utf8",
);
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");

test("creates the bounded purchase-period listing RPC", () => {
  assert.match(migration, /customer_window_list_customers_by_purchase_period\([\s\S]*p_from date[\s\S]*p_to date[\s\S]*p_family text/);
  assert.match(migration, /p_page integer default 1/);
  assert.match(migration, /p_page_size integer default 25/);
  assert.match(migration, /p_page_size > 100/);
  assert.match(migration, /'page', p_page[\s\S]*'pageSize', p_page_size/);
});

test("filters confirmed purchases by inclusive calendar dates rather than profile last purchase", () => {
  assert.match(migration, /source_created_at >= p_from::timestamp without time zone/g);
  assert.match(migration, /source_created_at < \(p_to \+ 1\)::timestamp without time zone/g);
  assert.match(migration, /link\.status = 'active'/g);
  assert.match(migration, /booking\.status_raw = 'PAGADA'[\s\S]*booking\.status_raw = 'REEMPLAZADA'/);
  assert.match(migration, /booking\.booking_status in \(1, 8\)/);
  assert.doesNotMatch(migration.slice(0, migration.indexOf("period_customers as")), /last_purchase_at/);
});

test("keeps MCP EAP and OKP as independent period families", () => {
  assert.match(migration, /p_family not in \('MCP_EAP', 'OKP'\)/);
  assert.match(migration, /p_family = 'OKP'[\s\S]*union all[\s\S]*p_family = 'MCP_EAP'/);
  assert.match(migration, /group by customer_id/);
});

test("returns period counters and persisted historical metrics", () => {
  for (const field of [
    "customerId", "purchasesInPeriod", "firstPurchaseInPeriod", "lastPurchaseInPeriod",
    "lifecycleStatus", "tier", "totalReservations", "reservations12m", "reservations24m",
    "mcpCount", "eapCount", "okpCount", "okpExpressCount", "okpRioClarilloCount",
    "okpOtrosCount", "packStatus", "brandBehavior", "firstPurchaseAt", "lastPurchaseAt",
    "lastBrand", "lastParking", "futureBookingCount", "needsReview",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /count\(\*\)::bigint as purchases_in_period/);
  assert.match(migration, /min\(purchase_created_at\) as first_purchase_in_period/);
  assert.match(migration, /max\(purchase_created_at\) as last_purchase_in_period/);
});

test("applies every classification filter server-side", () => {
  assert.match(migration, /metrics\.lifecycle_status = p_lifecycle_status/);
  assert.match(migration, /metrics\.tier = p_tier/);
  assert.match(migration, /metrics\.pack_status = p_pack_status/);
  assert.match(migration, /metrics\.brand_behavior = p_brand_behavior/);
  assert.match(migration, /Invalid lifecycle status[\s\S]*Invalid tier[\s\S]*Invalid pack status[\s\S]*Invalid brand behavior/);
});

test("paginates with a stable period order", () => {
  assert.match(migration, /order by last_purchase_in_period desc, customer_id/);
  assert.match(migration, /limit p_page_size offset \(p_page - 1\) \* p_page_size/);
  assert.match(migration, /'total', \(select count\(\*\)::bigint from filtered\)/);
});

test("keeps the RPC non-PII, amount-free, and service-role only", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /identity_value_normalized|phone|email|totalSpend|averageTicket|source_total_amount|\bamount\b|\brevenue\b/i);
});

test("endpoint remains admin-only and validates the period contract", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /action === "list-by-period"/);
  assert.match(route, /isValidDateValue\(from\)[\s\S]*from > to[\s\S]*allowedFamilies\.has\(family\)/);
  assert.match(route, /parsed\.toISOString\(\)\.slice\(0, 10\) === value/);
  assert.match(route, /boundedInteger\(request\.nextUrl\.searchParams\.get\("pageSize"\), 25, 100\)/);
  assert.match(route, /listCustomerWindowCustomersByPurchasePeriod/);
  assert.match(route, /action === "search"[\s\S]*action === "summary"[\s\S]*action === "bookings"/);
});

test("server resolves identities only for the returned page", () => {
  assert.match(admin, /customer_window_list_customers_by_purchase_period/);
  assert.match(admin, /data\.items[\s\S]*customerIds/);
  assert.match(admin, /customer_window_get_page_identities[\s\S]*p_customer_ids: customerIds/);
  assert.match(admin, /emails: emails\.filter[\s\S]*phones: phones\.filter/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.from\(/);
});
