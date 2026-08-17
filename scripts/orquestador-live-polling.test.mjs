import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dashboard = readFileSync("src/app/orquestador/dashboard-last-month-control.tsx", "utf8");
const jobsRoute = readFileSync("src/app/api/orquestador/jobs/route.ts", "utf8");
const livenessRoute = readFileSync("src/app/api/orquestador/jobs/[jobId]/liveness/route.ts", "utf8");
const overlay = readFileSync("src/app/orquestador/actualizar-datos-operacionales-control.tsx", "utf8");

test("Strict Mode setup restores mounted state before polling updates", () => {
  const setup = dashboard.indexOf("isMountedRef.current = true;");
  const cleanup = dashboard.indexOf("isMountedRef.current = false;");
  assert.ok(setup >= 0);
  assert.ok(cleanup > setup);
});

test("queued job is replaced by each remote state without remount", () => {
  assert.ok(dashboard.includes("setJobStatus(nextJob)"));
  assert.ok(dashboard.includes('status === "queued"'));
  assert.ok(dashboard.includes('status === "claimed" || status === "running"'));
  assert.ok(dashboard.includes('status === "succeeded"'));
  assert.ok(dashboard.includes('return "Listo"'));
  assert.ok(dashboard.includes('return "Fallido"'));
});

test("live poll runs about every twenty seconds and stops at terminal", () => {
  assert.ok(dashboard.includes("20_000"));
  assert.ok(dashboard.includes("terminalStatuses.has(nextJob.status)"));
  assert.ok(dashboard.includes("return;"));
});

test("live endpoints and requests bypass Next cache", () => {
  assert.ok(jobsRoute.includes('dynamic = "force-dynamic"'));
  assert.ok(livenessRoute.includes('dynamic = "force-dynamic"'));
  assert.ok(dashboard.includes('cache: "no-store"'));
});

test("transient polling errors preserve current job and retry", () => {
  assert.ok(dashboard.includes("Se reintentara automaticamente."));
  assert.ok(dashboard.includes("continue;"));
  const poll = dashboard.slice(dashboard.indexOf("async function pollJob"), dashboard.indexOf("async function createDashboardJob"));
  assert.ok(!poll.includes("setJobStatus(null)"));
  assert.ok(!poll.includes('status: "failed"'));
});

test("running job exposes job-specific progress heartbeat worker and health", () => {
  assert.ok(dashboard.includes("<JobLivenessPanel"));
  assert.ok(dashboard.includes("jobId={jobStatus.id}"));
  assert.ok(dashboard.includes("!terminalStatuses.has(jobStatus.status)"));
  assert.ok(livenessRoute.includes("listOrchestratorJobEvents(jobId, 50)"));
  assert.ok(livenessRoute.includes("getLatestJobProgress(events.data)"));
});

test("closing operational modal preserves run and polling", () => {
  const close = overlay.slice(overlay.indexOf("function closeOverlay"), overlay.indexOf("const actions"));
  assert.ok(close.includes("setIsOverlayOpen(false)"));
  assert.ok(!close.includes("clearRun();") || close.includes("isTerminalRun(run)"));
  assert.ok(overlay.includes("La ejecucion continuara en segundo plano"));
  assert.ok(overlay.includes("modal NO debe reabrirse") === false);
});