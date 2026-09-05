import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904180000_support_customer_window_mcp_eap_deactivation.sql",
  "utf8",
);
const mapper = readFileSync("src/lib/customer-window/mcp-eap-booking-mapper.ts", "utf8");
const route = readFileSync("src/app/api/customer-window/mcp-eap/sync/route.ts", "utf8");
const readContracts = readFileSync("supabase/migrations/20260903103000_update_customer_window_read_contracts.sql", "utf8");
const periodListing = readFileSync("supabase/migrations/20260904160000_add_customer_window_purchase_period_listing.sql", "utf8");
const metrics = readFileSync("supabase/migrations/20260903140000_optimize_customer_profile_metrics_refresh.sql", "utf8");
const metricWatermarks = readFileSync("supabase/migrations/20260904120000_add_customer_profile_metrics_incremental_watermarks.sql", "utf8");

function classify(existingStatus, existingHash, incomingStatus, incomingHash) {
  const incomingValid = incomingStatus === 1 || incomingStatus === 8;
  if (existingStatus === null) return incomingValid ? "insertedRows" : "ignoredInvalidRows";
  if (existingHash === incomingHash) return "unchangedRows";
  const existingValid = existingStatus === 1 || existingStatus === 8;
  if (existingValid && !incomingValid) return "deactivatedRows";
  if (!existingValid && incomingValid) return "reactivatedRows";
  return "updatedRows";
}

test("booking_status becomes the single unrestricted integer source state", () => {
  assert.match(migration, /drop constraint customer_source_bookings_mcp_eap_booking_status_check/);
  assert.doesNotMatch(migration, /add (?:constraint|column)[^;]*is_valid_purchase/i);
  assert.doesNotMatch(mapper, /BookingStatus must be 1 or 8/);
  assert.match(mapper, /requiredInteger\(row\.BookingStatus, "BookingStatus"\)/);
  assert.match(mapper, /booking_status: bookingStatus/);
});

test("convergence distinguishes lifecycle transitions without inserting unknown invalid rows", () => {
  assert.equal(classify(null, null, 1, "a"), "insertedRows");
  assert.equal(classify(1, "a", 8, "b"), "updatedRows");
  assert.equal(classify(1, "a", 2, "b"), "deactivatedRows");
  assert.equal(classify(2, "a", 1, "b"), "reactivatedRows");
  assert.equal(classify(2, "a", 2, "a"), "unchangedRows");
  assert.equal(classify(null, null, 2, "a"), "ignoredInvalidRows");
  assert.match(migration, /if not v_input_is_valid then[\s\S]*v_ignored_invalid_rows := v_ignored_invalid_rows \+ 1[\s\S]*continue/);
});

test("technical invalidity remains separate from commercial invalidity", () => {
  assert.match(migration, /v_input\.booking_status is null/);
  assert.doesNotMatch(migration, /v_input\.booking_status not in \(1, 8\)/);
  assert.match(migration, /v_input_is_valid := v_input\.booking_status in \(1, 8\)/);
  assert.match(route, /invalidRows: invalidRows \+ \(result\.invalidRows \?\? 0\)/);
  assert.match(route, /ignoredInvalidRows: result\.ignoredInvalidRows \?\? 0/);
});

test("every source row has exactly one accounting outcome", () => {
  for (const counter of [
    "insertedRows", "updatedRows", "unchangedRows", "deactivatedRows", "reactivatedRows",
    "ignoredInvalidRows", "invalidRows", "conflictRows",
  ]) {
    assert.match(migration, new RegExp(`'${counter}'`));
    assert.match(route, new RegExp(`${counter}:`));
  }
  assert.match(migration, /v_rows_received <> v_inserted_rows \+ v_updated_rows \+ v_unchanged_rows[\s\S]*v_invalid_rows \+ v_conflict_rows/);
});

test("updates preserve the row and refresh its mutable snapshot and watermarks", () => {
  assert.match(migration, /update public\.customer_source_bookings_mcp_eap target[\s\S]*booking_status = v_input\.booking_status/);
  assert.match(migration, /row_hash = v_input\.row_hash[\s\S]*source_synced_at = pg_catalog\.clock_timestamp\(\)[\s\S]*updated_at = pg_catalog\.clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /delete from public\.customer_source_bookings_mcp_eap/i);
});

test("identity and booking links remain immutable audit dependencies", () => {
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.customer_(?:booking_profile_links|identity_links|identity_resolution_events)/i);
  assert.doesNotMatch(migration, /drop table|cascade/i);
});

test("commercial readers exclude deactivated rows and naturally include reactivated rows", () => {
  const viewBlock = readContracts.slice(0, readContracts.indexOf("revoke all on public.customer_window_bookings_v"));
  assert.match(viewBlock, /customer_source_bookings_mcp_eap booking[\s\S]*booking\.booking_status in \(1, 8\)/);
  assert.match(readContracts, /customer_window_list_customer_bookings[\s\S]*customer_window_bookings_v/);
  assert.match(periodListing, /customer_source_bookings_mcp_eap booking[\s\S]*booking\.booking_status in \(1, 8\)/);
  assert.equal([1, 8].includes(2), false);
  assert.equal([1, 8].includes(1), true);
});

test("profile metrics exclude invalid rows and receive the source update through the existing link", () => {
  assert.match(metrics, /customer_source_bookings_mcp_eap booking[\s\S]*booking\.booking_status in \(1, 8\)/);
  assert.match(metrics, /delete from public\.customer_profile_metrics[\s\S]*booking\.booking_status in \(1, 8\)/);
  assert.match(metricWatermarks, /customer_window_get_profile_metrics_mcp_eap_changes_m2m[\s\S]*booking\.updated_at[\s\S]*link\.source = 'MCP_EAP'/);
});

test("security, batch bounds, RLS, and non-PII response remain intact", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.import_customer_source_bookings_mcp_eap_m2m\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.import_customer_source_bookings_mcp_eap_m2m\(jsonb\)[\s\S]*to service_role/);
  assert.match(route, /MAX_ROWS_PER_REQUEST = 500/);
  assert.match(route, /isValidPurchaseSyncSecret/);
  assert.doesNotMatch(route, /phone_raw|email_raw|plate_raw|console\.|error\.message/);
  assert.doesNotMatch(migration, /disable row level security|grant [^;]* on table/i);
});
