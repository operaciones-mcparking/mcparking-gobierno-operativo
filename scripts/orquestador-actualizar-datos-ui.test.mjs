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
  assert.match(control, /Banco de Reservas/);
  assert.match(control, /Banco de Packs/);
  assert.match(control, /Metricas del Dashboard/);
  assert.doesNotMatch(control, /Actualizar Reservas ultimo mes|Actualizar metricas Dashboard ultimo mes/);
});

test("F. modal accesible de confirmacion", () => {
  assert.match(control, /role="dialog"/);
  assert.match(control, /aria-modal="true"/);
  assert.match(control, /aria-labelledby="actualizar-datos-title"/);
  assert.match(control, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(control, /overflow-x-hidden/);
  assert.match(control, /overflow-y-auto/);
  assert.match(control, /min-w-0/);
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
  assert.match(control, /compact=\{useOverlay\}/);
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


test("AG2. overlay compacto evita overflow y datos tecnicos principales", () => {
  assert.match(control, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(control, /overflow-x-hidden/);
  assert.match(control, /overflow-y-auto/);
  assert.match(control, /className="mt-4 max-h-28 overflow-y-auto break-words/);
  assert.match(control, /w-full[\s\S]*sm:w-fit/);
  assert.match(viewer, /function readableStepLabel/);
  assert.match(viewer, /Banco de Reservas/);
  assert.match(viewer, /Banco de Packs/);
  assert.match(viewer, /Metricas del Dashboard/);
  assert.match(viewer, /!compact \? \(/);
  assert.match(viewer, /<dl className="mt-3 grid grid-cols-2/);
  assert.match(viewer, /break-words/);
  assert.match(viewer, /max-h-28 overflow-y-auto break-words/);
});

test("AG3. duracion usa formato humano sin segundos compactos", () => {
  assert.match(viewer, /export function formatDurationHuman\(value: number \| null \| undefined\)/);
  assert.match(viewer, /return "Duracion no disponible"/);
  assert.match(viewer, /return `\$\{seconds\} s`/);
  assert.match(viewer, /return `\$\{minutes\} min`/);
  assert.match(viewer, /return `\$\{minutes\} min \$\{seconds\} s`/);
  assert.match(viewer, /Duracion \{formatDurationHuman\(run\.duration_seconds\)\}/);
  assert.match(viewer, /\{formatDurationHuman\(step\.duration_seconds\)\}/);
  assert.doesNotMatch(viewer, /`\$\{value\}s`|Duracion \{formatDuration\(/);

  const formatDurationHumanForTest = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Duracion no disponible";
    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds} s`;
    if (seconds === 0) return `${minutes} min`;
    return `${minutes} min ${seconds} s`;
  };

  assert.equal(formatDurationHumanForTest(42), "42 s");
  assert.equal(formatDurationHumanForTest(60), "1 min");
  assert.equal(formatDurationHumanForTest(61), "1 min 1 s");
  assert.equal(formatDurationHumanForTest(120), "2 min");
  assert.equal(formatDurationHumanForTest(364), "6 min 4 s");
  assert.equal(formatDurationHumanForTest(null), "Duracion no disponible");
  assert.equal(formatDurationHumanForTest(Number.NaN), "Duracion no disponible");
});

test("AG4. exito final depende del refresh del Dashboard", () => {
  assert.match(control, /type RefreshStatus = "idle" \| "refreshing" \| "success" \| "failed"/);
  assert.match(control, /refreshingRunRef/);
  assert.match(control, /setRefreshStatus\("refreshing"\)/);
  assert.match(control, /Promise\.resolve\(onSucceededRef\.current\?\.\(\)\)/);
  assert.match(control, /setRefreshStatus\(result === false \? "failed" : "success"\)/);
  assert.match(control, /const showRefreshSuccess = run\?\.status === "succeeded" && refreshStatus === "success"/);
  assert.match(control, /showRefreshSuccess \? \(\s*<RefreshSuccessPanel \/>/);
  assert.match(control, /Actualizando indicadores del Dashboard/);
  assert.match(control, /Los procesos finalizaron correctamente, pero no fue posible actualizar los indicadores visibles/);
  assert.match(control, /const isRefreshingAfterSuccess = run\?\.status === "succeeded" && \(refreshStatus === "idle" \|\| refreshStatus === "refreshing"\)/);
  assert.match(control, /const canCloseOverlay = Boolean\(run && isTerminalRun\(run\) && !isRefreshingAfterSuccess\)/);
});

test("AG5. bloque verde final es sobrio y accesible", () => {
  assert.match(control, /function RefreshSuccessPanel/);
  assert.match(control, /role="status"/);
  assert.match(control, /aria-live="polite"/);
  assert.match(control, /bg-\[#f1fbf4\]/);
  assert.match(control, /border-\[#bfe7cb\]/);
  assert.match(control, /text-\[#22613b\]/);
  assert.match(control, /Actualizacion completada correctamente/);
  assert.match(control, /Todos los procesos finalizaron con exito/);
  assert.match(control, /Puedes cerrar esta ventana con tranquilidad/);
  assert.match(control, /aria-hidden="true"/);
  assert.match(control, /break-words/);
  assert.doesNotMatch(control, /confeti|corneta|ilustracion|window\.location\.reload/i);
});
test("AH. status visible no depende solo del color", () => {
  assert.match(control, /statusLabel/);
  assert.match(control, /aria-live="polite"/);
});


test("AH2. Centro de Control define secciones operacionales en orden", () => {
  for (const label of [
    "Estado operacional",
    "Actualizar datos operacionales",
    "Acciones individuales",
    "Herramientas de comprobacion",
    "Procesos recientes",
    "Diagnostico tecnico",
  ]) {
    assert.match(controlCenter, new RegExp(label));
  }

  const order = [
    "Estado operacional",
    "Actualizar datos operacionales",
    "Acciones individuales",
    "Herramientas de comprobacion",
    "Procesos recientes",
    "Diagnostico tecnico",
  ].map((label) => controlCenter.indexOf(label));

  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("AH3. Estado operacional resume informacion existente", () => {
  assert.match(controlCenter, /function OperationStatusBadge/);
  assert.match(controlCenter, /activeWorkers === 0/);
  assert.match(controlCenter, /activeJobs > 0/);
  assert.match(controlCenter, /errors\.length > 0/);
  assert.match(controlCenter, /Operacion disponible/);
  assert.match(controlCenter, /Equipo local desconectado/);
  assert.match(controlCenter, /Proceso en curso/);
  assert.match(controlCenter, /Requiere atencion/);
  assert.match(controlCenter, /Equipos activos/);
  assert.match(controlCenter, /Procesos en curso/);
  assert.match(controlCenter, /Cola pendiente/);
  assert.match(controlCenter, /Tipos de proceso/);
  assert.match(controlCenter, /Ultima señal/);
});

test("AH4. acciones individuales y herramientas quedan agrupadas sin eliminar controles", () => {
  assert.ok(controlCenter.indexOf("<BancoReservasLastWeekControl") > controlCenter.indexOf('title="Acciones individuales"'));
  assert.ok(controlCenter.indexOf("<BancoPacksUpdateControl") > controlCenter.indexOf('title="Acciones individuales"'));
  assert.ok(controlCenter.indexOf("<DashboardLastMonthControl") > controlCenter.indexOf('title="Acciones individuales"'));
  assert.ok(controlCenter.indexOf("<OrquestadorRefreshButton") > controlCenter.indexOf('title="Herramientas de comprobacion"'));
  assert.ok(controlCenter.indexOf("<WorkerHealthCheckButton") > controlCenter.indexOf('title="Herramientas de comprobacion"'));
  assert.ok(controlCenter.indexOf("<SourceConnectionCheckControl") > controlCenter.indexOf('title="Herramientas de comprobacion"'));
  assert.match(controlCenter, /Usar para validar el estado tecnico del sistema/);
  assert.match(controlCenter, /md:grid-cols-2 xl:grid-cols-3/);
});

test("AH5. diagnostico tecnico conserva tablas existentes al final", () => {
  assert.ok(controlCenter.indexOf('title="Equipos conectados \/ Workers"') > controlCenter.indexOf('title="Diagnostico tecnico"'));
  assert.ok(controlCenter.indexOf('title="Registro tecnico \/ Eventos recientes"') > controlCenter.indexOf('title="Diagnostico tecnico"'));
  assert.ok(controlCenter.indexOf('title="Procesos disponibles \/ Tipos de job"') > controlCenter.indexOf('title="Diagnostico tecnico"'));
  assert.match(controlCenter, /<DataTable minWidth="760px">/);
  assert.match(controlCenter, /<DataTable minWidth="920px">/);
  assert.match(controlCenter, /<DataTable minWidth="900px">/);
  assert.ok(controlCenter.indexOf('title="Diagnostico tecnico"') > controlCenter.indexOf('title="Procesos recientes"'));
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

test("AK. montaje consulta active global antes de localStorage", () => {
  assert.match(hook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos\/active"/);
  assert.match(hook, /type ActiveRunResponse/);
  assert.ok(hook.indexOf('fetch("/api/orquestador/operaciones/actualizar-datos/active"') < hook.indexOf("window.localStorage.getItem(storageKey)"));
});

test("AL. PC B adopta corrida activa persistida", () => {
  assert.match(hook, /if \(!responseBody\.active\)/);
  assert.match(hook, /isCompositeRunViewModel\(responseBody\.run\)/);
  assert.match(hook, /persistRunId\(responseBody\.run\.run_id\)/);
  assert.match(hook, /setRun\(responseBody\.run\)/);
  assert.match(hook, /scheduleNext\(activeRun\.run_id, 1000\)/);
});

test("AM. localStorage queda como compatibilidad y no autoridad", () => {
  assert.match(hook, /loadActiveRun\(\)\.then/);
  assert.match(hook, /clearStoredRun\("global_active_empty"\)/);
  assert.ok(hook.indexOf("loadActiveRun().then") < hook.indexOf("normalizeStoredRunId(storedRunId)"));
});

test("AN. start 409 adopta activeRunId sin error generico", () => {
  assert.match(hook, /response\.status === 409/);
  assert.match(hook, /operational_update_already_running/);
  assert.match(hook, /typeof responseBody\.activeRunId === "string"/);
  assert.match(hook, /persistRunId\(responseBody\.activeRunId\)/);
  assert.match(hook, /setRun\(responseBody\.run\)/);
  assert.match(hook, /scheduleNext\(responseBody\.activeRunId, 1000\)/);
  assert.ok(hook.indexOf("response.status === 409") < hook.indexOf("if (!response.ok)", hook.indexOf("response.status === 409")));
});

test("AO. terminal limpia seguimiento y detiene polling", () => {
  assert.match(hook, /clearStoredRun\("terminal_run"\)/);
  assert.match(hook, /if \(!run \|\| isTerminalRun\(run\)\)/);
  assert.match(hook, /clearTimer\(\)/);
});

test("AP. boton indica actualizacion en curso con run activo", () => {
  assert.match(control, /const triggerLabel = run \? "Actualizacion en curso"/);
  assert.match(control, /aria-label=\{triggerLabel\}/);
  assert.match(control, /title=\{triggerLabel\}/);
  assert.match(control, /disabled=\{!canStart\}/);
});
