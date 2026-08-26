import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825170000_add_customer_source_bookings_okp_reconciliation_state.sql",
  "utf8",
);

function advance(state, expectedAt, expectedId, nextAt, nextId) {
  if (!state) return { code: "sync_state_not_found", ok: false, state };
  if (state.lastSourceUpdatedAt !== expectedAt || state.lastSourceId !== expectedId) {
    return { code: "cursor_conflict", ok: false, state };
  }
  if (nextAt < expectedAt || (nextAt === expectedAt && nextId <= expectedId)) {
    return { code: "cursor_not_advanced", ok: false, state };
  }
  return {
    code: "cursor_advanced",
    ok: true,
    state: {
      ...state,
      lastError: null,
      lastSourceId: nextId,
      lastSourceUpdatedAt: nextAt,
      lastSuccessAt: "now",
      updatedAt: "now",
      version: state.version + 1,
    },
  };
}

test("adds a nullable timezone-free source watermark without seeding state", () => {
  assert.match(migration, /add column if not exists last_source_updated_at timestamp without time zone null/);
  assert.doesNotMatch(migration, /insert into public\.recovery_sync_state/i);
});

test("read RPC returns the fixed OKP reconciliation state without batch metadata", () => {
  assert.match(migration, /get_customer_source_bookings_okp_reconciliation_state_m2m\(\)/);
  assert.match(migration, /where state\.source_key = 'BOOKINGS_LOGS_OKP'[\s\S]*state\.sync_kind = 'active_reconciliation'/);
  for (const key of [
    "sourceKey",
    "syncKind",
    "lastSourceUpdatedAt",
    "lastSourceId",
    "version",
    "lastAttemptAt",
    "lastSuccessAt",
    "lastError",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("create or replace function public.get_customer_source_bookings_okp_reconciliation_state_m2m"),
      migration.indexOf("create or replace function public.advance_customer_source_bookings_okp_reconciliation_cursor_m2m"),
    ),
    /lastBatchId|last_batch_id/,
  );
});

test("read RPC returns a safe missing-state result", () => {
  assert.match(migration, /if not found then[\s\S]*'code', 'sync_state_not_found'/);
  assert.deepEqual(advance(null, "2026-08-15 00:00:00", 0, "2026-08-16 00:00:00", 1), {
    code: "sync_state_not_found",
    ok: false,
    state: null,
  });
});

test("advance RPC rejects null timestamps and negative IDs", () => {
  assert.match(migration, /p_expected_source_updated_at is null or p_new_source_updated_at is null/);
  assert.match(migration, /p_expected_source_id is null or p_expected_source_id < 0/);
  assert.match(migration, /p_new_source_id is null or p_new_source_id < 0/);
});

test("expected timestamp or ID mismatch returns cursor conflict", () => {
  const state = {
    lastBatchId: "preserved",
    lastError: null,
    lastSourceId: 20,
    lastSourceUpdatedAt: "2026-08-20 10:00:00",
    version: 4,
  };
  for (const [expectedAt, expectedId] of [
    ["2026-08-20 09:59:59", 20],
    ["2026-08-20 10:00:00", 19],
  ]) {
    const result = advance(state, expectedAt, expectedId, "2026-08-20 10:01:00", 21);
    assert.equal(result.code, "cursor_conflict");
    assert.deepEqual(result.state, state);
  }
  assert.match(migration, /last_source_updated_at is distinct from p_expected_source_updated_at[\s\S]*last_source_id is distinct from p_expected_source_id/);
});

test("later timestamp advances even when its ID is lower", () => {
  const state = {
    lastBatchId: "preserved",
    lastError: "old error",
    lastSourceId: 500,
    lastSourceUpdatedAt: "2026-08-20 10:00:00",
    version: 3,
  };
  const result = advance(state, state.lastSourceUpdatedAt, 500, "2026-08-20 10:00:01", 1);
  assert.equal(result.ok, true);
  assert.equal(result.state.lastSourceId, 1);
  assert.equal(result.state.version, 4);
});

test("same timestamp advances only with a greater ID", () => {
  const state = {
    lastBatchId: null,
    lastError: null,
    lastSourceId: 20,
    lastSourceUpdatedAt: "2026-08-20 10:00:00",
    version: 0,
  };
  assert.equal(advance(state, state.lastSourceUpdatedAt, 20, state.lastSourceUpdatedAt, 21).ok, true);
  for (const nextId of [20, 19]) {
    assert.equal(
      advance(state, state.lastSourceUpdatedAt, 20, state.lastSourceUpdatedAt, nextId).code,
      "cursor_not_advanced",
    );
  }
});

test("timestamp regression is rejected", () => {
  const state = {
    lastBatchId: null,
    lastError: null,
    lastSourceId: 20,
    lastSourceUpdatedAt: "2026-08-20 10:00:00",
    version: 0,
  };
  assert.equal(advance(state, state.lastSourceUpdatedAt, 20, "2026-08-20 09:59:59", 999).code, "cursor_not_advanced");
  assert.match(migration, /p_new_source_updated_at < p_expected_source_updated_at/);
  assert.match(migration, /p_new_source_id <= p_expected_source_id/);
});

test("successful update advances both components and operational metadata only", () => {
  const updateBlock = migration.slice(
    migration.indexOf("update public.recovery_sync_state as state"),
    migration.indexOf("where state.source_key = 'BOOKINGS_LOGS_OKP'", migration.indexOf("update public.recovery_sync_state as state")),
  );
  for (const assignment of [
    "last_source_updated_at = p_new_source_updated_at",
    "last_source_id = p_new_source_id",
    "last_success_at = v_now",
    "last_error = null",
    "version = state.version + 1",
    "updated_at = v_now",
  ]) {
    assert.match(updateBlock, new RegExp(assignment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(updateBlock, /last_batch_id\s*=|source_key\s*=|sync_kind\s*=|created_at\s*=/);
});

test("valid advance increments version, refreshes success, clears error, and preserves batch", () => {
  const state = {
    lastBatchId: "existing-batch",
    lastError: "retryable",
    lastSourceId: 30,
    lastSourceUpdatedAt: "2026-08-20 10:00:00",
    lastSuccessAt: null,
    updatedAt: "before",
    version: 7,
  };
  const result = advance(state, state.lastSourceUpdatedAt, 30, "2026-08-20 10:05:00", 31);
  assert.equal(result.state.version, 8);
  assert.equal(result.state.lastSuccessAt, "now");
  assert.equal(result.state.lastError, null);
  assert.equal(result.state.lastBatchId, "existing-batch");
});

test("advance uses an advisory lock plus composite cursor and version CAS", () => {
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock\([\s\S]*customer_source_bookings_okp_active_reconciliation_cursor/);
  assert.match(migration, /for update/);
  assert.match(migration, /state\.last_source_updated_at is not distinct from p_expected_source_updated_at/);
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_source_id/);
  assert.match(migration, /state\.version = v_state\.version/);
});

test("both RPCs are SECURITY DEFINER with empty search_path and service-role-only", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 2);
  assert.equal((migration.match(/from public, anon, authenticated, service_role/g) ?? []).length, 2);
  assert.equal((migration.match(/to service_role/g) ?? []).length, 2);
});

test("migration performs no state INSERT or DELETE and leaves generic attempt RPC unchanged", () => {
  assert.doesNotMatch(migration, /insert into public\.recovery_sync_state|delete from public\.recovery_sync_state/i);
  assert.doesNotMatch(migration, /create or replace function public\.recovery_record_sync_attempt_m2m/i);
  assert.doesNotMatch(migration, /'BOOKING_LOGS_OKP'/);
});
