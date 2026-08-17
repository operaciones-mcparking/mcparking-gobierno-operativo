import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const typesSource = readFileSync("src/lib/orquestador/types.ts", "utf8");
const adminSource = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const serverSource = readFileSync("src/lib/orquestador/liveness-server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260816182000_add_orchestrator_liveness_contracts.sql", "utf8");
const livenessSource = readFileSync("src/lib/orquestador/liveness.ts", "utf8");

async function loadPureModule() {
  const source = livenessSource.replace(/^import type .*?;\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const now = new Date("2026-08-16T12:10:00.000Z");
const baseJob = { id: "11111111-1111-4111-8111-111111111111", status: "running", started_at: "2026-08-16T11:00:00.000Z" };
const baseWorker = { currentJobId: baseJob.id, last_seen_at: "2026-08-16T12:09:40.000Z", startedAt: "2026-08-16T10:00:00.000Z" };

test("mappers expose liveness fields but discard payload and metadata", () => {
  assert.match(typesSource, /lastHeartbeatAt: row\.last_heartbeat_at/);
  assert.match(typesSource, /instanceId:[\s\S]*metadata/);
  assert.doesNotMatch(typesSource.match(/export type OrchestratorJob[\s\S]*?};/)?.[0] ?? "", /payload/);
  assert.doesNotMatch(typesSource.match(/export type OrchestratorWorker[\s\S]*?};/)?.[0] ?? "", /metadata/);
});

test("migration extends composite and adds scoped events plus retry lookup", () => {
  assert.match(migration, /orchestrator_list_composite_run_jobs[\s\S]*last_heartbeat_at[\s\S]*priority/);
  assert.match(migration, /orchestrator_list_job_events[\s\S]*where e\.job_id = p_job_id[\s\S]*limit greatest\(1, least\(coalesce\(p_limit, 50\), 200\)\)/);
  assert.match(migration, /orchestrator_get_job_for_retry/);
  assert.match(migration, /revoke all on function public\.orchestrator_get_job_for_retry\(uuid\) from public/);
  assert.match(migration, /grant execute on function public\.orchestrator_get_job_for_retry\(uuid\) to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/);
});

test("server-only wrappers authorize recovery and retry through the official creator", () => {
  assert.match(serverSource, /^import "server-only"/);
  assert.match(serverSource, /getActiveAdminUser\(\)/);
  assert.match(adminSource, /orchestrator_recover_stuck_worker/);
  assert.match(adminSource, /value\.locked_by_worker_id/);
  assert.doesNotMatch(adminSource, /value\.worker_id/);
  assert.match(adminSource, /orchestrator_get_job_for_retry/);
  assert.match(serverSource, /createRetryOrchestratorJob/);
  assert.match(adminSource, /orchestrator_create_job/);
  assert.match(serverSource, /duplicate-active/);
  assert.doesNotMatch(serverSource, /update.*failed|status.*=.*queued/i);
});

test("latest progress selects newest worker_progress", async () => {
  const { getLatestJobProgress } = await loadPureModule();
  const result = getLatestJobProgress([
    { id: 1, event_type: "worker_progress", message: "Anterior", stage: "old", substage: null, created_at: "2026-08-16T12:00:00Z" },
    { id: 3, event_type: "message", message: "Otro", stage: null, substage: null, created_at: "2026-08-16T12:09:00Z" },
    { id: 2, event_type: "worker_progress", message: "Calculando reservas", stage: "reservas", substage: "query", created_at: "2026-08-16T12:08:00Z" },
  ]);
  assert.deepEqual(result, { stage: "reservas", substage: "query", message: "Calculando reservas", createdAt: "2026-08-16T12:08:00Z" });
});

test("health classifier covers healthy stale orphan long-running and unknown", async () => {
  const { classifyJobHealth } = await loadPureModule();
  assert.equal(classifyJobHealth({ job: { ...baseJob, lastHeartbeatAt: "2026-08-16T12:08:30.000Z" }, worker: baseWorker, now }), "HEALTHY_RUNNING");
  assert.equal(classifyJobHealth({ job: { ...baseJob, lastHeartbeatAt: "2026-08-16T12:08:29.000Z" }, worker: baseWorker, now }), "STALE_RUNNING");
  assert.equal(classifyJobHealth({ job: { ...baseJob, lastHeartbeatAt: "2026-08-16T12:04:00.000Z" }, worker: { ...baseWorker, startedAt: "2026-08-16T12:05:00.000Z" }, now }), "ORPHAN_SUSPECTED");
  assert.equal(classifyJobHealth({ job: { ...baseJob, started_at: "2026-08-16T01:00:00.000Z", lastHeartbeatAt: "2026-08-16T12:09:50.000Z" }, worker: baseWorker, now }), "HEALTHY_RUNNING");
  assert.equal(classifyJobHealth({ job: { ...baseJob, lastHeartbeatAt: null }, worker: baseWorker, now }), "UNKNOWN_BLOCKED");
});

test("dry-run validation rejects ambiguity and accepts exact candidate", async () => {
  const { validateRecoveryDryRun } = await loadPureModule();
  const candidate = { jobId: baseJob.id, lockedByWorkerId: "pc_operaciones_01", status: "running" };
  const base = { dryRun: true, workerBefore: null, workerAfter: null, candidateJobs: [candidate], updatedJobs: [], eventsInserted: 0, activeJobsAfter: 1, message: null };
  assert.equal(validateRecoveryDryRun(base, baseJob.id, "pc_operaciones_01").safe, true);
  assert.deepEqual(validateRecoveryDryRun({ ...base, candidateJobs: [candidate, { ...candidate, jobId: "22222222-2222-4222-8222-222222222222" }] }, baseJob.id, "pc_operaciones_01"), { safe: false, reason: "ambiguous" });
});
test("worker health tolerates one missed signal before stale/offline", async () => {
  const { classifyWorkerHealth } = await loadPureModule();
  assert.equal(classifyWorkerHealth({ status: "idle", currentJobId: null, last_seen_at: "2026-08-16T12:09:40.000Z" }, now), "AVAILABLE");
  assert.equal(classifyWorkerHealth({ status: "running", currentJobId: baseJob.id, last_seen_at: "2026-08-16T12:09:40.000Z" }, now), "BUSY");
  assert.equal(classifyWorkerHealth({ status: "running", currentJobId: baseJob.id, last_seen_at: "2026-08-16T12:08:00.000Z" }, now), "STALE");
  assert.equal(classifyWorkerHealth({ status: "running", currentJobId: baseJob.id, last_seen_at: "2026-08-16T12:04:00.000Z" }, now), "OFFLINE_OR_UNKNOWN");
});

test("retry helper permits failed standalone and blocks composite retry mode", () => {
  assert.match(serverSource, /result\.data\.status !== "failed"/);
  assert.match(serverSource, /result\.data\.compositeRunId \? "composite-not-supported-yet" : "standalone-supported"/);
  assert.match(serverSource, /createRetryOrchestratorJob/);
  assert.match(adminSource, /retry_web_orchestrator/);
});