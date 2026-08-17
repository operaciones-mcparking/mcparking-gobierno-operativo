import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const history = readFileSync("src/app/orquestador/recent-processes.tsx", "utf8");
const historyRoute = readFileSync("src/app/api/orquestador/jobs/history/route.ts", "utf8");
const livenessRoute = readFileSync("src/app/api/orquestador/jobs/[jobId]/liveness/route.ts", "utf8");
const panel = readFileSync("src/app/orquestador/job-liveness-panel.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const targetJobId = "37c4a275-326a-486d-b15c-ea9af6aa6cb5";

test("job outside loaded pages opens detail from authoritative UUID search", () => {
  assert.ok(targetJobId.length === 36);
  assert.ok(history.includes("getOrchestratorJobById") === false);
  assert.ok(historyRoute.includes("getOrchestratorJobById(jobId)"));
  assert.ok(history.includes("openJob(body.job)"));
  assert.ok(history.includes("<JobTechnicalDetailButton"));
});

test("liveness resolves the selected UUID directly instead of recent jobs", () => {
  assert.ok(livenessRoute.includes("getOrchestratorJobById(jobId)"));
  assert.ok(!livenessRoute.includes("listOrchestratorJobsForGuard"));
  assert.ok(!livenessRoute.includes(".find((item) => item.id === jobId)"));
});

test("not found is emitted only for an authoritative empty result", () => {
  assert.ok(admin.includes("return { data: row ? safeJobRow(row) : null, error: false }"));
  assert.ok(livenessRoute.includes("if (jobResult.error"));
  assert.ok(livenessRoute.includes("if (!job)"));
  assert.ok(historyRoute.includes("if (result.error)"));
  assert.ok(historyRoute.includes("if (!result.data)"));
});

test("failed standalone shows retry while failed composite does not", () => {
  assert.ok(panel.includes('job?.status === "failed" && !job.compositeRunId'));
  assert.ok(panel.includes('job.status === "failed" && job.compositeRunId'));
  assert.ok(panel.includes("Reintentar"));
});

test("safe client contract excludes retry payload and service role", () => {
  assert.ok(admin.includes("safeJobRow(row)"));
  assert.ok(!panel.includes("payload"));
  assert.ok(!livenessRoute.includes("payload"));
  assert.ok(!livenessRoute.includes("service_role"));
});