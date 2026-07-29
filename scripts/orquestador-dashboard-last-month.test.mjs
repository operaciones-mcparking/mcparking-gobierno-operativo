import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const routePath = "src/app/api/orquestador/dashboard/last-month/route.ts";
const controlPath = "src/app/orquestador/dashboard-last-month-control.tsx";
const guardPath = "src/lib/orquestador/dashboard-last-month.ts";

const route = readFileSync(routePath, "utf8");
const control = readFileSync(controlPath, "utf8");
const guard = readFileSync(guardPath, "utf8");
const page = readFileSync("src/app/orquestador/page.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/auth.ts", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const types = readFileSync("src/lib/orquestador/types.ts", "utf8");
const reservasRoute = readFileSync("src/app/api/orquestador/banco-reservas/last-week/route.ts", "utf8");
const reservasControl = readFileSync("src/app/orquestador/banco-reservas-last-week-control.tsx", "utf8");
const packsRoute = readFileSync("src/app/api/orquestador/banco-packs/actualizar-packs/route.ts", "utf8");
const packsControl = readFileSync("src/app/orquestador/banco-packs-update-control.tsx", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function assertNoUnsafeResponseFields(source) {
  assert.doesNotMatch(source, /stdout|stderr|command_preview|metadata|result:\s*job\.result|payload:\s*job|payload:\s*data|payload:\s*result/);
}

test("A. endpoint dedicado existe", () => {
  assert.equal(existsSync(routePath), true);
  assert.match(route, /export async function POST/);
});

test("B. job type fijo", () => {
  assert.match(guard, /DASHBOARD_LAST_MONTH_JOB_TYPE = "dashboard_actualizar_metricas"/);
  assert.match(supabaseAdmin, /p_job_type: DASHBOARD_LAST_MONTH_JOB_TYPE/);
});

test("C. payload exacto con agent action periodo", () => {
  assert.match(guard, /DASHBOARD_LAST_MONTH_AGENT = "dashboard"/);
  assert.match(guard, /DASHBOARD_LAST_MONTH_ACTION = "actualizar-metricas"/);
  assert.match(guard, /DASHBOARD_LAST_MONTH_PERIOD = "last-month"/);
  assert.match(supabaseAdmin, /agent: DASHBOARD_LAST_MONTH_AGENT/);
  assert.match(supabaseAdmin, /action: DASHBOARD_LAST_MONTH_ACTION/);
  assert.match(supabaseAdmin, /periodo: DASHBOARD_LAST_MONTH_PERIOD/);
});

test("D. requested_source fijo", () => {
  assert.match(guard, /DASHBOARD_LAST_MONTH_REQUESTED_SOURCE = "web_orchestrator_dashboard_last_month"/);
  assert.match(supabaseAdmin, /p_requested_source: DASHBOARD_LAST_MONTH_REQUESTED_SOURCE/);
});

test("E. target fijo", () => {
  assert.match(guard, /DASHBOARD_TARGET_WORKER_ID = "pc_operaciones_01"/);
  assert.match(supabaseAdmin, /p_target_worker_id: DASHBOARD_TARGET_WORKER_ID/);
});

test("F. priority fija", () => {
  assert.match(guard, /DASHBOARD_LAST_MONTH_PRIORITY = 1/);
  assert.match(supabaseAdmin, /p_priority: DASHBOARD_LAST_MONTH_PRIORITY/);
});

test("G. body exacto confirm true", () => {
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

test("L. agent cliente rechazado", () => {
  assert.doesNotMatch(route, /payload\.agent|body\.agent/);
  assert.match(route, /hasExactConfirmation/);
});

test("M. action cliente rechazada", () => {
  assert.doesNotMatch(route, /payload\.action|body\.action/);
});

test("N. periodo cliente rechazado", () => {
  assert.doesNotMatch(route, /payload\.periodo|body\.periodo|payload\.period|body\.period/);
});

test("O. job_type cliente rechazado", () => {
  assert.doesNotMatch(route, /payload\.job_type|body\.job_type|payload\.jobType|body\.jobType/);
});

test("P. admin requerido", () => {
  assert.match(route, /getActiveAdminUser/);
  assert.match(admin, /profile\.app_role !== "admin"/);
  assert.match(admin, /profile\.status !== "active"/);
  assert.match(route, /401/);
  assert.match(route, /403/);
});

test("Q. job type missing", () => {
  assert.match(guard, /job_type_missing/);
  assert.match(route, /job_type_missing/);
});

test("R. job type disabled", () => {
  assert.match(guard, /job_type_disabled/);
  assert.match(route, /dashboard esta deshabilitada/);
});

test("S. worker missing", () => {
  assert.match(guard, /worker_missing/);
  assert.match(route, /DASHBOARD_TARGET_WORKER_ID/);
});

test("T. heartbeat antiguo", () => {
  assert.match(guard, /DASHBOARD_HEARTBEAT_MAX_AGE_MS = 120_000/);
  assert.match(guard, /isDashboardWorkerHeartbeatRecent/);
  assert.match(route, /worker no esta disponible/);
});

test("U. worker busy", () => {
  assert.match(guard, /input\.worker\.status !== "idle"/);
  assert.match(route, /worker esta ocupado/);
});

test("V. current_job_id presente", () => {
  assert.match(guard, /input\.worker\.locked_job_id/);
  assert.match(types, /locked_job_id: row\.current_job_id/);
});

test("W. cola activa", () => {
  assert.match(guard, /"queued"/);
  assert.match(guard, /"claimed"/);
  assert.match(guard, /"running"/);
  assert.match(route, /Existe otra operacion activa/);
});

test("X. segunda comprobacion", () => {
  assert.match(route, /const firstCheck = await loadReadiness\(\)/);
  assert.match(route, /const secondCheck = await loadReadiness\(\)/);
  assert.ok(route.indexOf("const secondCheck") < route.indexOf("const { data, error } = await createDashboardLastMonthJob"));
});

test("Y. create job una sola vez", () => {
  const calls = [...route.matchAll(/await createDashboardLastMonthJob\(/g)].length;
  assert.equal(calls, 1);
  assert.match(route, /const \{ data, error \} = await createDashboardLastMonthJob\(admin\.user\.id\)/);
});

test("Z. DTO no expone result crudo", () => {
  assert.match(types, /dashboard_metrics_result/);
  assert.match(types, /safeDashboardMetricsResult/);
  assertNoUnsafeResponseFields(route);
});

test("AA. DTO no expone stdout stderr", () => {
  assert.doesNotMatch(types, /stdout|stderr/);
  assert.doesNotMatch(control, /stdout|stderr/);
});

test("AB. DTO no expone command_preview", () => {
  assert.doesNotMatch(types, /command_preview/);
  assert.doesNotMatch(control, /command_preview/);
});

test("AC. UI envia solo confirm true", () => {
  assert.match(control, /body: JSON\.stringify\(\{ confirm: true \}\)/);
  assert.doesNotMatch(control, /JSON\.stringify\(\{[^}]+(?:agent|action|periodo|job_type|target_worker_id|priority|requested_source|payload|command|args|path)/);
});

test("AD. UI bloquea doble clic", () => {
  assert.match(control, /if \(isSubmitting \|\| readinessCode !== "ready"\)/);
  assert.match(control, /disabled=\{!canSubmit\}/);
  assert.match(control, /disabled=\{isSubmitting\}/);
});

test("AE. polling por ID exacto", () => {
  assert.match(control, /job\.id === jobId/);
  assert.match(control, /pollJob\(payload\.job\.id/);
});

test("AF. valida job_type", () => {
  assert.match(control, /DASHBOARD_EXPECTED_JOB_TYPE = "dashboard_actualizar_metricas"/);
  assert.match(control, /job\.job_type === DASHBOARD_EXPECTED_JOB_TYPE/);
});

test("AG. termina en estados terminales", () => {
  assert.match(control, /terminalStatuses = new Set\(\["succeeded", "failed", "cancelled"\]\)/);
  assert.match(control, /terminalStatuses\.has\(nextJob\.status\)/);
});

test("AH. usa AbortController", () => {
  assert.match(control, /new AbortController\(\)/);
  assert.match(control, /abortControllerRef\.current\?\.abort\(\)/);
});

test("AI. pausa con pestana oculta", () => {
  assert.match(control, /document\.visibilityState/);
  assert.match(control, /visibilitychange/);
  assert.match(control, /waitUntilVisible/);
});

test("AJ. no ejecuta Reservas", () => {
  assert.doesNotMatch(route, /banco_reservas_actualizar|createBancoReservasLastWeekJob|BANCO_RESERVAS/);
  assert.match(reservasRoute, /banco-reservas/);
});

test("AK. no ejecuta Packs", () => {
  assert.doesNotMatch(route, /banco_packs_actualizar|createBancoPacksUpdateJob|BANCO_PACKS/);
  assert.match(packsRoute, /banco-packs/);
});

test("AL. controles existentes no alterados", () => {
  assert.match(reservasControl, /Banco de Reservas/);
  assert.match(packsControl, /Banco de Packs/);
  assert.doesNotMatch(diffNames, /^src\/app\/api\/orquestador\/banco-reservas\/last-week\/route\.ts$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/api\/orquestador\/banco-packs\/actualizar-packs\/route\.ts$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-packs-update-control\.tsx$/m);
});

test("AM. recuperacion no alterado", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations\/20260727120000_update_recovery/m);
});