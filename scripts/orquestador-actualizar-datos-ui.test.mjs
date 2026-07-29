import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const pagePath = "src/app/orquestador/page.tsx";
const controlPath = "src/app/orquestador/actualizar-datos-operacionales-control.tsx";
const hookPath = "src/app/orquestador/use-composite-operations-run.ts";
const viewerPath = "src/app/orquestador/composite-run-viewer.tsx";

const page = readFileSync(pagePath, "utf8");
const control = readFileSync(controlPath, "utf8");
const hook = readFileSync(hookPath, "utf8");
const viewer = readFileSync(viewerPath, "utf8");
const clientSources = [control, hook].join("\n");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

test("A. control principal existe", () => {
  assert.equal(existsSync(controlPath), true);
  assert.match(control, /export function ActualizarDatosOperacionalesControl/);
});

test("B. hook dedicado existe", () => {
  assert.equal(existsSync(hookPath), true);
  assert.match(hook, /export function useCompositeOperationsRun/);
});

test("C. pagina integra el control", () => {
  assert.match(page, /ActualizarDatosOperacionalesControl/);
  assert.match(page, /\.\/actualizar-datos-operacionales-control/);
});

test("D. usa CompositeRunViewer reusable", () => {
  assert.match(control, /CompositeRunViewer/);
  assert.match(control, /run=\{run\}/);
});

test("E. texto del flujo muestra las tres etapas", () => {
  assert.match(control, /Actualizar Reservas ultimo mes/);
  assert.match(control, /Actualizar Banco de Packs/);
  assert.match(control, /Actualizar metricas Dashboard ultimo mes/);
});

test("F. modal accesible de confirmacion", () => {
  assert.match(control, /role="dialog"/);
  assert.match(control, /aria-modal="true"/);
  assert.match(control, /aria-labelledby="actualizar-datos-title"/);
});

test("G. foco inicial razonable", () => {
  assert.match(control, /cancelButtonRef/);
  assert.match(control, /cancelButtonRef\.current\?\.focus\(\)/);
});

test("H. Escape cierra el modal solo si no esta iniciando", () => {
  assert.match(control, /event\.key === "Escape"/);
  assert.match(control, /&& !isBusy/);
});

test("I. click fuera respeta estado de inicio", () => {
  assert.match(control, /function closeBackdrop/);
  assert.match(control, /if \(!isBusy\)/);
});

test("J. botones se deshabilitan durante inicio", () => {
  assert.match(control, /disabled=\{isBusy\}/);
  assert.match(control, /disabled=\{!canStart\}/);
});

