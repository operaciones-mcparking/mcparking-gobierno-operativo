import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260921130000_add_customer_window_v2_purchase_period_reads.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const harness = readFileSync(new URL(
  "../supabase/debug/customer_window_v2_purchase_period_reads_reversible_test.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const postcheck = readFileSync(new URL(
  "../supabase/debug/customer_window_v2_purchase_period_reads_postcheck.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migrationBody = migration.replace(/^begin;\n/, "").replace(/\ncommit;\s*$/, "").trim();
const embeddedBody = harness.split("-- BEGIN EMBEDDED MIGRATION BODY\n")[1]
  ?.split("\n-- END EMBEDDED MIGRATION BODY")[0].trim();

function emptySearchPathContract(proconfig) {
  if (!Array.isArray(proconfig)) return false;
  const settings = proconfig.filter((setting) => setting.startsWith("search_path="));
  if (settings.length !== 1) return false;
  const value = settings[0].slice("search_path=".length);
  return value === "" || value === '\"\"';
}

test("creates only the two versioned read RPCs and leaves legacy contracts untouched", () => {
  assert.equal((migration.match(/^create or replace function public\./gm) ?? []).length, 2);
  assert.match(migration, /customer_window_v2_list_representations_by_purchase_period/);
  assert.match(migration, /customer_window_v2_get_purchase_period_facets/);
  assert.doesNotMatch(migration, /create or replace function public\.customer_window_(?:list_customers_by_purchase_period|get_purchase_period_facets)\b/);
  assert.doesNotMatch(migration, /customer_window_bookings_v|customer_source_bookings_okp/);
});

test("both RPCs require exactly one dynamic active snapshot", () => {
  assert.equal((migration.match(/from public\.customer_window_mcp_eap_active_snapshot_authority_v2 authority/g) ?? []).length, 2);
  assert.equal((migration.match(/v_active_snapshot_count <> 1 or v_snapshot_id is null/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /48d075b3-c8dc-49c3-bed7-daf02f29fbab/i);
});

test("period universe uses MCP/EAP source rows joined to v2 representations", () => {
  assert.equal((migration.match(/from public\.customer_source_bookings_mcp_eap booking/g) ?? []).length, 2);
  assert.equal((migration.match(/join public\.customer_window_mcp_eap_representations_v2 representation/g) ?? []).length, 2);
  assert.equal((migration.match(/representation\.snapshot_id = v_snapshot_id/g) ?? []).length, 2);
  assert.equal((migration.match(/representation\.source = booking\.source/g) ?? []).length, 2);
  assert.equal((migration.match(/representation\.source_row_id = booking\.source_row_id/g) ?? []).length, 2);
  assert.equal((migration.match(/booking\.source_created_at >= p_from::timestamp without time zone/g) ?? []).length, 2);
  assert.equal((migration.match(/booking\.source_created_at < \(p_to \+ 1\)::timestamp without time zone/g) ?? []).length, 2);
});

test("list contract keeps representations distinct and metrics correctly scoped", () => {
  assert.match(migration, /group by\s+representation\.snapshot_id,[\s\S]*?representation\.representation_key,[\s\S]*?representation\.related_group_id/);
  assert.match(migration, /profile_metrics\.customer_id = period\.customer_id/);
  assert.match(migration, /related_metrics\.snapshot_id = period\.snapshot_id\s+and related_metrics\.group_id = period\.related_group_id/);
  assert.match(migration, /'all_confirmed_sources'::text/);
  assert.match(migration, /'mcp_eap_active_snapshot'::text/);
  assert.match(migration, /Customer Window v2 representation metrics are incomplete/);
  assert.match(migration, /order by last_booking_at_in_period desc, representation_key asc/);
  assert.match(migration, /p_page_size > 100/);
  assert.doesNotMatch(migration, /email|phone|plate|source_customer_id|preferred_contact/i);
});

test("facets reconcile representation and booking partitions", () => {
  for (const field of [
    "totalRepresentations", "confirmedRepresentations", "relatedReviewRepresentations",
    "totalBookingsInPeriod", "confirmedBookingsInPeriod", "relatedReviewBookingsInPeriod",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /group by representation\.representation_key, representation\.representation_type/);
  assert.doesNotMatch(migration, /lifecycle|tier|pack|brand_behavior|signal/i);
});

test("RPC security is definer-only with empty search path and service-role execution", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 2);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 2);
  assert.match(migration, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*?to (?:public|anon|authenticated)/i);
});

test("reversible harness embeds the exact migration and rolls back", () => {
  assert.equal(embeddedBody, migrationBody);
  assert.equal((harness.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((harness.match(/^rollback;$/gm) ?? []).length, 1);
  assert.match(harness, /rollback;\s*$/);
  assert.doesNotMatch(harness, /^commit;$/gm);
});

test("reversible harness compares RPC results with direct SQL", () => {
  assert.match(harness, /rr_v2_period_catalog_diagnostic/);
  assert.match(harness, /pg_get_function_identity_arguments\(procedure\.oid\)/);
  assert.match(harness, /pg_get_function_arguments\(procedure\.oid\)/);
  assert.match(harness, /procedure\.prorettype as actual_return_type_oid/);
  assert.match(harness, /procedure\.proconfig as actual_proconfig/);
  assert.match(harness, /procedure\.proconfig is not null/);
  assert.match(harness, /search_path_contract\.setting_count = 1/);
  assert.match(harness, /search_path_contract\.only_setting_is_empty/);
  assert.match(harness, /pg_catalog\.substr\([\s\S]*?config,[\s\S]*?pg_catalog\.length\('search_path='\) \+ 1[\s\S]*?\) in \('', '\"\"'\)/);
  assert.match(harness, /procedure\.proacl as actual_proacl/);
  assert.doesNotMatch(harness, /has_function_privilege\('PUBLIC'/);
  assert.match(harness, /pg_catalog\.aclexplode\(/);
  assert.match(harness, /acl\.grantee = 0/);
  assert.match(harness, /acl\.privilege_type = 'EXECUTE'/);
  assert.match(harness, /coalesce\(\s*procedure\.proacl,\s*pg_catalog\.acldefault\('f', procedure\.proowner\)/);
  assert.match(harness, /not effective_public_acl\.public_execute/);
  assert.match(harness, /has_function_privilege\('anon', procedure\.oid, 'EXECUTE'\)/);
  assert.match(harness, /has_function_privilege\('authenticated', procedure\.oid, 'EXECUTE'\)/);
  assert.match(harness, /has_function_privilege\('service_role', procedure\.oid, 'EXECUTE'\)/);
  assert.match(harness, /CUSTOMER_WINDOW_V2_CATALOG_DIAGNOSTIC/);
  assert.match(harness, /CUSTOMER_WINDOW_V2_CATALOG_SUMMARY/);
  assert.match(harness, /has_function_privilege\('service_role'/);
  for (const check of [
    "list_exists_ok", "list_signature_ok", "list_return_type_ok", "list_language_ok",
    "list_stable_ok", "list_security_definer_ok", "list_search_path_ok", "list_acl_ok",
    "facets_exists_ok", "facets_signature_ok", "facets_return_type_ok",
    "facets_language_ok", "facets_stable_ok", "facets_security_definer_ok",
    "facets_search_path_ok", "facets_acl_ok",
  ]) assert.match(harness, new RegExp(`as ${check}`));
  assert.ok(harness.indexOf("CUSTOMER_WINDOW_V2_CATALOG_SUMMARY")
    < harness.indexOf("raise exception 'Customer Window v2 period RPC catalog contract failed'"));
  assert.match(harness, /rr_v2_period_direct_parity/);
  assert.match(harness, /direct\.total_representations = direct\.confirmed_representations \+ direct\.related_representations/);
  assert.match(harness, /direct\.total_bookings = direct\.confirmed_bookings \+ direct\.related_bookings/);
  assert.match(harness, /runtime_parity_ok is true/);
  assert.match(harness, /having count\(\*\) filter \(where representation\.representation_type = 'confirmed_customer'\) > 0/);
  assert.match(harness, /count\(\*\) filter \(where representation\.representation_type = 'related_review'\) > 0/);
  assert.doesNotMatch(harness, /48d075b3-c8dc-49c3-bed7-daf02f29fbab|403625|283197|120428/i);
});

test("empty search_path check accepts only explicit empty semantics", () => {
  assert.equal(emptySearchPathContract(["search_path="]), true);
  assert.equal(emptySearchPathContract(['search_path=""']), true);
  assert.equal(emptySearchPathContract(["search_path=public"]), false);
  assert.equal(emptySearchPathContract(['search_path="public"']), false);
  assert.equal(emptySearchPathContract(["search_path=public,pg_catalog"]), false);
  assert.equal(emptySearchPathContract(['search_path="$user",public']), false);
  assert.equal(emptySearchPathContract(null), false);
  assert.equal(emptySearchPathContract([]), false);
  assert.equal(emptySearchPathContract(["search_path=", "search_path=public"]), false);
  assert.equal(emptySearchPathContract(["statement_timeout=1s", 'search_path=""']), true);
});

test("postcheck is read-only and verifies catalog ACL plus direct runtime parity", () => {
  assert.match(postcheck, /^-- READ-ONLY/);
  assert.doesNotMatch(postcheck, /^\s*(insert|update|delete|merge|create|alter|drop|truncate|call)\b/im);
  assert.doesNotMatch(postcheck, /has_function_privilege\('PUBLIC'/);
  assert.match(postcheck, /pg_catalog\.aclexplode\(/);
  assert.match(postcheck, /acl\.grantee = 0/);
  assert.match(postcheck, /acl\.privilege_type = 'EXECUTE'/);
  assert.match(postcheck, /coalesce\(\s*procedure\.proacl,\s*pg_catalog\.acldefault\('f', procedure\.proowner\)/);
  assert.match(postcheck, /procedure\.proconfig is not null/);
  assert.match(postcheck, /search_path_contract\.setting_count = 1/);
  assert.match(postcheck, /search_path_contract\.only_setting_is_empty/);
  assert.match(postcheck, /\) in \('', '\"\"'\)/);
  assert.match(postcheck, /procedure\.pronargdefaults = expected\.default_count as defaults_ok/);
  assert.match(postcheck, /pg_get_function_identity_arguments\(procedure\.oid\)/);
  assert.match(postcheck, /has_function_privilege\('anon', procedure\.oid, 'EXECUTE'\)/);
  assert.match(postcheck, /has_function_privilege\('authenticated', procedure\.oid, 'EXECUTE'\)/);
  assert.match(postcheck, /has_function_privilege\('service_role', procedure\.oid, 'EXECUTE'\)/);
  assert.match(postcheck, /as catalog_acl_ok/);
  assert.match(postcheck, /as runtime_parity_ok/);
  assert.match(postcheck, /direct\.total_representations = direct\.confirmed_representations \+ direct\.related_representations/);
  assert.match(postcheck, /direct\.total_bookings = direct\.confirmed_bookings \+ direct\.related_bookings/);
  assert.match(postcheck, /customer_window_v2_list_representations_by_purchase_period/);
  assert.match(postcheck, /customer_window_v2_get_purchase_period_facets/);
  assert.doesNotMatch(postcheck, /48d075b3-c8dc-49c3-bed7-daf02f29fbab|403625|283197|120428/i);
});
