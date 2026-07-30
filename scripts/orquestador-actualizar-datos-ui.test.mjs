import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const pagePath = "src/app/orquestador/page.tsx";
const controlCenterPath = "src/app/orquestador/orchestrator-control-center.tsx";
const controlPath = "src/app/orquestador/actualizar-datos-operacionales-control.tsx";
const hookPath = "src/app/orquestador/use-composite-operations-run.ts";
const viewerPath = "src/app/orquestador/composite-run-viewer.tsx";

const page = readFileSync(pagePath, "utf8");
const controlCenter = readFileSync(controlCenterPath, "utf8");
const control = readFileSync(controlPath, "utf8");
const hook = readFileSync(hookPath, "utf8");
const viewer = readFileSync(viewerPath, "utf8");
const clientSources = [control, hook].join("\n");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
const realCompositeRunId = "498a3a70-dbb0-4999-bab6-d85bc9eb07c4";

function getUuidPatternFromHook() {
  const match = hook.match(/const uuidPattern = (\/.+\/[a-z]*);/);
  assert.ok(match);
  return Function(`"use strict"; return ${match[1]};`)();
}

function normalizeRunIdLikeHook(value) {
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return getUuidPatternFromHook().test(unquoted) ? unquoted : null;
}

test("A. control principal existe", () => {
  assert.equal(existsSync(controlPath), true);
  assert.match(control, /export function ActualizarDatosOperacionalesControl/);
});

test("B. hook dedicado existe", () => {
  assert.equal(existsSync(hookPath), true);
  assert.match(hook, /export function useCompositeOperationsRun/);
});

test("C. centro de control integra el control", () => {
  assert.match(page, /OrchestratorControlCenter/);
  assert.match(controlCenter, /ActualizarDatosOperacionalesControl/);
  assert.match(controlCenter, /\.\/actualizar-datos-operacionales-control/);
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
  assert.match(hook, /function isValidUuid\(value: string\)/);
  assert.match(hook, /!isValidUuid\(runId\)/);
});

test("N1. UUID real del run devuelve valido", () => {
  assert.equal(getUuidPatternFromHook().test(realCompositeRunId), true);
});

test("N2. dos llamadas consecutivas a la validacion devuelven true", () => {
  const pattern = getUuidPatternFromHook();
  assert.equal(pattern.test(realCompositeRunId), true);
  assert.equal(pattern.test(realCompositeRunId), true);
});

test("N3. UUID con espacios exteriores devuelve valido", () => {
  assert.equal(normalizeRunIdLikeHook(`  ${realCompositeRunId}  `), realCompositeRunId);
});

test("N4. UUID con comillas exteriores devuelve valido", () => {
  assert.equal(normalizeRunIdLikeHook(`"${realCompositeRunId}"`), realCompositeRunId);
  assert.equal(normalizeRunIdLikeHook(`'${realCompositeRunId}'`), realCompositeRunId);
});

test("N5. UUID realmente invalido devuelve false", () => {
  assert.equal(getUuidPatternFromHook().test("498a3a70-dbb0-9999-zab6-d85bc9eb07c4"), false);
});

test("N6. uuidPattern no usa flags global ni sticky", () => {
  const pattern = getUuidPatternFromHook();
  assert.equal(pattern.global, false);
  assert.equal(pattern.sticky, false);
});

