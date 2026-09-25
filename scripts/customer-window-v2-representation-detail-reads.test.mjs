import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260921140000_add_customer_window_v2_representation_detail_reads.sql";
const harnessPath = "supabase/debug/customer_window_v2_representation_detail_reads_reversible_test.sql";
const migration = readFileSync(migrationPath, "utf8");
const harness = readFileSync(harnessPath, "utf8");

function functionBlock(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("\n$$;", start) + 4;
  assert.ok(start >= 0 && end > start, `${name} block missing`);
  return migration.slice(start, end);
}

const summary = functionBlock("customer_window_v2_get_representation_summary");
const bookings = functionBlock("customer_window_v2_list_representation_bookings");

test("creates two versioned service-role-only detail RPCs", () => {
  assert.match(summary, /\(\s*p_representation_type text,\s*p_representation_id text\s*\)[\s\S]*returns jsonb[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(bookings, /p_page integer default 1[\s\S]*p_page_size integer default 25[\s\S]*returns jsonb[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  for (const signature of [
    "customer_window_v2_get_representation_summary(text, text)",
    "customer_window_v2_list_representation_bookings(\n  text, text, integer, integer\n)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&").replace(/\s+/g, "\\s+");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*to service_role`));
  }
});

test("both RPCs fail closed on active authority and representation membership", () => {
  for (const block of [summary, bookings]) {
    assert.match(block, /customer_window_mcp_eap_active_snapshot_authority_v2/);
    assert.match(block, /v_active_snapshot_count <> 1 or v_snapshot_id is null/);
    assert.match(block, /customer_window_mcp_eap_representations_v2/);
    assert.match(block, /representation\.snapshot_id = v_snapshot_id/);
    assert.match(block, /representation\.representation_type = p_representation_type/);
    assert.match(block, /representation\.representation_id = p_representation_id/);
    assert.match(block, /not part of the active snapshot/);
  }
});

test("summary keeps confirmed and related contracts separate", () => {
  assert.match(summary, /customer_profile_metrics metrics[\s\S]*metrics\.customer_id = v_customer_id/);
  assert.match(summary, /customer_related_review_groups related_group[\s\S]*join public\.customer_related_review_metrics metrics[\s\S]*metrics\.snapshot_id = related_group\.snapshot_id[\s\S]*metrics\.group_id = related_group\.group_id/);
  assert.match(summary, /related_group\.v1_booking_count \+ related_group\.v2_booking_count[\s\S]*= related_group\.booking_count/);
  assert.match(summary, /'identityStatus', 'confirmed'[\s\S]*'metricScope', 'all_confirmed_sources'[\s\S]*'contactability', 'direct'/);
  assert.match(summary, /'identityStatus', 'related_review'[\s\S]*'metricScope', 'mcp_eap_active_snapshot'[\s\S]*'contactability', 'review_required'/);
  for (const field of ["bookingCount", "profileCount", "emailCount", "phoneCount", "sourceCustomerCount", "conflictCount", "candidateCount", "v1BookingCount", "v2BookingCount", "hasExactEmailPhoneCorroboration", "hasSourceCustomerEmailCorroboration"]) {
    assert.match(summary, new RegExp(`'${field}'`));
  }
});

test("bookings use only the active MCP EAP representation read model", () => {
  assert.match(bookings, /from public\.customer_window_mcp_eap_representations_v2 representation[\s\S]*join public\.customer_source_bookings_mcp_eap booking[\s\S]*booking\.source = representation\.source[\s\S]*booking\.source_row_id = representation\.source_row_id/);
  assert.match(bookings, /booking\.booking_status in \(1, 8\)/);
  assert.match(bookings, /order by scoped\.source_created_at desc, scoped\.source_row_id desc/);
  assert.match(bookings, /p_page_size > 100/);
  assert.match(bookings, /v_total <> v_expected_related_total/);
  assert.match(bookings, /v_total <> v_representation_count/);
  assert.doesNotMatch(bookings, /customer_window_bookings_v|customer_source_bookings_okp/);
});

test("booking output is operational per-row data without contact PII", () => {
  for (const field of ["source", "sourceRowId", "bookingLinkId", "sourceCreatedAt", "plannedArrivalAt", "plannedDepartureAt", "bookingStatus", "websiteSource", "brand", "parking", "paidAmount", "durationDays", "isPack", "promotionCode"]) {
    assert.match(bookings, new RegExp(`'${field}'`));
  }
  assert.doesNotMatch(bookings, /email_raw|email_normalized|phone_raw|phone_normalized|plate_raw|plate_normalized|source_customer_id|source_booking_code/);
  assert.doesNotMatch(summary, /email_raw|email_normalized|phone_raw|phone_normalized|plate_raw|plate_normalized|source_customer_id|source_booking_code/);
});

test("migration adds no indexes tables views or writes", () => {
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index|create\s+table|create\s+(?:or replace\s+)?view|\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b/i);
});

test("reversible harness embeds the migration body and ends with rollback cleanup checks", () => {
  const sourceBody = migration.replace(/^begin;\r?\n\r?\n/, "").replace(/\r?\ncommit;\r?\n?$/, "");
  const embeddedStart = harness.indexOf("create or replace function public.customer_window_v2_get_representation_summary");
  const embeddedEnd = harness.indexOf("-- Catalog contract", embeddedStart);
  assert.ok(embeddedStart >= 0 && embeddedEnd > embeddedStart);
  assert.equal(
    harness.slice(embeddedStart, embeddedEnd).trimEnd().replace(/\r\n/g, "\n"),
    sourceBody.trimEnd().replace(/\r\n/g, "\n"),
  );
  assert.match(harness, /^begin;/);
  assert.doesNotMatch(harness, /\bcommit\s*;/i);
  assert.match(harness, /-- Runtime parity[\s\S]*confirmed_customer[\s\S]*related_review/);
  assert.match(harness, /rollback;[\s\S]*summary_rpc_absent[\s\S]*bookings_rpc_absent/);
});
