import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260831140000_add_mcp_eap_2023_2026_backfill_cursor.sql", "utf8");
const syncStateMigration = readFileSync("supabase/migrations/20260821120000_add_recovery_sync_state.sql", "utf8");

function advance(state, expected, next) {
  if (!state) return { code: "sync_state_not_found", ok: false, state };
  if (state.lastSourceId !== expected) return { code: "cursor_conflict", ok: false, state };
  if (next <= expected) return { code: "cursor_not_advanced", ok: false, state };
  return {
    code: "cursor_advanced",
    ok: true,
    state: {
      ...state,
      lastError: null,
      lastSourceId: next,
      lastSuccessAt: "now",
      updatedAt: "now",
      version: state.version + 1,
    },
  };
}

test("cursor RPC fixes the exact MCP/EAP historical identity", () => {
  assert.match(migration, /function public\.advance_mcp_eap_2023_2026_backfill_cursor_m2m\(\s*p_expected_source_id bigint,\s*p_new_source_id bigint/);
  assert.match(migration, /v_source_key constant text := 'MCP_BUCHUNGEN'/);
  assert.match(migration, /v_sync_kind constant text := 'historical_backfill_2023_2026'/);
  assert.doesNotMatch(migration, /BOOKINGS_LOGS_OKP|customer_source_bookings_okp/);
});

test("cursor RPC is hardened, locked, and row-serialized", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*mcp_eap_historical_backfill_2023_2026_cursor/);
  assert.match(migration, /where state\.source_key = v_source_key[\s\S]*state\.sync_kind = v_sync_kind[\s\S]*for update/);
});

test("missing state, stale expected, equality, and regression do not advance", () => {
  assert.equal(advance(null, 0, 1).code, "sync_state_not_found");
  const state = { lastBatchId: "preserved", lastSourceId: 10, lastSourceUpdatedAt: null, version: 2 };
  assert.equal(advance(state, 9, 11).code, "cursor_conflict");
  assert.equal(advance(state, 10, 10).code, "cursor_not_advanced");
  assert.equal(advance(state, 10, 9).code, "cursor_not_advanced");
  assert.match(migration, /p_new_source_id <= p_expected_source_id/);
});

test("valid CAS advances ID, version, success, and error only", () => {
  const state = {
    lastBatchId: "preserved",
    lastError: "previous",
    lastSourceId: 10,
    lastSourceUpdatedAt: null,
    version: 2,
  };
  const result = advance(state, 10, 20);
  assert.equal(result.state.lastSourceId, 20);
  assert.equal(result.state.version, 3);
  assert.equal(result.state.lastSuccessAt, "now");
  assert.equal(result.state.lastError, null);
  assert.equal(result.state.lastBatchId, "preserved");
  assert.equal(result.state.lastSourceUpdatedAt, null);

  const updateSet = migration.match(/update public\.recovery_sync_state as state\s+set([\s\S]*?)\s+where state\.source_key/)?.[1];
  assert.ok(updateSet);
  assert.match(updateSet, /last_source_id = p_new_source_id/);
  assert.match(updateSet, /last_success_at = v_now/);
  assert.match(updateSet, /last_error = null/);
  assert.match(updateSet, /version = state\.version \+ 1/);
  assert.doesNotMatch(updateSet, /last_source_updated_at\s*=|last_batch_id\s*=/);
});

test("CAS rechecks source ID and captured version", () => {
  assert.match(migration, /v_expected_version := v_state\.version/);
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_source_id/);
  assert.match(migration, /state\.version = v_expected_version/);
});

test("RPC is service-role-only and seeds no state", () => {
  assert.match(migration, /revoke all on function public\.advance_mcp_eap_2023_2026_backfill_cursor_m2m\(bigint, bigint\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.advance_mcp_eap_2023_2026_backfill_cursor_m2m\(bigint, bigint\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.recovery_sync_state|delete\s+from/i);
});

test("generic state read and attempt recording remain reusable unchanged", () => {
  assert.match(syncStateMigration, /function public\.recovery_get_sync_state_m2m\(\s*p_source_key text,\s*p_sync_kind text/);
  assert.match(syncStateMigration, /function public\.recovery_record_sync_attempt_m2m\(\s*p_source_key text,\s*p_sync_kind text/);
  assert.doesNotMatch(migration, /create or replace function public\.recovery_get_sync_state_m2m|create or replace function public\.recovery_record_sync_attempt_m2m/);
});
