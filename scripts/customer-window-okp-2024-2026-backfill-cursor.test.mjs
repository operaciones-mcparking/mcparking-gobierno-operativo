import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260826130000_add_customer_source_bookings_okp_2024_2026_backfill_cursor.sql",
  "utf8",
);
const correctiveMigration = readFileSync(
  "supabase/migrations/20260827120000_rename_customer_source_bookings_okp_2024_2026_backfill_cursor.sql",
  "utf8",
);
const migration2023 = readFileSync(
  "supabase/migrations/20260826120000_add_customer_source_bookings_okp_2023_backfill_cursor.sql",
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
    previousSourceCreatedAt: state.lastSourceUpdatedAt,
    previousSourceId: state.lastSourceId,
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

test("read RPC has no parameters and fixes the 2024-2026 backfill identity", () => {
  const readRpc = migration.slice(
    migration.indexOf("create or replace function public.get_customer_source_bookings_okp_2024_2026_backfill_state_m2m"),
    migration.indexOf("create or replace function public.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_m2m"),
  );
  assert.match(
    readRpc,
    /function public\.get_customer_source_bookings_okp_2024_2026_backfill_state_m2m\(\)\s+returns jsonb/,
  );
  assert.match(readRpc, /v_source_key constant text := 'BOOKINGS_LOGS_OKP'/);
  assert.match(readRpc, /v_sync_kind constant text := 'historical_backfill_2024_2026'/);
  assert.match(
    readRpc,
    /where state\.source_key = v_source_key[\s\S]*state\.sync_kind = v_sync_kind/,
  );
  assert.doesNotMatch(readRpc, /p_source_key|p_sync_kind/);
});

test("read RPC maps the composite state to the complete camelCase contract", () => {
  const mappings = new Map([
    ["sourceKey", "v_state.source_key"],
    ["syncKind", "v_state.sync_kind"],
    ["lastSourceCreatedAt", "v_state.last_source_updated_at"],
    ["lastSourceId", "v_state.last_source_id"],
    ["lastAttemptAt", "v_state.last_attempt_at"],
    ["lastSuccessAt", "v_state.last_success_at"],
    ["lastBatchId", "v_state.last_batch_id"],
    ["lastError", "v_state.last_error"],
    ["version", "v_state.version"],
  ]);
  for (const [key, value] of mappings) {
    assert.match(migration, new RegExp(`'${key}', ${value.replaceAll(".", "\\.")}`));
  }
  assert.match(migration, /'code', 'sync_state_found'/);
  assert.match(migration, /'code', 'sync_state_not_found'/);
});

test("read RPC is stable, hardened, read-only, and service-role-only", () => {
  const readRpc = migration.slice(
    migration.indexOf("create or replace function public.get_customer_source_bookings_okp_2024_2026_backfill_state_m2m"),
    migration.indexOf("create or replace function public.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_m2m"),
  );
  assert.match(readRpc, /language plpgsql\s+stable\s+security definer\s+set search_path = ''/);
  assert.doesNotMatch(readRpc, /\binsert\b|\bupdate\b|\bdelete\b/i);
  assert.match(
    migration,
    /revoke all on function public\.get_customer_source_bookings_okp_2024_2026_backfill_state_m2m\(\)[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_customer_source_bookings_okp_2024_2026_backfill_state_m2m\(\)[\s\S]*?to service_role/,
  );
});
test("source RPC has the exact composite cursor signature and fixed identity", () => {
  assert.match(
    migration,
    /function public\.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_m2m\(\s*p_expected_source_created_at timestamp without time zone,\s*p_expected_source_id bigint,\s*p_new_source_created_at timestamp without time zone,\s*p_new_source_id bigint/,
  );
  assert.match(migration, /v_source_key constant text := 'BOOKINGS_LOGS_OKP'/);
  assert.match(migration, /v_sync_kind constant text := 'historical_backfill_2024_2026'/);
  assert.doesNotMatch(migration, /'BOOKING_LOGS_OKP'/);
});

test("corrective migration renames the installed truncated signature to the definitive short name", () => {
  assert.match(
    correctiveMigration,
    /alter function public\.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_\(\s*timestamp without time zone,\s*bigint,\s*timestamp without time zone,\s*bigint\s*\) rename to advance_okp_2024_2026_backfill_cursor_m2m;/,
  );
  assert.doesNotMatch(correctiveMigration, /create or replace function|drop function|grant|revoke/i);
  assert.equal((correctiveMigration.match(/\balter function\b/gi) ?? []).length, 1);
});

test("definitive advance RPC name fits PostgreSQL identifier limits", () => {
  const definitiveName = "advance_okp_2024_2026_backfill_cursor_m2m";
  assert.ok(Buffer.byteLength(definitiveName, "utf8") <= 63);
  assert.match(correctiveMigration, new RegExp(`rename to ${definitiveName}`));
});

test("RPC is hardened and locks only its fixed state row", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /pg_catalog\.pg_advisory_xact_lock\([\s\S]*customer_source_bookings_okp_historical_backfill_2024_2026_cursor/,
  );
  assert.match(
    migration,
    /where state\.source_key = v_source_key[\s\S]*state\.sync_kind = v_sync_kind[\s\S]*for update/,
  );
});

test("missing state and expected cursor mismatch return safe codes", () => {
  assert.deepEqual(advance(null, "2024-01-01 00:00:00", 0, "2024-01-01 00:00:01", 1), {
    code: "sync_state_not_found",
    ok: false,
    state: null,
  });
  const state = {
    lastSourceId: 50,
    lastSourceUpdatedAt: "2024-01-02 00:00:00",
    version: 2,
  };
  assert.equal(advance(state, "2024-01-01 00:00:00", 50, "2024-01-03 00:00:00", 51).code, "cursor_conflict");
  assert.equal(advance(state, state.lastSourceUpdatedAt, 49, "2024-01-03 00:00:00", 51).code, "cursor_conflict");
  assert.match(migration, /'code', 'sync_state_not_found'/);
  assert.match(migration, /'code', 'cursor_conflict'/);
});

test("a later timestamp advances even when the new ID is lower", () => {
  const state = {
    lastBatchId: "preserved",
    lastError: "old error",
    lastSourceId: 900,
    lastSourceUpdatedAt: "2024-06-01 10:00:00",
    version: 3,
  };
  const result = advance(state, state.lastSourceUpdatedAt, 900, "2024-06-01 10:00:01", 1);
  assert.equal(result.ok, true);
  assert.equal(result.state.lastSourceId, 1);
  assert.equal(result.state.version, 4);
});

test("the same timestamp advances only with a greater ID", () => {
  const state = {
    lastSourceId: 100,
    lastSourceUpdatedAt: "2025-01-01 00:00:00",
    version: 0,
  };
  assert.equal(advance(state, state.lastSourceUpdatedAt, 100, state.lastSourceUpdatedAt, 101).ok, true);
  for (const nextId of [100, 99]) {
    assert.equal(
      advance(state, state.lastSourceUpdatedAt, 100, state.lastSourceUpdatedAt, nextId).code,
      "cursor_not_advanced",
    );
  }
});

test("timestamp regression is rejected", () => {
  const state = {
    lastSourceId: 100,
    lastSourceUpdatedAt: "2026-01-01 00:00:00",
    version: 0,
  };
  assert.equal(advance(state, state.lastSourceUpdatedAt, 100, "2025-12-31 23:59:59", 999).code, "cursor_not_advanced");
  assert.match(migration, /p_new_source_created_at < p_expected_source_created_at/);
  assert.match(migration, /p_new_source_id <= p_expected_source_id/);
});

test("successful CAS advances both components and operational metadata only", () => {
  const updateSet = migration.match(/update public\.recovery_sync_state as state\s+set([\s\S]*?)\s+where state\.source_key/)?.[1];
  assert.ok(updateSet);
  for (const assignment of [
    "last_source_updated_at = p_new_source_created_at",
    "last_source_id = p_new_source_id",
    "last_success_at = v_now",
    "last_error = null",
    "version = state.version + 1",
    "updated_at = v_now",
  ]) {
    assert.match(updateSet, new RegExp(assignment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(updateSet, /last_batch_id\s*=|source_key\s*=|sync_kind\s*=|created_at\s*=/);
  assert.match(migration, /v_expected_version := v_state\.version/);
  assert.match(migration, /state\.last_source_updated_at is not distinct from p_expected_source_created_at/);
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_source_id/);
  assert.match(migration, /state\.version = v_expected_version/);
});

test("valid advance increments version, clears error, and preserves batch", () => {
  const state = {
    lastBatchId: "existing-batch",
    lastError: "retryable",
    lastSourceId: 10,
    lastSourceUpdatedAt: "2024-01-01 00:00:00",
    lastSuccessAt: null,
    version: 7,
  };
  const result = advance(state, state.lastSourceUpdatedAt, 10, "2024-01-01 00:01:00", 11);
  assert.equal(result.state.version, 8);
  assert.equal(result.state.lastSuccessAt, "now");
  assert.equal(result.state.lastError, null);
  assert.equal(result.state.lastBatchId, "existing-batch");
});

test("response exposes the complete safe composite cursor contract", () => {
  for (const key of [
    "sourceKey",
    "syncKind",
    "previousSourceCreatedAt",
    "previousSourceId",
    "lastSourceCreatedAt",
    "lastSourceId",
    "version",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("RPC is executable only by service_role", () => {
  assert.match(
    migration,
    /revoke all on function public\.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_m2m\([\s\S]*?\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_m2m\([\s\S]*?\) to service_role/,
  );
  assert.doesNotMatch(correctiveMigration, /grant|revoke/i);
});

test("migration seeds no state and leaves the 2023 infrastructure untouched", () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.recovery_sync_state/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.recovery_sync_state/i);
  assert.doesNotMatch(migration, /create or replace function public\.advance_customer_source_bookings_okp_2023_backfill_cursor_m2m/);
  assert.match(migration2023, /v_sync_kind constant text := 'historical_backfill_2023'/);
});
