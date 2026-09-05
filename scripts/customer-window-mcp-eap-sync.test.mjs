import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/customer-window/mcp-eap/sync/route.ts", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const tableMigration = readFileSync("supabase/migrations/20260831120000_create_customer_source_bookings_mcp_eap.sql", "utf8");
const importMigration = readFileSync("supabase/migrations/20260904180000_support_customer_window_mcp_eap_deactivation.sql", "utf8");

test("endpoint validates exact source, raw rows, and the 500-row limit", () => {
  assert.match(route, /const SOURCE = "MCP_BUCHUNGEN"/);
  assert.match(route, /payload\.source !== SOURCE/);
  assert.match(route, /const MAX_ROWS_PER_REQUEST = 500/);
  assert.match(route, /payload\.rows\.length > MAX_ROWS_PER_REQUEST/);
  assert.match(route, /hasNormalizedInput\(rawRow\)/);
  assert.match(route, /mapMcpEapBookingSourceRow\(rawRow\)/);
});

test("endpoint uses existing server-side M2M authentication and an exact bypass", () => {
  assert.match(route, /isValidPurchaseSyncSecret/);
  assert.match(route, /x-mcparking-recovery-secret/);
  assert.match(route, /process\.env\.N8N_RECOVERY_PURCHASES_SECRET/);
  assert.match(middleware, /const mcpEapBookingsSyncPath = "\/api\/customer-window\/mcp-eap\/sync"/);
  assert.match(middleware, /pathname === mcpEapBookingsSyncPath/);
  assert.doesNotMatch(middleware, /pathname\.startsWith\(mcpEapBookingsSyncPath/);
});

test("endpoint calls the dedicated RPC and returns only convergence counters", () => {
  assert.match(route, /createSupabaseAdminClient\(\)/);
  assert.match(route, /\.rpc\("import_customer_source_bookings_mcp_eap_m2m"/);
  for (const counter of [
    "rowsReceived", "insertedRows", "updatedRows", "unchangedRows", "deactivatedRows",
    "reactivatedRows", "ignoredInvalidRows", "invalidRows", "conflictRows",
  ]) {
    assert.match(route, new RegExp(counter));
  }
  assert.doesNotMatch(route, /error\.message|error\.details|SUPABASE_SERVICE_ROLE_KEY|console\./);
  assert.doesNotMatch(route, /phone_raw|email_raw|plate_raw/);
});

test("table is private and has only the approved identity and indexes", () => {
  assert.match(tableMigration, /create table public\.customer_source_bookings_mcp_eap/);
  assert.match(tableMigration, /unique \(source, source_row_id\)/);
  assert.match(tableMigration, /enable row level security/);
  assert.match(tableMigration, /revoke all on table public\.customer_source_bookings_mcp_eap[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(tableMigration, /grant select, insert, update on table public\.customer_source_bookings_mcp_eap[\s\S]*to service_role/);
  assert.doesNotMatch(tableMigration, /grant[^;]*(?:delete|references|trigger|truncate)[^;]*to service_role/i);
  assert.equal((tableMigration.match(/create index customer_source_bookings_mcp_eap_/g) ?? []).length, 7);
  assert.doesNotMatch(tableMigration, /create policy|index[^;]+(?:row_hash|is_pack|booking_status)/i);
});

test("import RPC is atomic, bounded, convergent, and never deletes", () => {
  assert.match(importMigration, /function public\.import_customer_source_bookings_mcp_eap_m2m\(\s*p_rows jsonb/);
  assert.match(importMigration, /security definer\s+set search_path = ''/);
  assert.match(importMigration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(importMigration, /v_rows_received < 1 or v_rows_received > 500/);
  assert.match(importMigration, /for update/);
  assert.match(importMigration, /if not found then[\s\S]*insert into public\.customer_source_bookings_mcp_eap/);
  assert.match(importMigration, /if v_existing\.row_hash = v_input\.row_hash then[\s\S]*v_unchanged_rows/);
  assert.match(importMigration, /update public\.customer_source_bookings_mcp_eap target/);
  assert.doesNotMatch(importMigration, /\bdelete\s+from\b/i);
});

test("import RPC reports complete accounting and is service-role-only", () => {
  for (const counter of [
    "rowsReceived", "insertedRows", "updatedRows", "unchangedRows", "deactivatedRows",
    "reactivatedRows", "ignoredInvalidRows", "invalidRows", "conflictRows",
  ]) {
    assert.match(importMigration, new RegExp(`'${counter}'`));
  }
  assert.match(importMigration, /revoke all on function public\.import_customer_source_bookings_mcp_eap_m2m\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(importMigration, /grant execute on function public\.import_customer_source_bookings_mcp_eap_m2m\(jsonb\)[\s\S]*to service_role/);
});

test("new contracts do not write to OKP or recovery source tables", () => {
  const combined = `${tableMigration}\n${importMigration}\n${route}`;
  assert.doesNotMatch(combined, /customer_source_bookings_okp|recovery_bookings_import|import_recovery_purchases/);
});
