import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const control = readFileSync("src/app/orquestador/actualizar-datos-operacionales-control.tsx", "utf8");
const hook = readFileSync("src/app/orquestador/use-composite-operations-run.ts", "utf8");
const route = readFileSync("src/app/api/orquestador/operaciones/actualizar-datos/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260810120000_lock_operational_update_runs.sql", "utf8");

const confirmHandler = control.slice(control.indexOf("async function confirmRun"), control.indexOf("function openConfirmation"));
const startHandler = hook.slice(hook.indexOf("const startRun = useCallback"), hook.indexOf("return {", hook.indexOf("const startRun = useCallback")));
const initialRpc = migration.slice(migration.indexOf("create or replace function public.orchestrator_start_operational_update"), migration.indexOf("create or replace function public.orchestrator_create_operational_update_step_if_missing"));

assert.match(control, /onClick=\{confirmRun\}/, "Confirm must invoke its event handler directly");
assert.match(confirmHandler, /const started = await startRun\(\)/, "the click handler must start creation without an effect");
assert.match(startHandler, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos"[\s\S]*method: "POST"/, "startRun must issue the POST directly");
assert.doesNotMatch(startHandler, /useEffect|setTimeout|setInterval|requestAnimationFrame|startTransition|visibilityState|document\.hidden|localStorage\.getItem/, "creation must not wait for rendering, timers, visibility or stored state");
assert.match(route, /const started = await startOperationalUpdateRun\(admin\.user\.id\)/, "the POST must invoke server-side creation directly");
assert.match(admin, /orchestrator_start_operational_update/, "server-side creation must use the atomic RPC");
assert.match(initialRpc, /orchestrator_create_composite_job_step[\s\S]*p_sequence_index := 1::smallint/, "the initial RPC must create step one immediately");
assert.match(hook, /document\.visibilityState !== "visible"[\s\S]*scheduleNext/, "visibility throttling must remain confined to follow-up polling");
assert.ok(startHandler.indexOf('fetch("/api/orquestador/operaciones/actualizar-datos"') < startHandler.indexOf("scheduleNext(responseBody.run.run_id"), "creation must precede polling setup");

console.log("orquestador-immediate-job-creation: 9/9 OK");
