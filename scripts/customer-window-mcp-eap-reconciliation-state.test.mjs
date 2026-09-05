import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260905100000_add_customer_window_mcp_eap_reconciliation_state.sql",
  "utf8",
);
const newRowsMigration = readFileSync(
  "supabase/migrations/20260904170000_add_customer_window_mcp_eap_new_rows_cursor.sql",
  "utf8",
);

function functionBlock(name, nextName) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? migration.indexOf(`create or replace function public.${nextName}`, start)
    : migration.indexOf("revoke all on function", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return migration.slice(start, end);
}

test("reuses the private state table with two fixed independent streams", () => {
  assert.match(migration, /stream_key in \('new_rows_cursor', 'active_reconciliation'\)/);
  assert.match(migration, /'MCP_BUCHUNGEN',[\s\S]*'active_reconciliation',[\s\S]*0,[\s\S]*'ready',[\s\S]*0,[\s\S]*0/);
  assert.match(migration, /on conflict \(source, stream_key\) do nothing/);
  assert.doesNotMatch(migration, /create table public\.customer_mcp_eap_sync_state/);
  assert.doesNotMatch(migration, /disable row level security|create policy|grant [^;]* on table/i);
});

test("documents the required cursor sentinel without giving it reconciliation semantics", () => {
  assert.match(migration, /Reserved as 0 and unused by active_reconciliation/);
  const rpcBody = migration.slice(migration.indexOf("create or replace function"));
  assert.doesNotMatch(rpcBody, /cursor_id\s*=/);
  assert.doesNotMatch(rpcBody, /'cursorId'/);
});

test("read RPC returns the safe reconciliation state without PII or cursor data", () => {
  const block = functionBlock(
    "customer_window_get_mcp_eap_reconciliation_state_m2m()",
    "customer_window_start_mcp_eap_reconciliation_m2m()",
  );
  for (const field of [
    "source", "streamKey", "status", "processedRows", "lastBatchCount",
    "lastStartedAt", "lastSucceededAt", "lastError",
  ]) {
    assert.match(block, new RegExp(`'${field}'`));
  }
  assert.match(block, /state\.source = 'MCP_BUCHUNGEN'[\s\S]*state\.stream_key = 'active_reconciliation'/);
  assert.match(block, /'sync_state_not_found'/);
  assert.doesNotMatch(block, /phone|email|plate|booking|cursorId/i);
});

test("start marks only reconciliation as running without changing counters", () => {
  const block = functionBlock(
    "customer_window_start_mcp_eap_reconciliation_m2m()",
    "customer_window_commit_mcp_eap_reconciliation_m2m(",
  );
  const update = block.slice(block.indexOf("update public.customer_mcp_eap_sync_state"));
  assert.match(block, /customer_window_mcp_eap_active_reconciliation/);
  assert.match(block, /for update/);
  assert.match(update, /set status = 'running',[\s\S]*last_started_at = v_now/);
  assert.match(update, /stream_key = 'active_reconciliation'/);
  assert.doesNotMatch(update, /processed_rows\s*=|last_batch_count\s*=|cursor_id\s*=/);
});

test("commit accepts zero through 500 and accumulates successful reconciliation work", () => {
  const block = functionBlock(
    "customer_window_commit_mcp_eap_reconciliation_m2m(",
    "customer_window_fail_mcp_eap_reconciliation_m2m(",
  );
  assert.match(block, /p_processed_rows < 0 or p_processed_rows > 500/);
  assert.match(block, /for update/);
  assert.match(block, /set status = 'ready',[\s\S]*processed_rows = processed_rows \+ p_processed_rows/);
  assert.match(block, /last_batch_count = p_processed_rows/);
  assert.match(block, /last_succeeded_at = v_now/);
  assert.match(block, /last_error = null/);
  assert.doesNotMatch(block, /cursor_id\s*=/);
});

test("fail records a bounded error without changing processed work", () => {
  const block = functionBlock("customer_window_fail_mcp_eap_reconciliation_m2m(");
  const update = block.slice(block.indexOf("update public.customer_mcp_eap_sync_state"));
  assert.match(block, /for update/);
  assert.match(update, /set status = 'error',[\s\S]*pg_catalog\.left\(pg_catalog\.btrim\(p_error\), 1000\)/);
  assert.match(update, /stream_key = 'active_reconciliation'/);
  assert.doesNotMatch(update, /processed_rows\s*=|last_batch_count\s*=|cursor_id\s*=/);
});

test("all reconciliation RPCs are service-role-only and hardened", () => {
  for (const signature of [
    "customer_window_get_mcp_eap_reconciliation_state_m2m\\(\\)",
    "customer_window_start_mcp_eap_reconciliation_m2m\\(\\)",
    "customer_window_commit_mcp_eap_reconciliation_m2m\\(integer\\)",
    "customer_window_fail_mcp_eap_reconciliation_m2m\\(text\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`));
  }
  assert.equal((migration.match(/security definer/g) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 4);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/i);
});

test("existing new-rows state and RPC contracts remain untouched", () => {
  for (const contract of [
    "customer_window_get_mcp_eap_new_rows_state_m2m",
    "customer_window_start_mcp_eap_new_rows_m2m",
    "customer_window_commit_mcp_eap_new_rows_cursor_m2m",
    "customer_window_fail_mcp_eap_new_rows_m2m",
  ]) {
    assert.match(newRowsMigration, new RegExp(contract));
    assert.doesNotMatch(migration, new RegExp(`create or replace function public\\.${contract}`));
  }
  assert.doesNotMatch(migration, /where source = 'MCP_BUCHUNGEN' and stream_key = 'new_rows_cursor'[\s\S]*update/i);
});
