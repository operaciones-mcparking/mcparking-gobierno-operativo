import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826120000_add_customer_source_bookings_okp_2023_backfill_cursor.sql",
  "utf8",
);
const syncStateMigration = readFileSync(
  "supabase/migrations/20260821120000_add_recovery_sync_state.sql",
  "utf8",
);

function advance(state, expected, next) {
  if (!state) return { code: "sync_state_not_found", ok: false, state };
  if (state.lastSourceId !== expected) return { code: "cursor_conflict", ok: false, state };
  if (next <= expected) return { code: "cursor_not_advanced", ok: false, state };
  return {
    code: "cursor_advanced",
    ok: true,
    previousSourceId: state.lastSourceId,
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

test("2023 backfill RPC fixes the exact source and sync identity", () => {
  assert.match(migration, /v_source_key constant text := 'BOOKINGS_LOGS_OKP'/);
  assert.match(migration, /v_sync_kind constant text := 'historical_backfill_2023'/);
  assert.doesNotMatch(migration, /'BOOKING_LOGS_OKP'/);
  assert.match(
    migration,
    /where state\.source_key = v_source_key[\s\S]*state\.sync_kind = v_sync_kind[\s\S]*for update/,
  );
});

test("RPC uses security definer, an empty search path, and a dedicated advisory lock", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /pg_catalog\.pg_advisory_xact_lock\([\s\S]*customer_source_bookings_okp_historical_backfill_2023_cursor/,
  );
});

test("RPC is executable only by service_role", () => {
  const signature =
    "public.advance_customer_source_bookings_okp_2023_backfill_cursor_m2m(bigint, bigint)";
  assert.match(
    migration,
    new RegExp(`revoke all on function ${signature.replaceAll(".", "\\.").replace(/[()]/g, "\\$&")}[\\s\\S]*from public, anon, authenticated, service_role`),
  );
  assert.match(
    migration,
    new RegExp(`grant execute on function ${signature.replaceAll(".", "\\.").replace(/[()]/g, "\\$&")}[\\s\\S]*to service_role`),
  );
});

test("missing state and stale expected cursor return safe codes", () => {
  assert.deepEqual(advance(null, 0, 85534), { code: "sync_state_not_found", ok: false, state: null });
  const state = { lastBatchId: null, lastSourceId: 90000, lastSourceUpdatedAt: null, version: 2 };
  assert.equal(advance(state, 89999, 90001).code, "cursor_conflict");
  assert.match(migration, /'code', 'sync_state_not_found'/);
  assert.match(migration, /'code', 'cursor_conflict'/);
});

test("equal and backward cursors are rejected", () => {
  const state = { lastBatchId: null, lastSourceId: 100000, lastSourceUpdatedAt: null, version: 3 };
  assert.equal(advance(state, 100000, 100000).code, "cursor_not_advanced");
  assert.equal(advance(state, 100000, 99999).code, "cursor_not_advanced");
  assert.match(migration, /p_new_source_id <= p_expected_source_id/);
});

test("valid advance increments version and preserves timestamp and batch state", () => {
  const initial = {
    lastBatchId: "existing-batch",
    lastError: "previous error",
    lastSourceId: 100000,
    lastSourceUpdatedAt: null,
    version: 3,
  };
  const result = advance(initial, 100000, 100500);
  assert.equal(result.ok, true);
  assert.equal(result.previousSourceId, 100000);
  assert.equal(result.state.lastSourceId, 100500);
  assert.equal(result.state.version, 4);
  assert.equal(result.state.lastError, null);
  assert.equal(result.state.lastSourceUpdatedAt, null);
  assert.equal(result.state.lastBatchId, "existing-batch");

  const updateSet = migration.match(/update public\.recovery_sync_state as state\s+set([\s\S]*?)\s+where state\.source_key/)?.[1];
  assert.ok(updateSet);
  assert.match(updateSet, /last_source_id = p_new_source_id/);
  assert.match(updateSet, /last_success_at = v_now/);
  assert.match(updateSet, /last_error = null/);
  assert.match(updateSet, /version = state\.version \+ 1/);
  assert.match(updateSet, /updated_at = v_now/);
  assert.doesNotMatch(
    updateSet,
    /last_source_updated_at\s*=|last_batch_id\s*=|source_key\s*=|sync_kind\s*=|created_at\s*=/,
  );
});

test("CAS rechecks source ID and captured version before updating", () => {
  assert.match(migration, /v_expected_version := v_state\.version/);
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_source_id/);
  assert.match(migration, /state\.version = v_expected_version/);
  assert.match(migration, /'previousSourceId', v_previous_source_id/);
  assert.match(migration, /'lastSourceId', v_state\.last_source_id/);
  assert.match(migration, /'version', v_state\.version/);
});

test("migration creates no state row and performs no delete", () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.recovery_sync_state/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.recovery_sync_state/i);
});

test("generic state read and attempt recording remain reusable without recreation", () => {
  assert.match(syncStateMigration, /function public\.recovery_get_sync_state_m2m\(\s*p_source_key text,\s*p_sync_kind text/);
  assert.match(syncStateMigration, /function public\.recovery_record_sync_attempt_m2m\(\s*p_source_key text,\s*p_sync_kind text/);
  assert.doesNotMatch(migration, /create or replace function public\.recovery_get_sync_state_m2m/);
  assert.doesNotMatch(migration, /create or replace function public\.recovery_record_sync_attempt_m2m/);
});
