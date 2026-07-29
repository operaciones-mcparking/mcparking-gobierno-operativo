import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const startPath = "src/app/api/orquestador/operaciones/actualizar-datos/route.ts";
const advancePath = "src/app/api/orquestador/operaciones/actualizar-datos/advance/route.ts";
const getPath = "src/app/api/orquestador/operaciones/actualizar-datos/[runId]/route.ts";
const helperPath = "src/lib/orquestador/actualizar-datos-operacionales.ts";
const supabaseAdminPath = "src/lib/orquestador/supabase-admin.ts";
const compositeMapperPath = "src/lib/orquestador/composite-runs.ts";

const startRoute = readFileSync(startPath, "utf8");
const advanceRoute = readFileSync(advancePath, "utf8");
const getRoute = readFileSync(getPath, "utf8");
const helper = readFileSync(helperPath, "utf8");
const supabaseAdmin = readFileSync(supabaseAdminPath, "utf8");
const compositeMapper = readFileSync(compositeMapperPath, "utf8");
const allSources = [startRoute, advanceRoute, getRoute, helper, supabaseAdmin, compositeMapper].join("\n");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function assertNoUnsafeDto(source) {
  assert.doesNotMatch(source, /payload:\s*job|payload:\s*data|payload:\s*result|result:\s*job\.result|result:\s*row\.result|metadata|stdout|stderr|command_preview/);
}

test("A. Endpoint iniciar existe", () => {
  assert.equal(existsSync(startPath), true);
  assert.match(startRoute, /export async function POST/);
});

test("B. Endpoint advance existe", () => {
  assert.equal(existsSync(advancePath), true);
  assert.match(advanceRoute, /export async function POST/);
});

test("C. Endpoint GET existe", () => {
  assert.equal(existsSync(getPath), true);
  assert.match(getRoute, /export async function GET/);
});

test("D. Body iniciar exacto confirm=true", () => {
  assert.match(startRoute, /keys\.length === 1 && keys\[0\] === "confirm"/);
  assert.match(startRoute, /confirm === true/);
});

test("E. Body extra rechazado", () => {
  assert.match(startRoute, /keys\.length === 1/);
  assert.match(advanceRoute, /keys\.length === 1 && keys\[0\] === "run_id"/);
});

test("F. Query params rechazados", () => {
  assert.match(startRoute, /request\.nextUrl\.searchParams\.size > 0/);
  assert.match(advanceRoute, /request\.nextUrl\.searchParams\.size > 0/);
});

test("G. Auth requerida", () => {
  assert.match(startRoute, /getActiveAdminUser/);
  assert.match(advanceRoute, /getActiveAdminUser/);
  assert.match(getRoute, /getActiveAdminUser/);
  assert.match(startRoute + advanceRoute + getRoute, /401/);
  assert.match(startRoute + advanceRoute + getRoute, /403/);
});

test("H. Los tres job types requeridos", () => {
  assert.match(helper, /banco_reservas_actualizar/);
  assert.match(helper, /banco_packs_actualizar_sin_consumos/);
  assert.match(helper, /dashboard_actualizar_metricas/);
  assert.match(helper, /for \(const step of ACTUALIZAR_DATOS_STEPS\)/);
});

test("I. Readiness inicial", () => {
  assert.match(startRoute, /const firstCheck = await loadReadiness\(\)/);
  assert.match(startRoute, /const secondCheck = await loadReadiness\(\)/);
  assert.match(helper, /worker\.status !== "idle"/);
  assert.match(helper, /input\.worker\.locked_job_id/);
  assert.match(helper, /OPERACIONES_HEARTBEAT_MAX_AGE_MS = 120_000/);
  assert.match(helper, /input\.jobs\.some\(isActualizarDatosActiveJob\)/);
});

test("J. UUID generado server-side", () => {
  assert.match(startRoute, /randomUUID/);
  assert.match(startRoute, /const runId = randomUUID\(\)/);
  assert.doesNotMatch(startRoute, /body\.run_id|payload\.run_id/);
});

