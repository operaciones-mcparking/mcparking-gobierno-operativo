import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825160000_add_customer_source_bookings_okp_cursor_advance.sql",
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

test("RPC fixes the exact OKP cursor identity and uses a dedicated transaction lock", () => {
  assert.match(migration, /v_source_key constant text := 'BOOKINGS_LOGS_OKP'/);
  assert.match(migration, /v_sync_kind constant text := 'new_rows_cursor'/);
  assert.doesNotMatch(migration, /'BOOKING_LOGS_OKP'/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*customer_source_bookings_okp_new_rows_cursor/);
  assert.match(migration, /where state\.source_key = v_source_key[\s\S]*state\.sync_kind = v_sync_kind[\s\S]*for update/);
});

test("missing state and expected mismatch do not advance", () => {
  assert.deepEqual(advance(null, 377134, 377135), { code: "sync_state_not_found", ok: false, state: null });
  const state = { lastBatchId: null, lastError: null, lastSourceId: 377135, version: 1 };
  assert.deepEqual(advance(state, 377134, 377136), { code: "cursor_conflict", ok: false, state });
  assert.match(migration, /'code', 'sync_state_not_found'/);
  assert.match(migration, /'code', 'cursor_conflict'[\s\S]*'lastSourceId', v_state\.last_source_id/);
});

test("new cursor must be strictly greater than expected", () => {
  const state = { lastBatchId: null, lastError: null, lastSourceId: 377134, version: 0 };
  for (const next of [377134, 377133]) {
    const result = advance(state, 377134, next);
    assert.equal(result.code, "cursor_not_advanced");
    assert.deepEqual(result.state, state);
  }
  assert.match(migration, /p_new_last_source_id <= p_expected_last_source_id/);
});

test("cursor conflict takes precedence when expected is stale", () => {
  const state = { lastBatchId: null, lastError: null, lastSourceId: 377140, version: 2 };
  const result = advance(state, 377134, 377134);
  assert.equal(result.code, "cursor_conflict");
  assert.deepEqual(result.state, state);
  assert.ok(
    migration.indexOf("v_state.last_source_id is distinct from p_expected_last_source_id") <
      migration.indexOf("p_new_last_source_id <= p_expected_last_source_id"),
  );
});
test("valid CAS advances timestamps, clears error, increments version, and preserves batch", () => {
  const initial = {
    lastBatchId: "existing-batch",
    lastError: "previous failure",
    lastSourceId: 377134,
    lastSuccessAt: null,
    updatedAt: "before",
    version: 0,
  };
  const result = advance(initial, 377134, 377150);
  assert.equal(result.ok, true);
  assert.equal(result.previousSourceId, 377134);
  assert.equal(result.state.lastSourceId, 377150);
  assert.equal(result.state.version, 1);
  assert.equal(result.state.lastSuccessAt, "now");
  assert.equal(result.state.lastError, null);
  assert.equal(result.state.lastBatchId, "existing-batch");
  assert.match(migration, /last_success_at = v_now/);
  assert.match(migration, /last_error = null/);
  assert.match(migration, /version = state\.version \+ 1/);
  assert.match(migration, /updated_at = v_now/);
  assert.doesNotMatch(migration, /last_batch_id\s*=/);
});

test("CAS rechecks cursor and version and returns the safe success contract", () => {
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_last_source_id/);
  assert.match(migration, /state\.version = v_state\.version/);
  assert.match(migration, /'code', 'cursor_advanced'/);
  assert.match(migration, /'previousSourceId', v_previous_source_id/);
  assert.match(migration, /'lastSourceId', v_state\.last_source_id/);
  assert.match(migration, /'version', v_state\.version/);
});

test("RPC is service-role-only and never deletes or exposes payload data", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.advance_customer_source_bookings_okp_cursor_m2m\(bigint, bigint\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.advance_customer_source_bookings_okp_cursor_m2m\(bigint, bigint\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /\bdelete\b|payload|email|phone|plate|secret/i);
});
