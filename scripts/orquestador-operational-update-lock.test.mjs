import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260810120000_lock_operational_update_runs.sql", "utf8");
const startRoute = readFileSync("src/app/api/orquestador/operaciones/actualizar-datos/route.ts", "utf8");
const activeRoute = readFileSync("src/app/api/orquestador/operaciones/actualizar-datos/active/route.ts", "utf8");
const advanceRoute = readFileSync("src/app/api/orquestador/operaciones/actualizar-datos/advance/route.ts", "utf8");
const hook = readFileSync("src/app/orquestador/use-composite-operations-run.ts", "utf8");
const control = readFileSync("src/app/orquestador/actualizar-datos-operacionales-control.tsx", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");

test("A. lock transaccional usa clave estable del composite kind real", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('actualizar_datos_operacionales_last_month', 0\)\)/);
  assert.doesNotMatch(migration, /localStorage|temporary table|locked\s*=/i);
});

test("B. corrida activa se deriva de jobs persistidos no terminales", () => {
  assert.match(migration, /from ops_orchestrator\.orchestrator_jobs as j/);
  assert.match(migration, /j\.composite_kind = 'actualizar_datos_operacionales_last_month'/);
  assert.match(migration, /j\.status not in \('succeeded', 'failed', 'cancelled'\)/);
});

test("C. start concurrente no crea segunda corrida", () => {
  assert.match(migration, /if exists \(select 1 from public\.orchestrator_get_active_operational_update_jobs\(\)\) then/);
  assert.match(migration, /false,\s*true,\s*active\.id/s);
  assert.match(startRoute, /started\.data\.existing && !started\.data\.created/);
  assert.match(startRoute, /code: "operational_update_already_running"/);
  assert.match(startRoute, /activeRunId: runId/);
});

test("D. solo un paso 1 se crea por RPC existente de composite steps", () => {
  assert.match(migration, /public\.orchestrator_create_composite_job_step/);
  assert.match(migration, /p_sequence_index smallint/);
  assert.match(migration, /p_sequence_index := 1::smallint/);
  assert.match(migration, /p_sequence_total := 3::smallint/);
  assert.doesNotMatch(migration, /insert into ops_orchestrator\.orchestrator_jobs/i);
});

test("E. advance duplicado es no-op seguro por run y sequence", () => {
  assert.match(migration, /j\.composite_run_id = p_composite_run_id/);
  assert.match(migration, /j\.sequence_index = p_sequence_index/);
  assert.match(migration, /false,\s*true,\s*j\.id/s);
  assert.match(advanceRoute, /createOperationalUpdateStepIfMissing/);
  assert.match(advanceRoute, /status: created\.data\.created \? 201 : 200/);
});

test("F. endpoint active reconstruye sin exponer payloads", () => {
  assert.match(activeRoute, /findActiveOperationalUpdateRunJobs/);
  assert.match(activeRoute, /active: false/);
  assert.match(activeRoute, /mapActualizarDatosRun\(active\.data, runId\)/);
  assert.doesNotMatch(activeRoute, /payload|result|stdout|stderr|command_preview/);
});

test("G. hook adopta active para PC B y F5", () => {
  assert.match(hook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos\/active"/);
  assert.match(hook, /setRun\(responseBody\.run\)/);
  assert.match(hook, /scheduleNext\(activeRun\.run_id, 1000\)/);
  assert.ok(hook.indexOf("loadActiveRun().then") < hook.indexOf("window.localStorage.getItem(storageKey)"));
});

test("H. hook adopta 409 sin reintentar start", () => {
  assert.match(hook, /response\.status === 409/);
  assert.match(hook, /operational_update_already_running/);
  assert.match(hook, /scheduleNext\(responseBody\.activeRunId, 1000\)/);
});

test("I. terminal libera seguimiento cliente", () => {
  assert.match(hook, /terminalStatuses = new Set\(\["succeeded", "failed", "cancelled"\]\)/);
  assert.match(hook, /clearStoredRun\("terminal_run"\)/);
  assert.match(hook, /clearTimer\(\)/);
});

test("J. UI bloquea boton durante corrida activa", () => {
  assert.match(control, /const canStart = !isStarting && !run/);
  assert.match(control, /Actualizacion en curso/);
  assert.match(control, /disabled=\{!canStart\}/);
});

test("K. helpers server-side llaman solo RPCs de orquestador", () => {
  assert.match(supabaseAdmin, /orchestrator_start_operational_update/);
  assert.match(supabaseAdmin, /orchestrator_get_active_operational_update_jobs/);
  assert.match(supabaseAdmin, /orchestrator_create_operational_update_step_if_missing/);
});

test("L. no toca worker agentes n8n recuperacion", () => {
  const changedScope = [
    "src/app/api/orquestador/operaciones/actualizar-datos/advance/route.ts",
    "src/app/api/orquestador/operaciones/actualizar-datos/route.ts",
    "src/app/api/orquestador/operaciones/actualizar-datos/active/route.ts",
    "src/app/orquestador/actualizar-datos-operacionales-control.tsx",
    "src/app/orquestador/use-composite-operations-run.ts",
    "src/lib/orquestador/supabase-admin.ts",
    "supabase/migrations/20260810120000_lock_operational_update_runs.sql",
  ].join("\n");

  assert.doesNotMatch(changedScope, /src\/app\/recuperacion|src\/app\/api\/recuperacion|worker|agent|n8n/i);
});
