import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260917120000_add_customer_related_review_mcp_eap_v1_schema.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const harness = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_mcp_eap_v1_schema_reversible_test.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const mcpSourceSchema = readFileSync(new URL(
  "../supabase/migrations/20260831120000_create_customer_source_bookings_mcp_eap.sql",
  import.meta.url), "utf8");
const profileMetricsSchema = readFileSync(new URL(
  "../supabase/migrations/20260903120000_add_customer_profile_metrics_read_model.sql",
  import.meta.url), "utf8");
const migrationBody = migration.replace(/^begin;\n/, "").replace(/\ncommit;\s*$/, "").trim();
const embeddedBody = harness.split("-- BEGIN EMBEDDED MIGRATION BODY\n")[1]
  ?.split("\n-- END EMBEDDED MIGRATION BODY")[0].trim();

test("reversible harness embeds exactly the complete migration DDL", () => {
  assert.match(migration, /^begin;\n/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.equal(embeddedBody, migrationBody);
  assert.match(harness, /^-- Reversible schema-only harness\./);
  assert.equal((harness.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((harness.match(/^rollback;$/gm) ?? []).length, 1);
  assert.match(harness, /rollback;\s*-- This postcheck runs after rollback/);
  assert.match(harness, /Reversible schema cleanup failed/);
  assert.doesNotMatch(harness, /^commit;$/im);
  assert.doesNotMatch(harness, /pg_catalog\.coalesce\(/);
});

test("harness asserts exact critical FK and UNIQUE columns plus deferred ACL", () => {
  assert.match(harness, /pg_catalog\.pg_constraint k/);
  assert.match(harness, /pg_catalog\.unnest\(k\.conkey\) with ordinality/);
  assert.match(harness, /pg_catalog\.unnest\(k\.confkey\) with ordinality/);
  assert.equal((harness.match(/select a\.attname::text\s+from pg_catalog\.unnest\(k\.(?:conkey|confkey)\) with ordinality/g) ?? []).length, 2);
  assert.doesNotMatch(harness, /select a\.attname\s+from pg_catalog\.unnest\(k\.(?:conkey|confkey)\) with ordinality/);
  assert.match(harness, /'customer_related_review_members', 'f', array\['snapshot_id', 'group_id'\],[\s\S]*?'customer_related_review_groups', array\['snapshot_id', 'group_id'\]/);
  assert.match(harness, /'customer_analytical_booking_assignments', 'f',[\s\S]*?array\['snapshot_id', 'related_group_id'\],[\s\S]*?'customer_related_review_groups', array\['snapshot_id', 'group_id'\]/);
  assert.match(harness, /'customer_related_review_members', 'f', array\['source', 'source_row_id'\],[\s\S]*?'customer_source_bookings_mcp_eap', array\['source', 'source_row_id'\]/);
  assert.match(harness, /'customer_analytical_booking_assignments', 'f',[\s\S]*?array\['source', 'source_row_id'\],[\s\S]*?'customer_source_bookings_mcp_eap', array\['source', 'source_row_id'\]/);
  assert.match(harness, /'customer_related_review_members', 'u',[\s\S]*?array\['snapshot_id', 'booking_link_id'\]/);
  assert.match(harness, /'customer_analytical_booking_assignments', 'u',[\s\S]*?array\['snapshot_id', 'booking_link_id'\]/);
  assert.match(harness, /pg_catalog\.has_table_privilege\('service_role', c\.oid,[\s\S]*?'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'/);
  assert.match(harness, /Critical FK or UNIQUE column contract mismatch/);
});

test("harness rejects ready snapshots with missing metrics and checks cleanup after rollback", () => {
  assert.match(harness, /'test-only-key', 'ready', now\(\), repeat\('d', 64\),\s+1, 0, 1, 1, 0, 7/);
  assert.match(harness, /Ready snapshot with missing profile metrics unexpectedly inserted/);
  assert.match(harness, /exception when check_violation then null/);
  const postcheck = harness.split(/^rollback;$/m)[1];
  assert.ok(postcheck);
  for (const table of [
    "customer_related_review_snapshots",
    "customer_related_review_groups",
    "customer_related_review_members",
    "customer_analytical_booking_assignments",
    "customer_related_review_metrics",
  ]) {
    assert.match(postcheck, new RegExp(`pg_catalog\\.to_regclass\\('public\\.${table}'\\) is null`));
    assert.match(postcheck, new RegExp(`pg_catalog\\.to_regclass\\('public\\.${table}'\\) is not null`));
  }
});

test("schema is additive, private, and contains the five proposed tables", () => {
  const tables = [
    "customer_related_review_snapshots",
    "customer_related_review_groups",
    "customer_related_review_members",
    "customer_analytical_booking_assignments",
    "customer_related_review_metrics",
  ];
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table} \\(`));
    assert.match(migration, new RegExp(
      `alter table public\\.${table} enable row level security;`));
    assert.match(migration, new RegExp(
      `revoke all on table public\\.${table} from public, anon, authenticated, service_role;`));
  }
  assert.equal((migration.match(/^create table public\./gm) ?? []).length, 5);
  assert.match(migration, /where status = 'active';/);
  assert.match(migration, /primary key \(snapshot_id, source, source_row_id\)/);
  assert.match(migration, /foreign key \(snapshot_id, related_group_id\)/);
  assert.match(migration, /constraint customer_related_review_snapshots_ready_check[\s\S]*?status not in \('ready', 'active'\)[\s\S]*?active_profiles_without_metrics_count is not null\s+and active_profiles_without_metrics_count = 0/);
  assert.match(migration, /service_role remains revoked until the future builder is authorized separately\./);
  assert.match(migration, /representation_type = 'confirmed_customer'[\s\S]*?customer_id is not null and related_group_id is null/);
  assert.match(migration, /representation_type = 'related_review'[\s\S]*?related_group_id is not null and customer_id is null/);
  assert.doesNotMatch(migration, /^\s*(insert|update|delete|merge|create or replace function|grant|call)\b/im);
  assert.doesNotMatch(migration, /HMAC_SECRET|SUPABASE_SERVICE_ROLE_KEY|\brpc\s*\(/i);
});

test("related-review purchase timestamps follow the non-null MCP/EAP source contract", () => {
  assert.match(mcpSourceSchema, /source_created_at timestamp without time zone not null/);
  assert.match(profileMetricsSchema, /first_purchase_at timestamp without time zone not null/);
  assert.match(profileMetricsSchema, /last_purchase_at timestamp without time zone not null/);
  assert.match(migration, /first_purchase_at timestamp without time zone not null/);
  assert.match(migration, /last_purchase_at timestamp without time zone not null/);
});

test("synthetic harness writes only to the new read-model tables", () => {
  const writes = [...harness.matchAll(/^\s*(insert into|update|delete from)\s+public\.([a-z_]+)/gim)]
    .map((match) => match[2]);
  assert.deepEqual([...new Set(writes)].sort(), [
    "customer_analytical_booking_assignments",
    "customer_related_review_groups",
    "customer_related_review_metrics",
    "customer_related_review_snapshots",
  ].sort());
  assert.match(harness, /exception when check_violation then null/);
  assert.match(harness, /exception when foreign_key_violation then null/);
  assert.match(harness, /exception when unique_violation then null/);
  assert.match(harness, /-- Member and duplicate-assignment runtime fixtures require valid source\/link\/profile/);
});
