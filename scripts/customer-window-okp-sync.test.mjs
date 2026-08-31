import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/customer-window/okp/sync/route.ts", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260825130000_add_customer_source_bookings_okp_m2m_import.sql", "utf8");

test("validates exact source, rows shape, non-empty batches, and the 500-row limit", () => {
  assert.match(route, /const SOURCE = "BOOKINGS_LOGS_OKP"/);
  assert.match(route, /payload\.source !== SOURCE/);
  assert.match(route, /!Array\.isArray\(payload\.rows\)/);
  assert.match(route, /payload\.rows\.length === 0/);
  assert.match(route, /const MAX_ROWS_PER_REQUEST = 500/);
  assert.match(route, /payload\.rows\.length > MAX_ROWS_PER_REQUEST/);
});

test("accepts only raw source rows and maps each row server-side", () => {
  for (const field of ["source_row_id", "row_hash", "parking_normalized", "phone_normalized", "email_normalized", "plate_normalized"]) {
    assert.match(route, new RegExp(`"${field}"`));
  }
  assert.match(route, /hasNormalizedInput\(rawRow\)/);
  assert.match(route, /mapOkpBookingSourceRow\(rawRow\)/);
  assert.match(route, /catch \{[\s\S]*invalidRows \+= 1/);
});

test("uses the existing M2M secret contract and an exact middleware bypass", () => {
  assert.match(route, /isValidPurchaseSyncSecret/);
  assert.match(route, /x-mcparking-recovery-secret/);
  assert.match(route, /process\.env\.N8N_RECOVERY_PURCHASES_SECRET/);
  assert.match(middleware, /const okpBookingsSyncPath = "\/api\/customer-window\/okp\/sync"/);
  assert.match(middleware, /pathname === recoveryPurchasesSyncPath/);
  assert.match(middleware, /pathname === okpBookingsSyncPath/);
  assert.doesNotMatch(middleware, /pathname\.startsWith\(okpBookingsSyncPath/);
});

test("calls one service-role RPC and returns all convergence counters", () => {
  assert.match(route, /createSupabaseAdminClient\(\)/);
  assert.match(route, /\.rpc\("import_customer_source_bookings_okp_m2m"/);
  for (const counter of ["rowsReceived", "insertedRows", "updatedRows", "unchangedRows", "invalidRows", "conflictRows"]) {
    assert.match(route, new RegExp(counter));
  }
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("sanitizes errors without returning source rows or SQL details", () => {
  assert.match(route, /jsonError\("No se pudo importar el lote OKP\."/);
  assert.doesNotMatch(route, /error\.message|error\.details|console\./);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*rawRow/);
});

test("RPC serializes convergence and protects duplicate source IDs", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /jsonb_array_elements\(p_rows\)[\s\S]*source_row_id/);
  assert.match(migration, /v_conflict_rows := v_conflict_rows \+ 1/);
});

test("row_hash controls insert unchanged and update while preserving local identity", () => {
  assert.match(migration, /if not found then[\s\S]*insert into public\.customer_source_bookings_okp/);
  assert.match(migration, /elsif v_existing\.row_hash = v_input\.row_hash then[\s\S]*v_unchanged_rows/);
  assert.match(migration, /else[\s\S]*update public\.customer_source_bookings_okp/);
  const updateBlock = migration.slice(migration.indexOf("update public.customer_source_bookings_okp"), migration.indexOf("v_updated_rows :="));
  assert.doesNotMatch(updateBlock, /\bid\s*=/i);
  assert.doesNotMatch(updateBlock, /\bcreated_at\s*=/i);
  assert.match(updateBlock, /source_synced_at = pg_catalog\.clock_timestamp\(\)/);
  assert.match(updateBlock, /updated_at = pg_catalog\.clock_timestamp\(\)/);
});

test("RPC never deletes and remains service-role only", () => {
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("RPC response contains the exact atomic counters", () => {
  for (const counter of ["conflictRows", "insertedRows", "unchangedRows", "updatedRows"]) {
    assert.match(migration, new RegExp(`'${counter}'`));
  }
});