test("K. inicio envia solo confirm true", () => {
  assert.match(hook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos"/);
  assert.match(hook, /body: JSON\.stringify\(\{ confirm: true \}\)/);
});

test("L. advance envia solo run_id", () => {
  assert.match(hook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos\/advance"/);
  assert.match(hook, /body: JSON\.stringify\(\{ run_id: runId \}\)/);
});

test("M. cliente consulta estado por run_id", () => {
  assert.match(hook, /fetch\(`\/api\/orquestador\/operaciones\/actualizar-datos\/\$\{runId\}`/);
  assert.match(hook, /cache: "no-store"/);
});

test("N. valida UUID antes de consultar o avanzar", () => {
  assert.match(hook, /uuidPattern/);
  assert.match(hook, /!uuidPattern\.test\(runId\)/);
});

test("O. persiste solo run_id", () => {
  assert.match(hook, /orquestador:actualizar-datos:last-month:run-id:v1/);
  assert.match(hook, /window\.localStorage\.setItem\(storageKey, runId\)/);
  assert.doesNotMatch(hook, /localStorage\.setItem\(storageKey, JSON\.stringify/);
});

test("P. recupera tras recarga", () => {
  assert.match(hook, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(hook, /loadRun\(storedRunId, \{ allowNotFoundReset: true \}\)/);
});

test("Q. 404 limpia run guardado", () => {
  assert.match(hook, /response\.status === 404/);
  assert.match(hook, /clearStoredRun\(\)/);
});

test("R. polling cada dos o tres segundos", () => {
  assert.match(hook, /scheduleNext\(run\.run_id, 2500\)/);
});

test("S. polling inicial rapido tras crear o recuperar", () => {
  assert.match(hook, /scheduleNext\(responseBody\.run\.run_id, 1000\)/);
  assert.match(hook, /scheduleNext\(loadedRun\.run_id, 1000\)/);
});

test("T. evita requests superpuestos", () => {
  assert.match(hook, /isRefreshingRef\.current/);
  assert.match(hook, /isAdvancingRef\.current/);
});

test("U. usa AbortController", () => {
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /controller\.signal/);
  assert.match(hook, /\.abort\(\)/);
});

test("V. se detiene al desmontar", () => {
  assert.match(hook, /return \(\) => \{/);
  assert.match(hook, /stopRequests\(\)/);
});

test("W. se detiene en estados terminales", () => {
  assert.match(hook, /terminalStatuses = new Set\(\["succeeded", "failed", "cancelled"\]\)/);
  assert.match(hook, /isTerminalRun\(nextRun\)/);
});

test("X. pausa con pestana oculta", () => {
  assert.match(hook, /document\.visibilityState !== "visible"/);
});

test("Y. backoff simple en errores de red", () => {
  assert.match(hook, /retryDelayRef\.current = Math\.min\(retryDelayRef\.current \* 2, 10000\)/);
});

test("Z. no cierra modal si start falla", () => {
  assert.match(hook, /return false/);
  assert.match(hook, /return true/);
  assert.match(control, /const started = await startRun\(\)/);
  assert.match(control, /if \(started\)/);
});

test("AA. cerrar resultado solo limpia UI y localStorage", () => {
  assert.match(control, /Cerrar resultado/);
  assert.match(control, /onClick=\{clearRun\}/);
  assert.match(hook, /clearStoredRun\(\)/);
  assert.doesNotMatch(clientSources, /cancel.*fetch|method:\s*"DELETE"|method:\s*"PATCH"/i);
});

test("AB. previene doble inicio", () => {
  assert.match(control, /const canStart = !isStarting && !run/);
  assert.match(hook, /if \(isStarting \|\| \(run && !isTerminalRun\(run\)\)\)/);
});

test("AC. no envia stage ni parametros operativos desde cliente", () => {
  assert.doesNotMatch(clientSources, /\{\s*(stage|job_type|jobType|priority|requested_source|target_worker_id|targetWorkerId|source_key|host|port|database|sql|command|args)\s*:/);
});

test("AD. no recrea contratos de jobs en cliente", () => {
  assert.doesNotMatch(clientSources, /banco_reservas_actualizar|banco_packs_actualizar_sin_consumos|dashboard_actualizar_metricas|actualizar-packs|web_orchestrator_/);
});

test("AE. no usa Supabase ni secrets en cliente", () => {
  assert.doesNotMatch(clientSources, /SUPABASE_SERVICE_ROLE_KEY|createClient|\.rpc\(|supabase/i);
});

test("AF. no muestra payload ni result crudo", () => {
  assert.doesNotMatch(control + viewer, /\bpayload\b|row\.result|result:\s*row|metadata|stdout|stderr|command_preview/);
});

test("AG. estados failed y cancelled tienen etiqueta visible", () => {
  assert.match(control, /Fallido/);
  assert.match(control, /Cancelado/);
});

test("AH. status visible no depende solo del color", () => {
  assert.match(control, /statusLabel/);
  assert.match(control, /aria-live="polite"/);
});

test("AI. no altera controles individuales existentes", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/worker-health-check-button\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/source-connection-check-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-packs-update-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/dashboard-last-month-control\.tsx$/m);
});

test("AJ. no toca recuperacion", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations/m);
});
