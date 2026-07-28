import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const routePath = "src/app/api/orquestador/banco-packs/actualizar-packs/route.ts";
const controlPath = "src/app/orquestador/banco-packs-update-control.tsx";
const guardPath = "src/lib/orquestador/banco-packs-actualizar-packs.ts";

const route = readFileSync(routePath, "utf8");
const control = readFileSync(controlPath, "utf8");
const guard = readFileSync(guardPath, "utf8");
const page = readFileSync("src/app/orquestador/page.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/auth.ts", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const types = readFileSync("src/lib/orquestador/types.ts", "utf8");
const reservasRoute = readFileSync("src/app/api/orquestador/banco-reservas/last-week/route.ts", "utf8");
const reservasControl = readFileSync("src/app/orquestador/banco-reservas-last-week-control.tsx", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function assertNoUnsafeResponseFields(source) {
  assert.doesNotMatch(source, /stdout|stderr|command_preview|metadata|result:\s*job\.result|payload:\s*job|payload:\s*data|payload:\s*result/);
}

test("A. endpoint dedicado existe", () => {
  assert.equal(existsSync(routePath), true);
  assert.match(route, /export async function POST/);
});

test("B. job type fijo correcto", () => {
  assert.match(guard, /BANCO_PACKS_UPDATE_JOB_TYPE = "banco_packs_actualizar_sin_consumos"/);
  assert.match(supabaseAdmin, /p_job_type: BANCO_PACKS_UPDATE_JOB_TYPE/);
});

test("C. payload server-side exacto", () => {
  assert.match(guard, /BANCO_PACKS_UPDATE_ACTION = "actualizar-packs"/);
  assert.match(supabaseAdmin, /p_payload: \{ action: BANCO_PACKS_UPDATE_ACTION \}/);
});

test("D. requested_source fijo", () => {
  assert.match(guard, /BANCO_PACKS_REQUESTED_SOURCE = "web_orchestrator_banco_packs_actualizar_packs"/);
  assert.match(supabaseAdmin, /p_requested_source: BANCO_PACKS_REQUESTED_SOURCE/);
});

test("E. target worker fijo", () => {
  assert.match(guard, /BANCO_PACKS_TARGET_WORKER_ID = "pc_operaciones_01"/);
  assert.match(supabaseAdmin, /p_target_worker_id: BANCO_PACKS_TARGET_WORKER_ID/);
});

test("F. priority fija", () => {
  assert.match(guard, /BANCO_PACKS_PRIORITY = 1/);
  assert.match(supabaseAdmin, /p_priority: BANCO_PACKS_PRIORITY/);
});

test("G. body cliente exacto confirm true", () => {
  assert.match(route, /keys\.length === 1 && keys\[0\] === "confirm"/);
  assert.match(route, /confirm === true/);
});

test("H. body vacio rechazado", () => {
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /body\.trim\(\)\.length === 0/);
});

test("I. confirm false rechazado", () => {
  assert.match(route, /confirm === true/);
  assert.doesNotMatch(route, /confirm == true/);
});

test("J. claves extra rechazadas", () => {
  assert.match(route, /keys\.length === 1/);
});

test("K. query params rechazados", () => {
  assert.match(route, /request\.nextUrl\.searchParams\.size > 0/);
  assert.match(route, /Esta accion no acepta parametros/);
});

test("L. action enviada por cliente rechazada", () => {
  assert.doesNotMatch(route, /payload\.action|body\.action/);
  assert.match(route, /hasExactConfirmation/);
});

test("M. job_type enviado por cliente rechazado", () => {
  assert.doesNotMatch(route, /payload\.job_type|body\.job_type|payload\.jobType|body\.jobType/);
});

test("N. admin activo requerido", () => {
  assert.match(route, /getActiveAdminUser/);
  assert.match(admin, /profile\.app_role !== "admin"/);
  assert.match(admin, /profile\.status !== "active"/);
  assert.match(route, /401/);
  assert.match(route, /403/);
});

test("O. readiness job type missing", () => {
  assert.match(guard, /job_type_missing/);
  assert.match(route, /job_type_missing/);
});

test("P. readiness job type disabled", () => {
  assert.match(guard, /job_type_disabled/);
  assert.match(route, /Banco de Packs esta deshabilitada/);
});

test("Q. worker missing", () => {
  assert.match(guard, /worker_missing/);
  assert.match(route, /BANCO_PACKS_TARGET_WORKER_ID/);
});

test("R. heartbeat antiguo", () => {
  assert.match(guard, /BANCO_PACKS_HEARTBEAT_MAX_AGE_MS = 120_000/);
  assert.match(guard, /isBancoPacksWorkerHeartbeatRecent/);
  assert.match(route, /worker no esta disponible/);
});

test("S. worker busy", () => {
  assert.match(guard, /input\.worker\.status !== "idle"/);
  assert.match(route, /worker esta ocupado/);
});

test("T. current_job_id presente", () => {
  assert.match(guard, /input\.worker\.locked_job_id/);
  assert.match(types, /locked_job_id: row\.current_job_id/);
});

test("U. cola activa", () => {
  assert.match(guard, /"queued"/);
  assert.match(guard, /"claimed"/);
  assert.match(guard, /"running"/);
  assert.match(route, /Existe otra operacion activa/);
});

test("V. readiness repetido antes de crear", () => {
  assert.match(route, /const firstCheck = await loadReadiness\(\)/);
  assert.match(route, /const secondCheck = await loadReadiness\(\)/);
  assert.ok(route.indexOf("const secondCheck") < route.indexOf("const { data, error } = await createBancoPacksUpdateJob"));
});

test("W. create job se invoca una sola vez en ruta", () => {
  const calls = [...route.matchAll(/await createBancoPacksUpdateJob\(/g)].length;
  assert.equal(calls, 1);
  assert.match(route, /const \{ data, error \} = await createBancoPacksUpdateJob\(admin\.user\.id\)/);
});

test("X. DTO no expone result crudo", () => {
  assert.match(types, /banco_packs_update_result/);
  assert.match(types, /safeBancoPacksUpdateResult/);
  assertNoUnsafeResponseFields(route);
});

test("Y. DTO no expone stdout stderr", () => {
  assert.doesNotMatch(types, /stdout|stderr/);
});

test("Z. DTO no expone command_preview", () => {
  assert.doesNotMatch(types, /command_preview/);
});

test("AA. UI envia solo confirm true", () => {
  assert.match(control, /body: JSON\.stringify\(\{ confirm: true \}\)/);
  assert.doesNotMatch(control, /JSON\.stringify\(\{[^}]+(?:action|job_type|target_worker_id|priority|requested_source|payload|command|args|path)/);
});

test("AB. UI esta integrado en page", () => {
  assert.match(page, /BancoPacksUpdateControl/);
  assert.match(page, /readinessCode=\{bancoPacksReadiness\.code\}/);
});

test("AC. UI bloquea doble clic", () => {
  assert.match(control, /if \(isSubmitting \|\| readinessCode !== "ready"\)/);
  assert.match(control, /disabled=\{!canSubmit\}/);
  assert.match(control, /disabled=\{isSubmitting\}/);
});

test("AD. UI hace polling por ID exacto", () => {
  assert.match(control, /job\.id === jobId/);
  assert.match(control, /pollJob\(payload\.job\.id/);
});

test("AE. UI valida job_type", () => {
  assert.match(control, /BANCO_PACKS_EXPECTED_JOB_TYPE = "banco_packs_actualizar_sin_consumos"/);
  assert.match(control, /job\.job_type === BANCO_PACKS_EXPECTED_JOB_TYPE/);
});

test("AF. UI se detiene en estados terminales", () => {
  assert.match(control, /terminalStatuses = new Set\(\["succeeded", "failed", "cancelled"\]\)/);
  assert.match(control, /terminalStatuses\.has\(nextJob\.status\)/);
});

test("AG. UI usa AbortController", () => {
  assert.match(control, /new AbortController\(\)/);
  assert.match(control, /abortControllerRef\.current\?\.abort\(\)/);
});

test("AH. UI pausa con pestana oculta", () => {
  assert.match(control, /document\.visibilityState/);
  assert.match(control, /visibilitychange/);
  assert.match(control, /waitUntilVisible/);
});

test("AI. Banco de Reservas no fue alterado", () => {
  assert.match(reservasRoute, /banco-reservas/);
  assert.match(reservasControl, /Banco de Reservas/);
  assert.doesNotMatch(diffNames, /^src\/app\/api\/orquestador\/banco-reservas\/last-week\/route\.ts$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
});

test("AJ. recuperacion no fue alterado", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations\/20260727120000_update_recovery/m);
});