import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260921150000_add_customer_window_v2_contacts.sql";
const harnessPath = "supabase/debug/customer_window_v2_contacts_reversible_test.sql";
const migration = readFileSync(migrationPath, "utf8");

function functionBlock(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start) + 4;
  assert.ok(start >= 0 && end > start, `${name} block missing`);
  return migration.slice(start, end);
}

const list = functionBlock("customer_window_v2_list_representations_by_purchase_period");
const summary = functionBlock("customer_window_v2_get_representation_summary");
const bookings = functionBlock("customer_window_v2_list_representation_bookings");

test("source and identity schemas expose only the audited contact fields", () => {
  const source = readFileSync("supabase/migrations/20260831120000_create_customer_source_bookings_mcp_eap.sql", "utf8");
  const identity = readFileSync("supabase/migrations/20260901120000_create_customer_identity_model.sql", "utf8");
  assert.match(source, /phone_raw text,[\s\S]*phone_normalized text,[\s\S]*email_raw text,[\s\S]*email_normalized text/);
  assert.match(identity, /create table public\.customer_identity_links[\s\S]*identity_type text not null[\s\S]*identity_value_normalized text not null[\s\S]*status text not null/);
  assert.doesNotMatch(identity.slice(0, identity.indexOf("create table public.customer_identity_links")), /\bemail\b|\bphone\b/);
});

test("list contacts are bounded to the page and never select one of many", () => {
  assert.ok(list.indexOf("paged as materialized") < list.indexOf("confirmed_contact_values as materialized"));
  assert.match(list, /from paged[\s\S]*join public\.customer_identity_links identity[\s\S]*identity\.status = 'active'/);
  assert.match(list, /from paged[\s\S]*customer_window_mcp_eap_representations_v2 representation[\s\S]*representation\.snapshot_id = paged\.snapshot_id/);
  assert.match(list, /case when count\(\*\) filter \(where contact\.identity_type = 'email'\) = 1[\s\S]*single_email/);
  assert.match(list, /case when count\(\*\) filter \(where contact\.identity_type = 'phone'\) = 1[\s\S]*single_phone/);
  assert.match(list, /'contactSummary'[\s\S]*'semantics'[\s\S]*'emailCount'[\s\S]*'phoneCount'[\s\S]*'singleEmail'[\s\S]*'singlePhone'/);
});

test("summary separates direct active identities from snapshot-scoped observations", () => {
  assert.match(summary, /identity\.profile_id = v_customer_id[\s\S]*identity\.status = 'active'[\s\S]*identity\.identity_type in \('email', 'phone'\)/);
  assert.match(summary, /'directEmails', contacts\.direct_emails[\s\S]*'observedEmails', '\[\]'::jsonb/);
  assert.match(summary, /representation\.snapshot_id = v_snapshot_id[\s\S]*representation\.representation_type = 'related_review'[\s\S]*representation\.representation_id = p_representation_id/);
  assert.match(summary, /group by observation\.identity_type, observation\.normalized_value/);
  assert.match(summary, /array_agg\([\s\S]*observation\.raw_value[\s\S]*order by observation\.source_created_at desc, observation\.source_row_id desc[\s\S]*filter \(where observation\.raw_value is not null\)[\s\S]*observation\.normalized_value/);
  assert.match(summary, /'observedEmails', contacts\.observed_emails[\s\S]*'observedPhones', contacts\.observed_phones/);
  assert.doesNotMatch(summary, /preferred|primary|canonical_email|canonical_phone/i);
});

test("booking contacts remain facts from the individual MCP EAP source row", () => {
  assert.match(bookings, /coalesce\(nullif\(pg_catalog\.btrim\(booking\.email_raw\), ''\), nullif\(booking\.email_normalized, ''\)\) as email/);
  assert.match(bookings, /coalesce\(nullif\(pg_catalog\.btrim\(booking\.phone_raw\), ''\), nullif\(booking\.phone_normalized, ''\)\) as phone/);
  assert.match(bookings, /'email', paged\.email[\s\S]*'phone', paged\.phone/);
  assert.match(bookings, /representation\.snapshot_id = v_snapshot_id/);
});

test("migration changes only the three versioned read RPCs and their ACL comments", () => {
  assert.equal((migration.match(/create or replace function public\./g) ?? []).length, 3);
  assert.doesNotMatch(migration, /customer_window_(?:list_customers|get_customer_summary|list_customer_bookings)\b/);
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index|create\s+table|create\s+(?:or replace\s+)?view|\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b/i);
  for (const block of [list, summary, bookings]) {
    assert.match(block, /returns jsonb[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  }
  assert.equal((migration.match(/revoke all on function/g) ?? []).length, 3);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 3);
  assert.equal((migration.match(/comment on function/g) ?? []).length, 3);
});

test("reversible harness embeds the exact migration body and restores prior RPCs", () => {
  const harness = readFileSync(harnessPath, "utf8");
  const sourceBody = migration.replace(/^begin;\r?\n\r?\n/, "").replace(/\r?\ncommit;\r?\n?$/, "");
  const embeddedStart = harness.indexOf("create or replace function public.customer_window_v2_list_representations_by_purchase_period");
  const embeddedEnd = harness.indexOf("-- Catalog contract", embeddedStart);
  assert.ok(embeddedStart >= 0 && embeddedEnd > embeddedStart);
  assert.equal(
    harness.slice(embeddedStart, embeddedEnd).trimEnd().replace(/\r\n/g, "\n"),
    sourceBody.trimEnd().replace(/\r\n/g, "\n"),
  );
  assert.match(harness, /^begin;/);
  assert.doesNotMatch(harness, /\bcommit\s*;/i);
  assert.match(harness, /-- Runtime contact contract/);
  assert.match(harness, /rollback;[\s\S]*contacts_removed_after_rollback/);
});