test("K. Solo crea etapa 1 al iniciar", () => {
  assert.match(startRoute, /const firstStep = ACTUALIZAR_DATOS_STEPS\[0\]/);
  const calls = [...startRoute.matchAll(/createCompositeJobStep\(/g)].length;
  assert.equal(calls, 1);
});

test("L. Etapa 1 contrato exacto", () => {
  assert.match(helper, /jobType: "banco_reservas_actualizar"/);
  assert.match(helper, /payload: \{ modo: "last-month" \}/);
  assert.match(helper, /requestedSource: "web_orchestrator_operaciones_last_month_reservas"/);
});

test("M. Advance valida UUID", () => {
  assert.match(advanceRoute, /isActualizarDatosRunId\(payload\.run_id\)/);
  assert.match(helper, /\[0-9a-f\]\{8\}/);
});

test("N. Advance no crea mientras etapa activa", () => {
  assert.match(advanceRoute, /OPERACIONES_ACTIVE_JOB_STATUSES\.has\(lastStep\.status\)/);
  assert.ok(advanceRoute.indexOf("OPERACIONES_ACTIVE_JOB_STATUSES.has(lastStep.status)") < advanceRoute.indexOf("await createCompositeJobStep"));
});

test("O. Advance se detiene si failed", () => {
  assert.match(advanceRoute, /lastStep\.status === "failed"/);
});

test("P. Advance se detiene si cancelled", () => {
  assert.match(advanceRoute, /lastStep\.status === "cancelled"/);
});

test("Q. Advance crea etapa 2 solo tras etapa 1 succeeded", () => {
  assert.match(helper, /lastStep\.status !== "succeeded"/);
  assert.match(helper, /const nextIndex = lastStep\.sequence_index \+ 1/);
});

test("R. Etapa 2 contrato exacto", () => {
  assert.match(helper, /jobType: "banco_packs_actualizar_sin_consumos"/);
  assert.match(helper, /payload: \{ action: "actualizar-packs" \}/);
  assert.match(helper, /requestedSource: "web_orchestrator_operaciones_last_month_packs"/);
});

test("S. Advance crea etapa 3 solo tras etapa 2 succeeded", () => {
  assert.match(helper, /getActualizarDatosStep\(nextIndex\)/);
  assert.match(advanceRoute, /step: nextStep/);
});

test("T. Etapa 3 contrato exacto", () => {
  assert.match(helper, /jobType: "dashboard_actualizar_metricas"/);
  assert.match(helper, /agent: "dashboard"/);
  assert.match(helper, /action: "actualizar-metricas"/);
  assert.match(helper, /periodo: "last-month"/);
  assert.match(helper, /requestedSource: "web_orchestrator_operaciones_last_month_dashboard"/);
});

test("U. No duplica etapas", () => {
  assert.match(helper, /const existing = new Set/);
  assert.match(helper, /existing\.has\(nextIndex\)/);
});

test("V. composite_kind validado", () => {
  assert.match(helper, /ACTUALIZAR_DATOS_OPERACIONALES_KIND/);
  assert.match(helper, /row\.sequence_total === OPERACIONES_SEQUENCE_TOTAL/);
  assert.match(helper, /row\.job_type === expectedStep\.jobType/);
  assert.match(helper, /row\.requested_source === expectedStep\.requestedSource/);
  assert.match(helper, /row\.target_worker_id === expectedStep\.targetWorkerId/);
  assert.match(advanceRoute, /hasExpectedActualizarDatosRunContract\(existing\.data\)/);
  assert.match(getRoute, /hasExpectedActualizarDatosRunContract\(jobs\.data\)/);
});

test("W. target fijo", () => {
  assert.match(helper, /OPERACIONES_TARGET_WORKER_ID = "pc_operaciones_01"/);
  assert.match(helper, /targetWorkerId: OPERACIONES_TARGET_WORKER_ID/);
  assert.match(supabaseAdmin, /p_target_worker_id: input\.step\.targetWorkerId/);
});

test("X. priorities 90 91 92", () => {
  assert.match(helper, /priority: 90/);
  assert.match(helper, /priority: 91/);
  assert.match(helper, /priority: 92/);
  assert.match(supabaseAdmin, /p_priority: input\.step\.priority/);
});

test("Y. sources fijos", () => {
  assert.match(helper, /web_orchestrator_operaciones_last_month_reservas/);
  assert.match(helper, /web_orchestrator_operaciones_last_month_packs/);
  assert.match(helper, /web_orchestrator_operaciones_last_month_dashboard/);
  assert.match(supabaseAdmin, /p_requested_source: input\.step\.requestedSource/);
});

test("Z. GET 404 si run no existe", () => {
  assert.match(getRoute, /jobs\.data\.length === 0/);
  assert.match(getRoute, /404/);
});

test("AA. GET devuelve DTO seguro", () => {
  assert.match(getRoute, /mapActualizarDatosRun\(jobs\.data, runId\)/);
  assert.match(compositeMapper, /safe_message/);
  assert.match(compositeMapper, /safe_error/);
});

test("AB. No expone payload", () => {
  assert.doesNotMatch(allSources, /payload:\s*job|payload:\s*data|payload:\s*result|body\.payload|payload\.payload/);
});

test("AC. No expone result crudo", () => {
  assert.doesNotMatch(allSources, /result:\s*job\.result|result:\s*row\.result|row\.result/);
});

test("AD. No expone stdout stderr", () => {
  assertNoUnsafeDto(startRoute + advanceRoute + getRoute + compositeMapper);
});

test("AE. No expone command_preview", () => {
  assertNoUnsafeDto(startRoute + advanceRoute + getRoute + compositeMapper);
});

test("AF. No altera controles existentes", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/worker-health-check-button\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/source-connection-check-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-packs-update-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/dashboard-last-month-control\.tsx$/m);
});

test("AG. No toca recuperacion", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations\/20260727120000_update_recovery/m);
});

test("AH. No crea job type compuesto nuevo", () => {
  assert.doesNotMatch(allSources, /orchestrator_job_types|insert\(|upsert\(|create table|alter table/i);
});

test("AI. No usa payload enriquecido legacy", () => {
  assert.doesNotMatch(helper, /rebuild|confirmar_borrado|confirmar_actualizacion|modo.*last-week/);
  assert.match(helper, /payload: \{ modo: "last-month" \}/);
});

test("AJ. RPC composite dedicadas", () => {
  assert.match(supabaseAdmin, /orchestrator_create_composite_job_step/);
  assert.match(supabaseAdmin, /orchestrator_list_composite_run_jobs/);
});
