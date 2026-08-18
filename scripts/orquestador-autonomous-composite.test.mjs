import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260818130000_autonomous_operational_composite_advance.sql",
  "utf8",
);
const advanceRoute = readFileSync(
  "src/app/api/orquestador/operaciones/actualizar-datos/advance/route.ts",
  "utf8",
);
const clientHook = readFileSync(
  "src/app/orquestador/use-composite-operations-run.ts",
  "utf8",
);
const helper = migration.slice(
  migration.indexOf("create or replace function ops_orchestrator.advance_operational_composite_after_success"),
  migration.indexOf("create or replace function public.orchestrator_finish_job"),
);
const finish = migration.slice(
  migration.indexOf("create or replace function public.orchestrator_finish_job"),
  migration.indexOf("commit;"),
);

let passed = 0;
function test(name, callback) {
  callback();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

test("standalone succeeded does not advance", () => {
  assert.match(helper, /v_current\.composite_run_id is null[\s\S]*return null/);
});

test("step 1 creates the exact step 2 contract", () => {
  assert.match(helper, /sequence_index = 1::smallint[\s\S]*v_next_index := 2::smallint/);
  assert.match(helper, /v_next_job_type := 'banco_packs_actualizar_sin_consumos'/);
  assert.match(helper, /v_next_payload := '\{"action":"actualizar-packs"\}'::jsonb/);
});

test("step 2 creates the exact step 3 contract", () => {
  assert.match(helper, /sequence_index = 2::smallint[\s\S]*v_next_index := 3::smallint/);
  assert.match(helper, /v_next_job_type := 'dashboard_actualizar_metricas'/);
  assert.match(helper, /"action":"actualizar-metricas","agent":"dashboard","periodo":"last-week"/);
});

test("step 3 creates no step 4", () => {
  assert.match(helper, /sequence_index = 3::smallint then\s*return null/);
  assert.doesNotMatch(helper, /v_next_index := 4/);
});

test("failed and cancelled do not advance", () => {
  assert.match(helper, /v_current\.status <> 'succeeded'/);
  assert.match(finish, /if p_status = 'succeeded' then\s*perform ops_orchestrator\.advance_operational_composite_after_success/);
});

test("recovery failed cannot invoke automatic advance", () => {
  assert.doesNotMatch(helper, /status\s*=\s*'failed'/);
  assert.match(finish, /if p_status = 'succeeded'/);
});

test("step 1 requested_by is preserved", () => {
  assert.match(helper, /select step_one\.requested_by[\s\S]*sequence_index = 1::smallint/);
  assert.match(helper, /requested_by[\s\S]*v_initiator/);
});

test("priorities are exact", () => {
  assert.match(helper, /v_next_priority := 91/);
  assert.match(helper, /v_next_priority := 92/);
});

test("sources and worker are exact", () => {
  assert.match(helper, /web_orchestrator_operaciones_last_month_packs/);
  assert.match(helper, /web_orchestrator_operaciones_last_month_dashboard/);
  assert.match(helper, /v_next_worker := 'pc_operaciones_01'/);
});

test("disabled registry entries do not reject finish", () => {
  assert.match(helper, /select jt\.enabled\s+into v_next_job_type_enabled/);
  assert.doesNotMatch(helper, /v_next_job_type_enabled\s*=\s*false[\s\S]*raise exception/);
});

test("missing registry and worker fail explicitly", () => {
  assert.match(helper, /next job type does not exist/);
  assert.match(helper, /target worker does not exist/);
});

test("same-run advisory lock and unique defense are present", () => {
  assert.match(helper, /pg_advisory_xact_lock[\s\S]*v_current\.composite_run_id/);
  assert.match(helper, /when unique_violation then/);
});

test("an identical existing step is reused and a mismatch fails", () => {
  assert.match(helper, /if found then[\s\S]*return v_existing/);
  assert.match(helper, /Composite step already exists with different contract/);
  assert.doesNotMatch(helper, /requested_by is distinct from/);
});

test("created event preserves viewer metadata", () => {
  assert.match(helper, /'created',[\s\S]*'Composite job step created'/);
  for (const key of ["requested_source", "composite_run_id", "composite_kind", "sequence_index", "sequence_total", "autonomous_advance", "job_type_enabled"]) {
    assert.match(helper, new RegExp(`'${key}'`));
  }
});

test("finish_job keeps its public contract and terminal event", () => {
  assert.match(finish, /p_result jsonb default null/);
  assert.match(finish, /p_error_message text default null/);
  assert.match(finish, /returns ops_orchestrator\.orchestrator_jobs/);
  assert.match(finish, /Job finalizado correctamente/);
  assert.match(finish, /Job finalizado con error/);
  assert.match(finish, /Job cancelado/);
});

test("finish_job remains service-role only", () => {
  assert.match(finish, /revoke all on function public\.orchestrator_finish_job\(uuid, text, text, jsonb, text\) from public/);
  assert.match(finish, /revoke execute[\s\S]*from anon/);
  assert.match(finish, /revoke execute[\s\S]*from authenticated/);
  assert.match(finish, /grant execute[\s\S]*to service_role/);
});

test("legacy advance remains present and requested_by is not part of existing-step compatibility", () => {
  assert.match(advanceRoute, /createOperationalUpdateStepIfMissing/);
  assert.match(advanceRoute, /Legacy compatibility: autonomous SQL advancement is authoritative/);
  assert.doesNotMatch(helper, /v_existing\.requested_by is distinct from/);
});

test("PC02 observes the composite without advancing it", () => {
  assert.doesNotMatch(clientHook, /\/api\/orquestador\/operaciones\/actualizar-datos\/advance/);
  assert.doesNotMatch(clientHook, /advanceRun|isAdvancingRef|advanceControllerRef/);
  assert.match(clientHook, /const nextRun = await loadRun\(runId\)/);
  assert.match(clientHook, /scheduleNext\(nextRun\.run_id, retryDelayRef\.current\)/);
});

test("hidden tabs only defer visual polling", () => {
  assert.match(clientHook, /document\.visibilityState !== "visible"[\s\S]*scheduleNext\(runId, retryDelayRef\.current\)/);
  assert.doesNotMatch(clientHook, /visibilityState[\s\S]{0,500}method: "POST"/);
});

test("active discovery and stored run recovery remain read-only", () => {
  assert.match(clientHook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos\/active"/);
  assert.match(clientHook, /loadRun\(normalizedStoredRunId, \{ allowNotFoundReset: true \}\)/);
  assert.match(clientHook, /persistRunId\(responseBody\.run\.run_id\)/);
});

test("migration does not create a duplicate unique index", () => {
  assert.doesNotMatch(migration, /^\s*create\s+unique\s+index/im);
  assert.match(migration, /orchestrator_jobs_composite_step_uidx/);
});

console.log(`orquestador-autonomous-composite: ${passed}\/${passed} OK`);
