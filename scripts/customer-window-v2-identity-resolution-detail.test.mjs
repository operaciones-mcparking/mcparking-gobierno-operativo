import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260923150000_extend_customer_window_v2_identity_resolution_pivot_contacts.sql";
const harnessPath = "supabase/debug/customer_window_v2_identity_resolution_detail_reversible_test.sql";
const postcheckPath = "supabase/debug/customer_window_v2_identity_resolution_pivot_contacts_postcheck.sql";
const migration = readFileSync(migrationPath, "utf8");
const harness = readFileSync(harnessPath, "utf8");
const postcheck = readFileSync(postcheckPath, "utf8");

function functionBlock(source) {
  const start = source.indexOf("create or replace function public.customer_window_v2_get_identity_resolution_detail");
  const end = source.indexOf("\n$$;", start) + 4;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).replace(/\r\n/g, "\n");
}

function normalizedSql(source) {
  return source.replace(/\s+/g, " ").trim();
}

test("RPC is stable service-role-only and contains no writes", () => {
  const rpc = functionBlock(migration);
  assert.match(rpc, /returns jsonb[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.doesNotMatch(rpc, /\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b|execute\s+/i);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("RPC scopes active snapshot group members profiles assignments and events", () => {
  const rpc = functionBlock(migration);
  assert.match(rpc, /rule_key = 'RELATED_REVIEW_MCP_EAP_V1'[\s\S]*status = 'active'/);
  assert.match(rpc, /v_active_snapshot_count <> 1/);
  assert.match(rpc, /related_group\.snapshot_id = v_snapshot_id[\s\S]*related_group\.group_id = p_related_group_id/);
  assert.match(rpc, /member\.snapshot_id = v_snapshot_id[\s\S]*member\.group_id = p_related_group_id/);
  assert.match(rpc, /assignment\.snapshot_id = v_snapshot_id[\s\S]*assignment\.related_group_id = p_related_group_id/);
  assert.match(rpc, /event\.source = member\.source[\s\S]*event\.source_row_id = member\.source_row_id/);
  assert.match(rpc, /event\.event_type in \('candidate', 'conflict'\)/);
});

test("payload exposes only known evidence and no raw identity values", () => {
  for (const key of ["matchedByEmail", "matchedBySourceCustomerId", "contradictorySignals", "reusedReviewProfile", "emailsForPhone", "phonesForEmail", "emailBookingCount", "phoneBookingCount"]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /jsonb_strip_nulls[\s\S]*jsonb_typeof/);
  assert.doesNotMatch(functionBlock(migration).slice(0, functionBlock(migration).indexOf("with scoped_members as materialized (", functionBlock(migration).indexOf("into v_events"))), /identity_value_normalized|email_raw|phone_raw|email_normalized|phone_normalized/);
});

test("related contacts stay group scoped and require an involved profile identity link", () => {
  const rpc = functionBlock(migration);
  assert.match(rpc, /scoped_members as materialized[\s\S]*member\.snapshot_id = v_snapshot_id[\s\S]*member\.group_id = p_related_group_id/);
  assert.match(rpc, /scoped_profiles as materialized[\s\S]*select distinct member\.profile_id/);
  assert.match(rpc, /join public\.customer_identity_links identity on identity\.profile_id = profile\.profile_id/);
  assert.match(rpc, /identity\.status in \('active', 'candidate', 'conflict'\)/);
  assert.doesNotMatch(rpc, /identity\.status in \([^)]*'rejected'/);
  assert.doesNotMatch(rpc, /where identity\.identity_value_normalized\s*=/);
});

test("observed contacts win normalized dedupe and display uses latest scoped raw value", () => {
  const rpc = functionBlock(migration);
  assert.match(rpc, /partition by contact\.identity_type, contact\.normalized_value[\s\S]*order by contact\.relation_priority/);
  assert.match(rpc, /'observed_in_group'::text as relation,[\s\S]*1::integer as relation_priority/);
  assert.match(rpc, /'historically_related'::text as relation,[\s\S]*'same_phone_history'::text as relation_reason,[\s\S]*2::integer as relation_priority/);
  assert.match(rpc, /'historically_related'::text as relation,[\s\S]*'same_email_history'::text as relation_reason,[\s\S]*2::integer as relation_priority/);
  assert.match(rpc, /'same_profile_history'::text as relation_reason,[\s\S]*3::integer as relation_priority/);
  assert.match(rpc, /array_agg\(observation\.raw_value[\s\S]*source_created_at desc[\s\S]*source_row_id desc/);
  assert.match(rpc, /link\.profile_id = any\(historical\.profile_ids\)/);
});

test("contradictory pivot expansion is one hop and evidence gated", () => {
  const rpc = functionBlock(migration);
  assert.match(rpc, /event\.reason_code = 'contradictory_phone_email'[\s\S]*contradictorySignals[\s\S]*emailsForPhone[\s\S]*> 1/);
  assert.match(rpc, /event\.reason_code = 'contradictory_phone_email'[\s\S]*contradictorySignals[\s\S]*phonesForEmail[\s\S]*> 1/);
  assert.match(rpc, /same_phone_history_observations[\s\S]*from observed_contacts pivot[\s\S]*booking\.phone_normalized = pivot\.normalized_value/);
  assert.match(rpc, /same_email_history_observations[\s\S]*from observed_contacts pivot[\s\S]*booking\.email_normalized = pivot\.normalized_value/);
  assert.doesNotMatch(rpc, /from same_phone_historical_contacts pivot|from same_email_historical_contacts pivot/);
});

test("real-case postcheck derives direct phone history without hardcoded contacts or writes", () => {
  assert.match(postcheck, /521edad56afd5fa741a192a4b9ed507b88467aa16ba3361c52497b3e2865f3bb/);
  assert.match(postcheck, /booking\.phone_normalized = pivot\.phone_normalized/);
  assert.match(postcheck, /customer_window_v2_get_identity_resolution_detail\(params\.group_id\)/);
  assert.match(postcheck, /missing_direct_email_count/);
  assert.match(postcheck, /real_case_explained/);
  assert.doesNotMatch(postcheck, /fcastro|56994174243/i);
  assert.doesNotMatch(postcheck, /\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b|\bcreate\b|\balter\b|\bdrop\b/i);
});

test("existing indexes cover group profile assignment and event lookups", () => {
  const schema = readFileSync("supabase/migrations/20260917120000_add_customer_related_review_mcp_eap_v1_schema.sql", "utf8");
  const indexes = readFileSync("supabase/migrations/20260914130000_add_customer_window_mcp_eap_non_safe_identity_audit_indexes.sql", "utf8");
  const sourceSchema = readFileSync("supabase/migrations/20260831120000_create_customer_source_bookings_mcp_eap.sql", "utf8");
  assert.match(schema, /customer_related_review_members_group_idx[\s\S]*snapshot_id, group_id/);
  assert.match(schema, /customer_related_review_members_profile_idx[\s\S]*snapshot_id, profile_id/);
  assert.match(schema, /customer_analytical_booking_assignments_group_idx[\s\S]*snapshot_id, related_group_id/);
  assert.match(indexes, /customer_identity_resolution_events_mcp_eap_non_safe_lookup_idx[\s\S]*source_row_id,[\s\S]*resolver_version,[\s\S]*created_at desc/);
  assert.match(sourceSchema, /customer_source_bookings_mcp_eap_phone_idx[\s\S]*phone_normalized/);
  assert.match(sourceSchema, /customer_source_bookings_mcp_eap_email_idx[\s\S]*email_normalized/);
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index/i);
});

test("reversible harness embeds the exact RPC and covers fail-closed cases", () => {
  assert.equal(normalizedSql(functionBlock(harness)), normalizedSql(functionBlock(migration)));
  assert.match(harness, /^begin;/);
  assert.doesNotMatch(harness, /\bcommit\s*;/i);
  for (const marker of ["one_profile_ok", "multiple_profiles_ok", "v1_contradictory_phone_email_available", "v2_review_profile_reused_exact_available", "partial_evidence_supported", "merged_profile_case_available", "merged_status_profile_count", "merged_pointer_profile_count", "merged_profile_supported", "large_group_ok", "related_contacts_shape_ok", "related_contacts_profile_scope_ok", "related_contacts_deduped_ok", "related_contacts_reason_ok", "missing_group_rejected", "active_scope_ok", "cross_group_leakage_count"]) {
    assert.match(harness, new RegExp(marker));
  }
  assert.match(harness, /when case_id\.merged_profile_group is null then true/);
  assert.match(harness, /returned\.value ->> 'status' = 'merged'/);
  assert.match(harness, /returned\.value ->> 'mergedIntoProfileId'[\s\S]*profile\.merged_into_profile_id::text/);
  assert.match(harness, /rollback;[\s\S]*rpc_restored_after_rollback/);
});
