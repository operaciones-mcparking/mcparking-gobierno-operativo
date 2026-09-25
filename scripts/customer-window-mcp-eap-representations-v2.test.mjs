import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260921120000_add_customer_window_mcp_eap_representations_v2.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const parityAudit = readFileSync(new URL(
  "../supabase/debug/customer_window_mcp_eap_representations_v2_parity.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const reversibleHarness = readFileSync(new URL(
  "../supabase/debug/customer_window_mcp_eap_representations_v2_reversible_test.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migrationBody = migration.replace(/^begin;\n/, "").replace(/\ncommit;\s*$/, "").trim();
const embeddedBody = reversibleHarness.split("-- BEGIN EMBEDDED MIGRATION BODY\n")[1]
  ?.split("\n-- END EMBEDDED MIGRATION BODY")[0].trim();

test("active snapshot authority is dynamic and fail-closed", () => {
  assert.match(migration, /rule_key = 'RELATED_REVIEW_MCP_EAP_V1'/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /count\(\*\)::integer as active_snapshot_count/);
  assert.match(migration, /when count\(\*\) = 1[\s\S]*?else null::uuid/);
  assert.match(migration, /authority\.active_snapshot_count = 1/);
  assert.doesNotMatch(migration, /48d075b3-c8dc-49c3-bed7-daf02f29fbab/i);
});

test("representation mapping uses explicit type and preserves XOR", () => {
  assert.match(migration, /case assignment\.representation_type[\s\S]*?when 'confirmed_customer' then assignment\.customer_id::text[\s\S]*?when 'related_review' then assignment\.related_group_id/);
  assert.match(migration, /'confirmed_customer:' \|\| assignment\.customer_id::text/);
  assert.match(migration, /'related_review:' \|\| assignment\.related_group_id/);
  assert.match(migration, /assignment\.representation_type = 'confirmed_customer'[\s\S]*?assignment\.customer_id is not null[\s\S]*?assignment\.related_group_id is null/);
  assert.match(migration, /assignment\.representation_type = 'related_review'[\s\S]*?assignment\.customer_id is null[\s\S]*?assignment\.related_group_id is not null/);
  assert.doesNotMatch(migration, /coalesce\s*\(\s*assignment\.(?:customer_id|related_group_id)/i);
  assert.notEqual("confirmed_customer:X", "related_review:X");
});

test("base read model is thin, private, and non-PII", () => {
  assert.equal((migration.match(/^create or replace view public\./gm) ?? []).length, 2);
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /join public\.customer_analytical_booking_assignments assignment/);
  assert.doesNotMatch(migration, /customer_profile_metrics|customer_related_review_metrics|customer_related_review_members/);
  assert.doesNotMatch(migration, /email|phone|plate|booking_code|source_customer_id/i);
  assert.doesNotMatch(migration, /^\s*(insert|update|delete|merge|create table|alter table|create or replace function|grant|call)\b/im);
  for (const view of [
    "customer_window_mcp_eap_active_snapshot_authority_v2",
    "customer_window_mcp_eap_representations_v2",
  ]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${view}[\\s\\S]*?from public, anon, authenticated, service_role;`));
  }
});

test("related groups and parity checks remain snapshot-scoped", () => {
  assert.match(parityAudit, /related_group\.snapshot_id = representation\.snapshot_id/);
  assert.match(parityAudit, /related_group\.group_id = representation\.related_group_id/);
  assert.match(parityAudit, /assignment\.snapshot_id = representation\.snapshot_id/);
  assert.match(parityAudit, /view_count\.total = snapshot\.valid_source_count/);
  assert.match(parityAudit, /view_count\.confirmed = snapshot\.confirmed_count/);
  assert.match(parityAudit, /view_count\.related = snapshot\.related_count/);
  assert.match(parityAudit, /duplicate_groups = 0/);
  assert.match(parityAudit, /assignment_mismatches = 0/);
  assert.match(parityAudit, /unscoped_related_groups = 0/);
  assert.match(parityAudit, /snapshot\.active_snapshot_count = 1/);
  assert.match(parityAudit, /as parity_ok/);
});

test("parity audit is SELECT-only and contains no fixed production counts", () => {
  assert.match(parityAudit, /^-- READ-ONLY/);
  assert.doesNotMatch(parityAudit, /^\s*(insert|update|delete|merge|create|alter|drop|truncate|call)\b/im);
  assert.doesNotMatch(parityAudit, /403625|283197|120428|25960/);
});

test("reversible harness embeds the exact migration body and always rolls back", () => {
  assert.equal(embeddedBody, migrationBody);
  assert.equal((reversibleHarness.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((reversibleHarness.match(/^rollback;$/gm) ?? []).length, 1);
  assert.match(reversibleHarness, /rollback;\s*$/);
  assert.doesNotMatch(reversibleHarness, /^commit;$/gm);
});

test("reversible harness checks catalog, ACL, authority, and runtime parity", () => {
  assert.match(reversibleHarness, /relation\.relkind <> 'v'/);
  assert.match(reversibleHarness, /security_invoker=true/);
  for (const [name, type] of [
    ["snapshot_id", "uuid"], ["source", "text"], ["source_row_id", "bigint"],
    ["booking_link_id", "uuid"], ["representation_type", "text"],
    ["representation_id", "text"], ["representation_key", "text"],
    ["customer_id", "uuid"], ["related_group_id", "text"],
  ]) {
    assert.match(reversibleHarness, new RegExp(`array\\['${name}', '${type}'\\]`));
  }
  assert.match(reversibleHarness, /acl\.grantee = 0/);
  assert.match(reversibleHarness, /'anon', 'authenticated', 'service_role'/);
  assert.match(reversibleHarness, /v_active_snapshot_count <> 1 or v_snapshot_id is null/);
  assert.match(reversibleHarness, /representation_key <> representation_type \|\| ':' \|\| representation_id/);
  assert.match(reversibleHarness, /duplicate_booking_representations = 0/);
  assert.match(reversibleHarness, /assignment_mapping_mismatch = 0/);
  assert.match(reversibleHarness, /related_group_snapshot_mismatch = 0/);
  assert.match(reversibleHarness, /parity\.parity_ok is true/);
  assert.doesNotMatch(reversibleHarness, /48d075b3-c8dc-49c3-bed7-daf02f29fbab/i);
  assert.doesNotMatch(reversibleHarness, /403625|283197|120428|25960/);
});
