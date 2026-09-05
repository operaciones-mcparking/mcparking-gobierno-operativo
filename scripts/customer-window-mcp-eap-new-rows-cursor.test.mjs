import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904170000_add_customer_window_mcp_eap_new_rows_cursor.sql",
  "utf8",
);
const endpoint = readFileSync("src/app/api/customer-window/mcp-eap/sync/route.ts", "utf8");
const mapper = readFileSync("src/lib/customer-window/mcp-eap-booking-mapper.ts", "utf8");
const importRpc = readFileSync(
  "supabase/migrations/20260831130000_add_customer_source_bookings_mcp_eap_m2m_import.sql",
  "utf8",
);

function commit(state, expectedCursor, nextCursor, processedRows) {
  if (state.cursorId !== expectedCursor) return { code: "cursor_conflict", state };
  if (nextCursor <= expectedCursor) return { code: "cursor_not_advanced", state };
  return {
    code: "cursor_committed",
    state: {
      ...state,
      cursorId: nextCursor,
      lastBatchCount: processedRows,
      processedRows: state.processedRows + processedRows,
      status: "ready",
    },
  };
}

test("creates one private durable MCP EAP new-rows state", () => {
  assert.match(migration, /create table public\.customer_mcp_eap_sync_state/);
  assert.match(migration, /primary key \(source, stream_key\)/);
  assert.match(migration, /source = 'MCP_BUCHUNGEN' and stream_key = 'new_rows_cursor'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.customer_mcp_eap_sync_state[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant [^;]* on table public\.customer_mcp_eap_sync_state/i);
});

test("seeds the approved cursor once without discovering or advancing a maximum", () => {
  assert.match(migration, /'MCP_BUCHUNGEN',[\s\S]*'new_rows_cursor',[\s\S]*798618,[\s\S]*'ready',[\s\S]*0,[\s\S]*0/);
  assert.match(migration, /on conflict \(source, stream_key\) do nothing/);
  assert.doesNotMatch(migration, /max\s*\(|customer_source_bookings_mcp_eap[\s\S]*order by/i);
});

test("read contract returns only operational state", () => {
  assert.match(migration, /customer_window_get_mcp_eap_new_rows_state_m2m\(\)/);
  for (const field of [
    "source", "streamKey", "cursorId", "status", "processedRows", "lastBatchCount",
    "lastStartedAt", "lastSucceededAt", "lastError",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /sync_state_not_found/);
  assert.doesNotMatch(migration, /phone|email|plate|booking_code|payload/i);
});

test("start marks execution without moving or counting the cursor", () => {
  const startBlock = migration.slice(
    migration.indexOf("customer_window_start_mcp_eap_new_rows_m2m"),
    migration.indexOf("customer_window_commit_mcp_eap_new_rows_cursor_m2m"),
  );
  const updateSet = startBlock.slice(startBlock.indexOf("update public.customer_mcp_eap_sync_state"), startBlock.indexOf("return pg_catalog.jsonb_build_object"));
  assert.match(startBlock, /pg_advisory_xact_lock[\s\S]*for update/);
  assert.match(startBlock, /status = 'running'[\s\S]*last_started_at = v_now/);
  assert.doesNotMatch(updateSet, /cursor_id\s*=|processed_rows\s*=/);
});

test("commit uses row locking and cursor CAS with strict forward progress", () => {
  const commitBlock = migration.slice(
    migration.indexOf("customer_window_commit_mcp_eap_new_rows_cursor_m2m"),
    migration.indexOf("customer_window_fail_mcp_eap_new_rows_m2m"),
  );
  assert.match(commitBlock, /p_processed_rows < 1 or p_processed_rows > 500/);
  assert.match(commitBlock, /pg_advisory_xact_lock[\s\S]*for update/);
  assert.match(commitBlock, /v_state\.cursor_id is distinct from p_expected_cursor/);
  assert.match(commitBlock, /p_next_cursor <= p_expected_cursor/);
  assert.match(commitBlock, /cursor_id = p_next_cursor/);
  assert.match(commitBlock, /processed_rows = processed_rows \+ p_processed_rows/);
  assert.match(commitBlock, /where source = 'MCP_BUCHUNGEN'[\s\S]*stream_key = 'new_rows_cursor'[\s\S]*cursor_id = p_expected_cursor/);
});

test("a repeated commit conflicts and cannot double-count rows", () => {
  const initial = { cursorId: 798618, lastBatchCount: 0, processedRows: 0, status: "running" };
  const first = commit(initial, 798618, 798700, 82);
  assert.equal(first.code, "cursor_committed");
  assert.equal(first.state.processedRows, 82);
  const retry = commit(first.state, 798618, 798700, 82);
  assert.equal(retry.code, "cursor_conflict");
  assert.equal(retry.state.processedRows, 82);
  assert.equal(commit(initial, 798618, 798618, 1).code, "cursor_not_advanced");
  assert.equal(commit(initial, 798618, 798617, 1).code, "cursor_not_advanced");
});

test("fail records a bounded error without moving cursor or processed rows", () => {
  const failBlock = migration.slice(migration.indexOf("customer_window_fail_mcp_eap_new_rows_m2m"));
  const updateSet = failBlock.slice(failBlock.indexOf("update public.customer_mcp_eap_sync_state"), failBlock.indexOf("return pg_catalog.jsonb_build_object", failBlock.indexOf("update public.customer_mcp_eap_sync_state")));
  assert.match(failBlock, /pg_advisory_xact_lock[\s\S]*for update/);
  assert.match(failBlock, /status = 'error'/);
  assert.match(failBlock, /last_error = pg_catalog\.left\(pg_catalog\.btrim\(p_error\), 1000\)/);
  assert.doesNotMatch(updateSet, /cursor_id\s*=|processed_rows\s*=/);
});

test("all state RPCs are security definer and executable only by service role", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 4);
  assert.equal((migration.match(/revoke all on function/g) ?? []).length, 4);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 4);
  assert.match(migration, /from public, anon, authenticated, service_role/g);
  assert.match(migration, /to service_role/g);
});

test("existing endpoint mapper and import RPC remain untouched and reusable", () => {
  assert.match(endpoint, /const SOURCE = "MCP_BUCHUNGEN"/);
  assert.match(endpoint, /const MAX_ROWS_PER_REQUEST = 500/);
  assert.match(endpoint, /import_customer_source_bookings_mcp_eap_m2m/);
  assert.match(mapper, /BookingStatus must be 1 or 8/);
  assert.match(importRpc, /elsif v_existing\.row_hash = v_input\.row_hash/);
  const changed = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
  assert.doesNotMatch(changed, /src\/app\/api\/customer-window\/mcp-eap\/sync\/route\.ts/);
  assert.doesNotMatch(changed, /src\/lib\/customer-window\/mcp-eap-booking-mapper\.ts/);
  assert.doesNotMatch(changed, /20260831130000_add_customer_source_bookings_mcp_eap_m2m_import\.sql/);
});
