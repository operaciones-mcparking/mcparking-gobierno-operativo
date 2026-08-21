import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath = "supabase/migrations/20260821120000_add_recovery_sync_state.sql";
const migration = readFileSync(migrationPath, "utf8");

function advance(state, expected, next, batchId) {
  if (state.lastSourceId !== expected) return { code: "stale_cursor", ok: false, state };
  if (state.lastSourceId !== null && next <= state.lastSourceId) {
    return { code: "cursor_not_advanced", ok: false, state };
  }
  return {
    code: "cursor_advanced",
    ok: true,
    state: { ...state, lastBatchId: batchId, lastError: null, lastSourceId: next, version: state.version + 1 },
  };
}

function recordAttempt(state, error) {
  const normalized = error?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 500) || null;
  return { ...state, lastAttemptAt: "now", lastError: normalized };
}

test("table supports an uninitialized cursor and safe batch retention", () => {
  assert.match(migration, /last_source_id bigint[,\s]/);
  assert.doesNotMatch(migration, /last_source_id bigint not null/);
  assert.match(migration, /last_batch_id uuid references public\.recovery_import_batches\(id\) on delete set null/);
  assert.match(migration, /primary key \(source_key, sync_kind\)/);
  assert.match(migration, /last_source_id is null or last_source_id >= 0/);
  assert.match(migration, /version >= 0/);
});

test("migration creates no production seed and stores operational metadata only", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table public.recovery_sync_state"),
    migration.indexOf("comment on table public.recovery_sync_state"),
  );
  assert.doesNotMatch(migration, /insert into public.recovery_sync_state/i);
  assert.doesNotMatch(tableDefinition, /email|phone|telefono|payload|secret|request_body|sql_text/i);
  assert.match(migration, /Contains no payloads, secrets, or PII/);
});

test("read RPC is stable service-role-only metadata", () => {
  assert.match(migration, /recovery_get_sync_state_m2m[\s\S]*returns table/);
  assert.match(migration, /language sql\s+stable\s+security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.recovery_get_sync_state_m2m\(text, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.recovery_get_sync_state_m2m\(text, text\) to service_role/);
});

test("table is private and service role has only explicit operational access", () => {
  assert.match(migration, /alter table public\.recovery_sync_state enable row level security/);
  assert.match(migration, /revoke all on table public\.recovery_sync_state from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.recovery_sync_state to service_role/);
  assert.doesNotMatch(migration, /create policy/);
});

test("attempt and error recording never change cursor or version", () => {
  const block = migration.slice(
    migration.indexOf("create or replace function public.recovery_record_sync_attempt_m2m"),
    migration.indexOf("create or replace function public.recovery_advance_sync_cursor_m2m"),
  );
  assert.match(block, /last_attempt_at = v_now/);
  assert.match(block, /last_error = v_error/);
  assert.doesNotMatch(block, /last_source_id\s*=/);
  assert.doesNotMatch(block, /version\s*=/);
  const state = { lastAttemptAt: null, lastError: null, lastSourceId: 10, version: 3 };
  assert.deepEqual(recordAttempt(state, " failed\nretry "), { ...state, lastAttemptAt: "now", lastError: "failed retry" });
});

test("errors are sanitized and truncated to 500 characters", () => {
  assert.match(migration, /regexp_replace\(coalesce\(p_error, ''\), '\[\[:cntrl:\]\]\+', ' ', 'g'\)/);
  assert.match(migration, /left\(v_error, 500\)/);
  assert.match(migration, /length\(last_error\) <= 500/);
  const result = recordAttempt({ lastSourceId: 4, version: 1 }, `bad\n${"x".repeat(600)}`);
  assert.equal(result.lastError.length, 500);
  assert.doesNotMatch(result.lastError, /\n/);
});

test("CAS locks the state row and compares null safely", () => {
  assert.match(migration, /from public\.recovery_sync_state as state[\s\S]*for update/);
  assert.match(migration, /last_source_id is distinct from p_expected_last_source_id/);
  assert.match(migration, /state\.last_source_id is not distinct from p_expected_last_source_id/);
  assert.match(migration, /'code', 'stale_cursor'/);
});

test("first approved advance supports null to a concrete cursor", () => {
  const initial = { lastBatchId: null, lastError: "pending", lastSourceId: null, version: 0 };
  const result = advance(initial, null, 795217, "batch-1");
  assert.equal(result.ok, true);
  assert.equal(result.state.lastSourceId, 795217);
  assert.equal(result.state.version, 1);
  assert.equal(result.state.lastBatchId, "batch-1");
  assert.equal(result.state.lastError, null);
});

test("valid X to Y advance increments version and records batch", () => {
  const result = advance({ lastBatchId: "old", lastError: null, lastSourceId: 10, version: 5 }, 10, 20, "new");
  assert.deepEqual(result.state, { lastBatchId: "new", lastError: null, lastSourceId: 20, version: 6 });
  assert.match(migration, /last_batch_id = p_batch_id/);
  assert.match(migration, /version = state\.version \+ 1/);
  assert.match(migration, /last_success_at = v_now/);
});

test("non-increasing cursor is rejected without changing state", () => {
  const initial = { lastBatchId: "batch-1", lastError: null, lastSourceId: 20, version: 2 };
  for (const next of [20, 19]) {
    const result = advance(initial, 20, next, "batch-2");
    assert.equal(result.code, "cursor_not_advanced");
    assert.deepEqual(result.state, initial);
  }
  assert.match(migration, /p_new_last_source_id <= v_state\.last_source_id/);
});

test("logical concurrency allows the first CAS and rejects the second as stale", () => {
  const initial = { lastBatchId: null, lastError: null, lastSourceId: 100, version: 0 };
  const first = advance(initial, 100, 150, "batch-a");
  const second = advance(first.state, 100, 175, "batch-b");
  assert.equal(first.code, "cursor_advanced");
  assert.equal(second.code, "stale_cursor");
  assert.equal(second.state.lastSourceId, 150);
  assert.equal(second.state.version, 1);
});

test("advance accepts only an imported batch and all mutating RPCs are service-role-only", () => {
  assert.match(migration, /batch\.id = p_batch_id[\s\S]*batch\.status = 'imported'/);
  assert.match(migration, /'code', 'invalid_batch'/);
  for (const signature of [
    "recovery_record_sync_attempt_m2m\\(text, text, text\\)",
    "recovery_advance_sync_cursor_m2m\\(text, text, bigint, bigint, uuid\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
});
