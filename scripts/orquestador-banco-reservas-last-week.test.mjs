import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("src/app/api/orquestador/banco-reservas/last-week/route.ts", "utf8");
const control = readFileSync("src/app/orquestador/banco-reservas-last-week-control.tsx", "utf8");
const page = readFileSync("src/app/orquestador/page.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/auth.ts", "utf8");
const guard = readFileSync("src/lib/orquestador/banco-reservas-last-week.ts", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const types = readFileSync("src/lib/orquestador/types.ts", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function assertNoUnsafeResponseFields(source) {
  assert.doesNotMatch(source, /stdout|stderr|command_preview|payload: job|payload: data|payload: result/);
  assert.doesNotMatch(source, /result:\s*job\.result|metadata/);
}

test("A. usuario no admin recibe 403", () => {
  assert.match(route, /getActiveAdminUser/);
  assert.match(admin, /profile\.app_role !== "admin"/);
  assert.match(admin, /profile\.status !== "active"/);
  assert.match(route, /No autorizado/);
  assert.match(route, /403/);
});

test("B. query params son rechazados", () => {
  assert.match(route, /request\.nextUrl\.searchParams\.size > 0/);
  assert.match(route, /Esta accion no acepta parametros/);
});

test("C. body vacio es rechazado", () => {
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /body\.trim\(\)\.length === 0/);
});

test("D. confirm=false es rechazado", () => {
  assert.match(route, /confirm\?: unknown/);
  assert.match(route, /confirm === true/);
});

test("E. confirm string es rechazado", () => {
  assert.match(route, /confirm === true/);
  assert.doesNotMatch(route, /confirm == true/);
});

test("F. body con modo es rechazado", () => {
  assert.match(route, /keys\.length === 1/);
  assert.doesNotMatch(route, /payload\.modo|body\.modo/);
});

test("G. body con clave extra es rechazado", () => {
  assert.match(route, /keys\.length === 1 && keys\[0\] === "confirm"/);
});

test("H. job type inexistente no crea", () => {
  assert.match(route, /job_type_missing/);
  assert.ok(route.indexOf("const firstCheck") < route.indexOf("const { data, error } = await createBancoReservasLastWeekJob"));
});

test("I. job type disabled no crea", () => {
  assert.match(guard, /job_type_disabled/);
  assert.match(route, /La actualizacion del Banco de Reservas esta deshabilitada/);
});

test("J. worker inexistente no crea", () => {
  assert.match(guard, /worker_missing/);
  assert.match(route, /BANCO_RESERVAS_TARGET_WORKER_ID/);
});

test("K. worker status busy no crea", () => {
  assert.match(guard, /input\.worker\.status !== "idle"/);
  assert.match(route, /El worker esta ocupado/);
});

test("L. worker current_job_id no null no crea", () => {
  assert.match(guard, /input\.worker\.locked_job_id/);
  assert.match(types, /locked_job_id: row\.current_job_id/);
});

test("M. worker heartbeat stale no crea", () => {
  assert.match(guard, /BANCO_RESERVAS_HEARTBEAT_MAX_AGE_MS = 120_000/);
  assert.match(guard, /isWorkerHeartbeatRecent/);
  assert.match(route, /El worker no esta disponible/);
});

test("N. cola global queued no crea", () => {
  assert.match(guard, /"queued"/);
  assert.match(route, /Existe otra operacion activa/);
});

test("O. cola global claimed no crea", () => {
  assert.match(guard, /"claimed"/);
  assert.match(page, /"claimed"/);
});

test("P. cola global running no crea", () => {
  assert.match(guard, /"running"/);
});

test("Q. segunda comprobacion detecta job activo antes de crear", () => {
  assert.match(route, /const firstCheck = await loadReadiness\(\)/);
  assert.match(route, /const secondCheck = await loadReadiness\(\)/);
  assert.ok(route.indexOf("const secondCheck") < route.indexOf("const { data, error } = await createBancoReservasLastWeekJob"));
});

test("R. estado limpio crea exactamente un job", () => {
  const calls = [...supabaseAdmin.matchAll(/export async function createBancoReservasLastWeekJob/g)].length;
  assert.equal(calls, 1);
  assert.match(supabaseAdmin, /createBancoReservasLastWeekJob/);
});

test("S. RPC recibe contrato fijo exacto", () => {
  assert.match(guard, /BANCO_RESERVAS_LAST_WEEK_JOB_TYPE = "banco_reservas_actualizar"/);
  assert.match(guard, /BANCO_RESERVAS_LAST_WEEK_MODE = "last-week"/);
  assert.match(guard, /BANCO_RESERVAS_REQUESTED_SOURCE = "web_orchestrator_last_week"/);
  assert.match(guard, /BANCO_RESERVAS_TARGET_WORKER_ID = "pc_operaciones_01"/);
  assert.match(guard, /BANCO_RESERVAS_PRIORITY = 1/);
  assert.match(supabaseAdmin, /p_job_type: BANCO_RESERVAS_LAST_WEEK_JOB_TYPE/);
  assert.match(supabaseAdmin, /p_payload: \{ modo: BANCO_RESERVAS_LAST_WEEK_MODE \}/);
  assert.match(supabaseAdmin, /p_requested_source: BANCO_RESERVAS_REQUESTED_SOURCE/);
  assert.match(supabaseAdmin, /p_target_worker_id: BANCO_RESERVAS_TARGET_WORKER_ID/);
  assert.match(supabaseAdmin, /p_priority: BANCO_RESERVAS_PRIORITY/);
});

test("T. no usa valores recibidos desde el cliente", () => {
  assert.doesNotMatch(route, /body\.(modo|payload|action|agent|command|args|target_worker_id|priority|requested_source|rebuild)/);
  assert.doesNotMatch(route, /payload\.(modo|payload|action|agent|command|args|target_worker_id|priority|requested_source|rebuild)/);
});

test("U. respuesta segura no contiene payload ni salidas crudas", () => {
  assert.match(route, /id: job\.id/);
  assert.match(route, /job_type: job\.job_type/);
  assert.match(route, /status: job\.status/);
  assertNoUnsafeResponseFields(route);
  assert.match(types, /banco_reservas_last_week_result/);
});

test("V. UI envia unicamente confirm true", () => {
  assert.match(control, /body: JSON\.stringify\(\{ confirm: true \}\)/);
  assert.doesNotMatch(control, /JSON\.stringify\(\{[^}]+(?:modo|target_worker_id|priority|requested_source|rebuild)/);
});

test("W. UI impide doble clic", () => {
  assert.match(control, /if \(isSubmitting \|\| readinessCode !== "ready"\)/);
  assert.match(control, /disabled=\{!canSubmit\}/);
  assert.match(control, /disabled=\{isSubmitting\}/);
});

test("X. UI muestra confirmacion explicita de ejecucion real", () => {
  assert.match(control, /Confirmar ejecucion real/);
  assert.match(control, /Ejecucion real/);
  assert.match(control, /No ejecuta rebuild/);
});

test("Y. polling se detiene en succeeded", () => {
  assert.match(control, /terminalStatuses = new Set\(\["succeeded", "failed", "cancelled"\]\)/);
  assert.match(control, /terminalStatuses\.has\(nextJob\.status\)/);
});

test("Z. polling se detiene en failed", () => {
  assert.match(control, /"failed"/);
  assert.match(control, /terminalStatuses\.has\(nextJob\.status\)/);
});

test("AA. no se toca recuperacion", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations\/20260727120000_update_recovery/m);
});