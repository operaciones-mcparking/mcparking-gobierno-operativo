import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const migration = readFileSync(
  "supabase/migrations/20260925130000_add_customer_window_refresh_health_v1.sql", "utf8");
const harness = readFileSync(
  "supabase/debug/customer_window_refresh_health_v1_reversible_test.sql", "utf8");
const refresh = readFileSync(
  "scripts/customer-window-related-review-mcp-eap-v1-refresh.mjs", "utf8");
const route = readFileSync(
  "src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const contractSource = readFileSync(
  "src/lib/customer-window/customer-refresh-health.ts", "utf8");
const contractJavaScript = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(contractJavaScript).toString("base64")}`);

function functionalBody(source, endMarker) {
  const start = source.indexOf("begin;");
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start + "begin;".length, end).trim();
}

const healthy = {
  activeSnapshotActivatedAt: "2026-09-25T12:00:00Z",
  activeSnapshotId: "11111111-1111-4111-8111-111111111111",
  cadenceMinutes: 30,
  containsPii: false,
  lastAttemptAt: "2026-09-25T12:00:00Z",
  lastErrorCode: null,
  lastErrorPhase: null,
  lastSuccessAt: "2026-09-25T12:01:00Z",
  retentionLastDeletedSnapshotId: null,
  retentionRemaining: 0,
  retentionStatus: "active",
  status: "healthy",
};

test("migration and reversible harness embed the same functional DDL", () => {
  assert.equal(
    functionalBody(harness, "-- Catalog, ACL, CAS, status, and retention contracts."),
    functionalBody(migration, "commit;"),
  );
  assert.match(harness, /rollback;[\s\S]*reversible_cleanup_ok/);
});

test("operational table is RLS protected and direct table access remains revoked", () => {
  assert.match(migration, /create table public\.customer_related_review_refresh_state/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.customer_related_review_refresh_state[\s\S]*service_role[\s\S]*customer_related_review_builder/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete)[\s\S]*customer_related_review_refresh_state/i);
});

test("write RPCs are builder-only security definer functions with CAS", () => {
  for (const name of ["refresh_start", "refresh_heartbeat", "refresh_finish"]) {
    assert.match(migration, new RegExp(`customer_related_review_${name}_v1_m2m[\\s\\S]*security definer[\\s\\S]*set search_path = ''`));
  }
  assert.match(migration, /state\.run_id = p_run_id[\s\S]*state\.run_status = 'running'/);
  assert.match(migration, /refresh_run_not_current/g);
  assert.match(migration, /grant execute[\s\S]*refresh_start_v1_m2m[\s\S]*customer_related_review_builder/);
  assert.doesNotMatch(migration, /grant execute on function public\.customer_related_review_refresh_start_v1_m2m\(uuid\)\s+to service_role/);
});

test("read RPC derives strict status priorities and live retention backlog", () => {
  assert.match(migration, /active_count <> 1[\s\S]*operational\.rule_key is null[\s\S]*heartbeat_at < pg_catalog\.now\(\) - interval '120 seconds'[\s\S]*then 'refreshing'[\s\S]*interval '45 minutes'[\s\S]*then 'stale'[\s\S]*else 'healthy'/);
  assert.match(migration, /greatest\(count\(\*\) filter \(where snapshot\.status = 'superseded'\)::integer - 5, 0\)/);
  assert.match(migration, /retention_last_attempt_at is null then 'unknown'[\s\S]*retention_last_error_code is not null then 'error'[\s\S]*retention_remaining > 0 then 'draining'[\s\S]*else 'active'/);
  assert.match(migration, /'cadenceMinutes', 30/);
  assert.doesNotMatch(migration, /nextExpectedRefreshAt/);
});

test("health payload normalizer accepts the safe contract and rejects unsafe shapes", () => {
  assert.deepEqual(contract.normalizeCustomerWindowRefreshHealth(healthy), healthy);
  assert.equal(contract.normalizeCustomerWindowRefreshHealth({ ...healthy, cadenceMinutes: 15 }), null);
  assert.equal(contract.normalizeCustomerWindowRefreshHealth({ ...healthy, retentionRemaining: -1 }), null);
  assert.equal(contract.normalizeCustomerWindowRefreshHealth({ ...healthy, lastErrorCode: "password=secret" }), null);
  assert.equal(contract.normalizeCustomerWindowRefreshHealth({ ...healthy, containsPii: true }), null);
});

test("refresh worker starts heartbeats finishes and clears one timer", () => {
  assert.match(refresh, /operationalStartFn\(\{ client: operationalClient, runId \}\)/);
  assert.match(refresh, /HEARTBEAT_INTERVAL_MS = 60_000/);
  assert.match(refresh, /OPERATIONAL_QUERY_TIMEOUT_MS = 15_000/);
  assert.match(refresh, /operationalClientFactory[\s\S]*new OperationalClientClass/);
  assert.match(refresh, /if \(stopped \|\| inFlight\) return/);
  assert.match(refresh, /await heartbeat\.stop\(\)[\s\S]*operationalFinishFn/);
  assert.match(refresh, /catch \(finishError\)[\s\S]*refresh_operational_finish_failed/);
  assert.doesNotMatch(refresh, /DATABASE_URL|RELATED_REVIEW_HMAC_KEY.*console/);
});

test("API action is authenticated no-store server-side and calls only the read RPC", () => {
  assert.match(route, /getActiveAdminUser\(\)[\s\S]*action === "refresh-health"/);
  assert.match(route, /getCustomerWindowRefreshHealth\(\)/);
  assert.match(route, /No fue posible consultar el estado de actualizacion\./);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(admin, /customer_window_get_refresh_health_v1_m2m/);
  assert.match(admin, /normalizeCustomerWindowRefreshHealth\(data\)/);
});

test("UI renders all states and polls only health every 60 seconds", () => {
  for (const label of ["Customer Window actualizado", "Actualizando Customer Window...",
    "Datos con retraso", "Última actualización con error",
    "Estado de actualización no disponible", "Frecuencia esperada:",
    "Históricos pendientes:"]) assert.ok(view.includes(label), `missing ${label}`);
  assert.match(view, /action=refresh-health/);
  assert.match(view, /window\.setInterval\(refreshIfVisible, 60_000\)/);
  assert.match(view, /document\.visibilityState === "visible"/);
  const healthBlock = view.slice(view.indexOf("const loadRefreshHealth"),
    view.indexOf("const closeCustomerDrawer"));
  assert.equal((healthBlock.match(/getJson\(/g) ?? []).length, 1);
  assert.match(healthBlock, /previousStatus === "refreshing" && nextHealth\.status === "healthy"/);
  assert.equal((healthBlock.match(/loadRepresentations\(representationPage\)/g) ?? []).length, 1);
  assert.equal((healthBlock.match(/loadPeriodFacets\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(healthBlock, /setRepresentationList|setPeriodFacets/);
});
