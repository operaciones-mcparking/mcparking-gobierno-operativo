import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previous = readFileSync(
  "supabase/migrations/20260921150000_add_customer_window_v2_contacts.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const migration = readFileSync(
  "supabase/migrations/20260924130000_optimize_customer_window_v2_period_related_contacts.sql",
  "utf8",
).replace(/\r\n/g, "\n");
const harness = readFileSync(
  "supabase/debug/customer_window_v2_period_related_contacts_optimization_reversible_test.sql",
  "utf8",
).replace(/\r\n/g, "\n");

function functionBlock(source) {
  const start = source.indexOf(
    "create or replace function public.customer_window_v2_list_representations_by_purchase_period",
  );
  const end = source.indexOf("\n$$;", start) + 4;
  assert.ok(start >= 0 && end > start, "period list function missing");
  return source.slice(start, end);
}

function splitRelatedBlock(source) {
  const start = source.indexOf("  related_contact_observations as materialized (");
  const end = source.indexOf("\n  related_contact_values as materialized (", start);
  assert.ok(start >= 0 && end > start, "related contact observations block missing");
  return {
    before: source.slice(0, start),
    block: source.slice(start, end),
    after: source.slice(end),
  };
}

const previousFunction = functionBlock(previous);
const optimizedFunction = functionBlock(migration);
const oldParts = splitRelatedBlock(previousFunction);
const newParts = splitRelatedBlock(optimizedFunction);

test("changes only the related contact observation implementation inside the RPC", () => {
  assert.equal(newParts.before, oldParts.before);
  assert.equal(newParts.after, oldParts.after);
  assert.notEqual(newParts.block, oldParts.block);
});

test("related contacts use the indexed assignment group key directly", () => {
  assert.match(newParts.block, /join public\.customer_analytical_booking_assignments assignment/);
  assert.match(newParts.block, /assignment\.snapshot_id = paged\.snapshot_id/);
  assert.match(newParts.block, /assignment\.representation_type = 'related_review'/);
  assert.match(newParts.block, /assignment\.related_group_id = paged\.related_group_id/);
  assert.match(newParts.block, /assignment\.customer_id is null/);
  assert.match(newParts.block, /booking\.source = assignment\.source/);
  assert.match(newParts.block, /booking\.source_row_id = assignment\.source_row_id/);
  assert.doesNotMatch(newParts.block, /customer_window_mcp_eap_representations_v2/);
});

test("keeps the external contract pagination total JSON and security unchanged", () => {
  assert.equal((migration.match(/^create or replace function public\./gm) ?? []).length, 1);
  assert.match(migration, /p_from date,[\s\S]*p_to date,[\s\S]*p_page integer default 1,[\s\S]*p_page_size integer default 25/);
  assert.match(migration, /returns jsonb[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /order by last_booking_at_in_period desc, representation_key asc[\s\S]*limit p_page_size offset \(p_page - 1\) \* p_page_size/);
  assert.match(migration, /'total', \(select count\(\*\)::bigint from enriched\)/);
  for (const field of [
    "items", "total", "page", "pageSize", "representationType", "representationId",
    "representationKey", "customerId", "relatedGroupId", "totalReservations",
    "firstPurchaseAt", "lastPurchaseAt", "metricScope", "reservationsInPeriod",
    "lastBookingAtInPeriod", "contactSummary",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /from public, anon, authenticated, service_role/);
  assert.match(migration, /to service_role/);
});

test("does not add indexes tables views facets or data writes", () => {
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index|create\s+table|create\s+(?:or replace\s+)?view/i);
  assert.doesNotMatch(migration, /customer_window_v2_get_purchase_period_facets/);
  assert.doesNotMatch(migration, /^\s*(?:insert|update|delete|merge|truncate)\b/im);
});

test("reversible harness compares baseline cases and restores the original definition", () => {
  for (const marker of [
    "page_1", "page_2", "last_page", "empty_period", "long_range",
    "confirmed_page", "related_page", "mixed_page",
  ]) assert.match(harness, new RegExp(`'${marker}'`));
  assert.match(harness, /baseline_payload = optimized_payload/);
  assert.match(harness, /baseline_payload->'items' = optimized_payload->'items'/);
  assert.match(harness, /baseline_payload->>'total' = optimized_payload->>'total'/);
  assert.match(harness, /customer_analytical_booking_assignments_group_idx/);
  assert.match(harness, /pg_get_functiondef/);
  assert.match(harness, /original_definition_md5/);
  assert.match(harness, /rollback;[\s\S]*definition_restored/);
  assert.equal((harness.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((harness.match(/^rollback;$/gm) ?? []).length, 1);
  assert.doesNotMatch(harness, /^commit;$/gm);
});
