import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panel = readFileSync("src/app/orquestador/job-liveness-panel.tsx", "utf8");
const recoveryRoute = readFileSync("src/app/api/orquestador/jobs/recover/route.ts", "utf8");
const retryRoute = readFileSync("src/app/api/orquestador/jobs/[jobId]/retry/route.ts", "utf8");
const livenessRoute = readFileSync("src/app/api/orquestador/jobs/[jobId]/liveness/route.ts", "utf8");
const server = readFileSync("src/lib/orquestador/liveness-server.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const control = readFileSync("src/app/orquestador/orchestrator-control-center.tsx", "utf8");

test("liveness UI shows progress, relative heartbeat, duration and health labels", () => {
  for (const expected of ["progress?.message", "Ejecutando job", "Última señal", "Duración", "Ejecutando normalmente", "Sin actividad reciente", "Posible ejecución interrumpida", "Estado por verificar", "20_000", "1_000"]) {
    assert.ok(panel.includes(expected), expected);
  }
});

test("recovery is visible only for orphan and always performs dry-run first", () => {
  for (const expected of ['health === "ORPHAN_SUSPECTED"', 'action: "dry-run"', 'action: "recover", confirmRecovery: "RECUPERAR"', 'observed?.job?.status === "failed"', '!observed.worker?.currentJobId']) assert.ok(panel.includes(expected), expected);
  for (const expected of ["const dryRun = await recoverStuckWorkerAsAdmin", "validateRecoveryDryRun(dryRun.data", 'body.action === "dry-run"', "dryRun: false", "varias ejecuciones asociadas al worker"]) assert.ok(recoveryRoute.includes(expected), expected);
});

test("retry creates a new standalone job, deduplicates operational identity and leaves original untouched", () => {
  for (const expected of ['job?.status === "failed" && !job.compositeRunId', "ejecuciones compuestas aún requiere recuperación"]) assert.ok(panel.includes(expected), expected);
  assert.ok(retryRoute.includes("confirmRetry"));
  assert.ok(retryRoute.includes("REINTENTAR"));
  for (const expected of ['source.status !== "failed"', "source.compositeRunId", 'retryPayloadKeys = ["periodo", "modo", "mode", "action", "agent"]', "duplicate-active", "createRetryOrchestratorJob"]) assert.ok(server.includes(expected), expected);
  assert.ok(admin.includes('p_requested_source: "retry_web_orchestrator"'));
  assert.ok(!server.includes(".update("));
});

test("client receives neither retry payload nor service role credentials", () => {
  for (const forbidden of ["payload", "service_role", "SUPABASE_SERVICE_ROLE_KEY"]) assert.ok(!panel.includes(forbidden), forbidden);
  assert.ok(!livenessRoute.includes("getOrchestratorJobForRetry"));
  assert.ok(livenessRoute.includes("getLatestJobProgress"));
});

test("worker health uses tolerant classifier and requested labels", () => {
  for (const expected of ["classifyWorkerHealth(worker)", "Disponible", "Ejecutando", "Sin señal", "Estado desconocido"]) assert.ok(control.includes(expected), expected);
});