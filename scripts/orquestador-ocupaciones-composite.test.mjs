import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260831150000_add_ocupaciones_to_operational_composite.sql",
  "utf8",
);
const helper = readFileSync("src/lib/orquestador/actualizar-datos-operacionales.ts", "utf8");
const labels = readFileSync("src/lib/orquestador/composite-runs.ts", "utf8");
const control = readFileSync("src/app/orquestador/actualizar-datos-operacionales-control.tsx", "utf8");
const polling = readFileSync("src/app/orquestador/use-composite-operations-run.ts", "utf8");
const historicalFinish = readFileSync(
  "supabase/migrations/20260818130000_autonomous_operational_composite_advance.sql",
  "utf8",
);

const advance = migration.slice(
  migration.indexOf("create or replace function ops_orchestrator.advance_operational_composite_after_success"),
  migration.indexOf("revoke all on function public.orchestrator_start_operational_update"),
);

test("operational composite exposes exactly four ordered application steps", () => {
  assert.match(helper, /OPERACIONES_SEQUENCE_TOTAL = 4/);
  const positions = [
    helper.indexOf('jobType: "banco_reservas_actualizar"'),
    helper.indexOf('jobType: "banco_packs_actualizar_sin_consumos"'),
    helper.indexOf('jobType: "ocupaciones_actualizar"'),
    helper.indexOf('jobType: "dashboard_actualizar_metricas"'),
  ];
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(helper, /sequenceIndex: 3,[\s\S]*jobType: "dashboard_actualizar_metricas"[\s\S]*sequenceIndex: 4/);
});

test("occupancy step has the exact safe Agent 04 contract", () => {
  const occupancy = helper.slice(
    helper.indexOf('jobType: "ocupaciones_actualizar"'),
    helper.indexOf('jobType: "dashboard_actualizar_metricas"'),
  );
  assert.match(occupancy, /payload: \{ modo: "last-week" \}/);
  assert.match(occupancy, /priority: 100/);
  assert.match(occupancy, /requestedSource: "web_orchestrator"/);
  assert.match(occupancy, /targetWorkerId: OPERACIONES_TARGET_WORKER_ID/);
  assert.doesNotMatch(occupancy, /command|script|path|args|cwd|environment|sql|executable/i);
});

test("readiness validates ocupaciones_actualizar together with every composite job type", () => {
  assert.match(helper, /for \(const step of ACTUALIZAR_DATOS_STEPS\)/);
  assert.match(helper, /jobType: "ocupaciones_actualizar"/);
  assert.match(helper, /input\.jobs\.some\(isActualizarDatosRelevantActiveJob\)/);
});

test("atomic start still creates only Reservations as step one with total four", () => {
  const start = migration.slice(
    migration.indexOf("create or replace function public.orchestrator_start_operational_update"),
    migration.indexOf("create or replace function public.orchestrator_create_operational_update_step_if_missing"),
  );
  assert.match(start, /pg_advisory_xact_lock/);
  assert.match(start, /p_job_type := 'banco_reservas_actualizar'/);
  assert.match(start, /p_sequence_index := 1::smallint/);
  assert.match(start, /p_sequence_total := 4::smallint/);
  assert.doesNotMatch(start, /p_job_type := 'ocupaciones_actualizar'|p_job_type := 'dashboard_actualizar_metricas'/);
});

test("autonomous success creates Packs then Occupancy then Dashboard", () => {
  assert.match(advance, /sequence_index = 1::smallint[\s\S]*v_next_index := 2::smallint[\s\S]*v_next_job_type := 'banco_packs_actualizar_sin_consumos'/);
  assert.match(advance, /sequence_index = 2::smallint[\s\S]*v_next_index := 3::smallint[\s\S]*v_next_job_type := 'ocupaciones_actualizar'/);
  assert.match(advance, /v_next_payload := '\{"modo":"last-week"\}'::jsonb/);
  assert.match(advance, /v_next_priority := 100[\s\S]*v_next_source := 'web_orchestrator'[\s\S]*v_next_worker := 'pc_operaciones_01'/);
  assert.match(advance, /sequence_index = 3::smallint[\s\S]*v_next_index := 4::smallint[\s\S]*v_next_job_type := 'dashboard_actualizar_metricas'/);
  assert.match(advance, /sequence_index = 4::smallint then\s*return null/);
});

test("Dashboard cannot exist before a succeeded Occupancy step", () => {
  const occupancyBranch = advance.indexOf("v_next_job_type := 'ocupaciones_actualizar'");
  const dashboardBranch = advance.indexOf("v_next_job_type := 'dashboard_actualizar_metricas'");
  assert.ok(occupancyBranch >= 0 && dashboardBranch > occupancyBranch);
  assert.match(historicalFinish, /if p_status = 'succeeded' then\s*perform ops_orchestrator\.advance_operational_composite_after_success/);
  assert.doesNotMatch(historicalFinish, /if p_status = 'failed' then\s*perform ops_orchestrator\.advance_operational_composite_after_success/);
});

test("idempotency and exact four-step contract remain enforced", () => {
  assert.match(advance, /sequence_total is distinct from 4::smallint/);
  assert.match(advance, /when unique_violation then/);
  assert.match(advance, /Composite step already exists with different contract/);
  assert.match(advance, /sequence_index not in \(1::smallint, 2::smallint, 3::smallint, 4::smallint\)/);
  assert.match(migration, /p_sequence_total := 4::smallint/g);
});

test("priority does not control sequence order", () => {
  assert.match(advance, /v_next_priority := 100/);
  assert.match(advance, /v_next_priority := 92/);
  assert.match(advance, /sequence_index = 2::smallint[\s\S]*sequence_index = 3::smallint/);
});

test("UI and polling support the fourth step without changing polling architecture", () => {
  assert.match(labels, /3: "Actualizar Ocupaciones ultima semana"/);
  assert.match(labels, /4: "Actualizar metricas Dashboard ultimo mes"/);
  assert.match(control, /"Ocupaciones"/);
  assert.match(control, /xl:grid-cols-4/);
  assert.match(polling, /window\.setTimeout/);
  assert.match(polling, /\/api\/orquestador\/operaciones\/actualizar-datos\/\$\{runId\}/);
});

test("migration leaves finish_job and unrelated infrastructure untouched", () => {
  assert.doesNotMatch(migration, /create or replace function public\.orchestrator_finish_job/);
  assert.doesNotMatch(migration, /worker_health_check|source_connection_check|customer_source|recovery_/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});