test("O. persiste solo run_id", () => {
  assert.match(hook, /orquestador:actualizar-datos:last-month:run-id:v1/);
  assert.match(hook, /window\.localStorage\.setItem\(storageKey, runId\)/);
  assert.doesNotMatch(hook, /localStorage\.setItem\(storageKey, JSON\.stringify/);
});

test("P. recupera tras recarga", () => {
  assert.match(hook, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(hook, /normalizeStoredRunId\(storedRunId\)/);
  assert.match(hook, /loadRun\(normalizedStoredRunId, \{ allowNotFoundReset: true \}\)/);
});

test("P2. montaje con UUID real inicia GET antes de cualquier clearStoredRun", () => {
  assert.match(hook, /function normalizeStoredRunId\(value: string\)/);
  assert.match(hook, /const normalizedStoredRunId = storedRunId \? normalizeStoredRunId\(storedRunId\) : null/);
  assert.ok(hook.indexOf("if (normalizedStoredRunId) {") < hook.indexOf("} else if (storedRunId) {"));
  assert.ok(hook.indexOf("loadRun(normalizedStoredRunId, { allowNotFoundReset: true })") < hook.indexOf("} else if (storedRunId) {"));
  assert.ok(hook.indexOf("loadRun(normalizedStoredRunId, { allowNotFoundReset: true })") < hook.indexOf('clearStoredRun("invalid_stored_run_id")', hook.indexOf("} else if (storedRunId) {")));
});

test("P3. GET 200 waiting conserva storage asigna run y permite advance", () => {
  assert.match(hook, /runStatuses = new Set\(\["ready", "running", "waiting", "succeeded", "failed", "cancelled"\]\)/);
  assert.match(hook, /isCompositeRunViewModel\(responseBody\.run\)/);
  assert.ok(hook.indexOf("persistRunId(responseBody.run.run_id)") < hook.indexOf("setRun(responseBody.run)"));
  assert.match(hook, /setRun\(responseBody\.run\)/);
  assert.match(control, /run \? <CompositeRunViewer/);
  assert.match(hook, /if \(isTerminalRun\(nextRun\)\) \{\s*return;\s*\}\s*await advanceRun\(nextRun\.run_id\)/s);
});
test("P4. cleanup de Strict Mode solo aborta y conserva storage", () => {
  const cleanupMatch = hook.match(/return \(\) => \{\s*isMountedRef\.current = false;\s*stopRequests\("effect_cleanup"\);\s*recoveryStartedRef\.current = false;\s*\};/);
  assert.ok(cleanupMatch);
  assert.doesNotMatch(cleanupMatch[0], /clearStoredRun|localStorage\.removeItem|setRun\(null\)|setStatus\("idle"\)/);
});

test("P5. GET abortado no borra localStorage", () => {
  const abortIndex = hook.indexOf('error.name === "AbortError"');
  assert.ok(abortIndex >= 0);
  const abortBlock = hook.slice(abortIndex, abortIndex + 260);
  assert.doesNotMatch(abortBlock, /clearStoredRun|localStorage\.removeItem|setRun\(null\)|setStatus\("idle"\)/);
});

test("P6. recuperacion GET 200 waiting conserva run_id y habilita avance", () => {
  assert.ok(hook.indexOf("persistRunId(responseBody.run.run_id)") < hook.indexOf("setRun(responseBody.run)"));
  assert.ok(hook.indexOf("setRun(responseBody.run)") < hook.indexOf("return responseBody.run"));
  assert.match(hook, /await advanceRun\(nextRun\.run_id\)/);
});

test("P7. GET 404 confirmado es la unica limpieza automatica de recuperacion", () => {
  assert.match(hook, /response\.status === 404 && options\.allowNotFoundReset/);
  assert.match(hook, /clearStoredRun\("recovery_404"\)/);
});

test("P8. cerrar resultado elimina localStorage de forma explicita", () => {
  assert.match(control, /Cerrar resultado/);
  assert.match(control, /onClick=\{clearRun\}/);
  assert.match(hook, /clearStoredRun\("user_close_result"\)/);
});

test("Q. 404 de recuperacion limpia run guardado", () => {
  assert.match(hook, /response\.status === 404 && options\.allowNotFoundReset/);
  assert.match(hook, /clearStoredRun\("recovery_404"\)/);
});

test("Q2. 404 durante polling vivo reintenta y conserva run_id", () => {
  assert.match(hook, /if \(response\.status === 404\) \{/);
  assert.match(hook, /shouldRetryRef\.current = true/);
  assert.match(hook, /retryDelayRef\.current = Math\.min\(retryDelayRef\.current \* 2, 10000\)/);
  assert.ok(hook.indexOf("response.status === 404 && options.allowNotFoundReset") < hook.indexOf("if (response.status === 404) {"));
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
  assert.match(hook, /stopRequests\("effect_cleanup"\)/);
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
  assert.match(hook, /clearStoredRun\("user_close_result"\)/);
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
test("AE2. no conserva logs temporales de diagnostico", () => {
  assert.doesNotMatch(hook, /console\.|logDevelopmentLifecycle|GET iniciado|GET status|GET abortado|stored run encontrado|advance iniciado/);
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
