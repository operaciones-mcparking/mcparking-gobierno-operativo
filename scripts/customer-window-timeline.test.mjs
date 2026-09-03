import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260903103000_update_customer_window_read_contracts.sql", "utf8");

test("corrective migration replaces the existing read contracts in place", () => {
  assert.match(migration, /create or replace view public\.customer_window_bookings_v/);
  assert.equal((migration.match(/create or replace function public\.customer_window_/g) ?? []).length, 3);
  assert.doesNotMatch(migration, /drop\s+(?:view|function)/i);
});
test("timeline unifies valid OKP and MCP EAP bookings without copying them", () => {
  assert.match(migration, /create or replace view public\.customer_window_bookings_v/);
  assert.match(migration, /from public\.customer_source_bookings_okp booking/);
  assert.match(migration, /status_raw = 'PAGADA'[\s\S]*is_confirmed is true[\s\S]*is_paid is true/);
  assert.match(migration, /status_raw = 'REEMPLAZADA'[\s\S]*is_confirmed is true/);
  assert.match(migration, /union all/);
  assert.match(migration, /from public\.customer_source_bookings_mcp_eap booking[\s\S]*booking_status in \(1, 8\)/);
  assert.doesNotMatch(migration, /create table public\.customer_window_bookings/);
});

test("timeline preserves source semantics, packs, amounts and chronological paging", () => {
  assert.match(migration, /'OKP'::text as brand/);
  assert.match(migration, /booking\.brand_normalized/);
  assert.match(migration, /booking\.source_total_amount as amount/);
  assert.match(migration, /booking\.discount_amount/);
  assert.match(migration, /booking\.promotion_discount_amount/);
  assert.match(migration, /booking\.is_pack/);
  assert.match(migration, /order by purchase_created_at desc nulls last, source desc, source_row_id desc/);
  assert.match(migration, /'total', \(select count\(\*\)::bigint from scoped\)/);
  assert.match(migration, /limit greatest\(1, least\(coalesce\(p_page_size, 50\), 100\)\)/);
  assert.match(migration, /offset \(greatest\(coalesce\(p_page, 1\), 1\) - 1\)/);
});

test("confirmed commercial history includes only active booking links", () => {
  const viewBlock = migration.slice(0, migration.indexOf("revoke all on public.customer_window_bookings_v"));
  assert.equal((viewBlock.match(/link\.status = 'active'/g) ?? []).length, 2);
  assert.doesNotMatch(viewBlock, /link\.status in \([^)]*(?:candidate|conflict)/);
});

test("summary derives commercial metrics dynamically", () => {
  for (const key of [
    "firstPurchaseAt", "lastPurchaseAt", "purchaseCount", "totalSpend", "averageTicket",
    "totalDurationDays", "mcpCount", "eapCount", "okpCount", "packCount", "nonPackCount",
    "futureBookingCount", "lastBrand", "lastParking", "needsReview",
  ]) assert.match(migration, new RegExp(`'${key}'`));
  assert.match(migration, /timezone\('America\/Santiago', pg_catalog\.now\(\)\)::date/);
  assert.match(migration, /booking_summary as \([\s\S]*count\(\*\)::bigint as purchase_count/);
  assert.doesNotMatch(migration, /'purchaseCount', \(select count\(\*\)::bigint from bookings\)/);
});

test("search is allowlisted, exact and does not return identity values", () => {
  assert.match(migration, /p_identity_type not in \('phone', 'email', 'plate', 'booking_code', 'source_customer_id'\)/);
  assert.match(migration, /identity_value_normalized = trim\(p_identity_value\)/);
  assert.match(migration, /source_booking_code = trim\(p_identity_value\)/);
  const returnBlock = migration.slice(migration.indexOf("with matches as"), migration.indexOf("revoke all on function"));
  const identityBranch = returnBlock.slice(0, returnBlock.indexOf("union"));
  assert.match(identityBranch, /select distinct identity_link\.profile_id as customer_id/);
  assert.doesNotMatch(identityBranch, /customer_booking_profile_links/);
  assert.doesNotMatch(returnBlock, /jsonb_build_object\([^)]*identity_value_normalized/);
  assert.doesNotMatch(migration, /execute\s+format|p_sql|arbitrary/i);
});

test("read contracts are service-role only and expose no raw PII", () => {
  for (const signature of [
    "customer_window_list_customer_bookings\\(uuid, integer, integer\\)",
    "customer_window_get_customer_summary\\(uuid\\)",
    "customer_window_search_customers\\(text, text, integer\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.doesNotMatch(migration, /phone_raw|email_raw|plate_raw|message_text|wa_id/i);
});
