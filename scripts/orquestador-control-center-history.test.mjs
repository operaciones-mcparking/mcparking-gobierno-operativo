import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const center = readFileSync("src/app/orquestador/orchestrator-control-center.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const recent = readFileSync("src/app/orquestador/recent-processes.tsx", "utf8");
const route = readFileSync("src/app/api/orquestador/jobs/history/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260816183000_add_orchestrator_job_history_pagination.sql", "utf8");

test("first page loads fifty recent jobs plus one lookahead row", () => {
  assert.ok(center.includes("listOrchestratorJobsPage({ limit: 51 })"));
  assert.ok(center.includes("jobs.data.slice(0, 50)"));
  assert.ok(center.includes("jobs.data.length > 50"));
  assert.ok(center.includes("<RecentProcesses hasMore={hasMoreJobs} jobs={jobs}"));
});

test("migration defines stable keyset cursor and descending order", () => {
  assert.ok(migration.includes("p_before_created_at timestamptz default null"));
  assert.ok(migration.includes("p_before_id uuid default null"));
  assert.ok(migration.includes("j.created_at < p_before_created_at"));
  assert.ok(migration.includes("j.created_at = p_before_created_at and j.id < p_before_id"));
  assert.ok(migration.includes("order by j.created_at desc, j.id desc"));
});

test("page limit is bounded to one hundred", () => {
  assert.ok(migration.includes("greatest(1, least(coalesce(p_limit, 50), 100))"));
  assert.ok(admin.includes("Math.min(Math.trunc(input.limit ?? 50), 100)"));
  assert.ok(route.includes("limit: pageSize + 1"));
});

test("load more sends the last visible row as cursor and appends without duplicates", () => {
  assert.ok(recent.includes("const cursor = items.at(-1)"));
  assert.ok(recent.includes("beforeCreatedAt: cursor.created_at"));
  assert.ok(recent.includes("beforeId: cursor.id"));
  assert.ok(recent.includes("const ids = new Set(current.map((job) => job.id))"));
  assert.ok(recent.includes("!ids.has(job.id)"));
});

test("load more disappears when the endpoint reports completion", () => {
  assert.ok(recent.includes("setCanLoadMore(body.hasMore === true)"));
  assert.ok(recent.includes("{canLoadMore ? ("));
  assert.ok(recent.includes("Cargar más"));
  assert.ok(route.includes("hasMore: result.data.length > pageSize"));
});

test("exact UUID search bypasses paginated history", () => {
  assert.ok(recent.includes("Buscar por Job ID"));
  assert.ok(recent.includes("UUID completo"));
  assert.ok(route.includes("getOrchestratorJobById(jobId)"));
  assert.ok(admin.includes('supabase.rpc("orchestrator_get_job_by_id"'));
  assert.ok(!route.includes("listOrchestratorJobs("));
});

test("missing UUID reports No encontrado", () => {
  assert.ok(route.includes('"No encontrado."'));
  assert.ok(recent.includes('"No encontrado"'));
  assert.ok(route.includes("status: 404"));
});

test("found search result opens the existing technical detail", () => {
  assert.ok(recent.includes("openJob(body.job)"));
  assert.ok(recent.includes("setSelectedJobId(job.id)"));
  assert.ok(recent.includes("<JobTechnicalDetailButton"));
});

test("new RPCs are server-only and preserve existing list RPC", () => {
  assert.ok(migration.includes("security definer"));
  assert.ok(migration.includes("set search_path = ''"));
  assert.ok(migration.includes("grant execute on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) to service_role"));
  assert.ok(migration.includes("grant execute on function public.orchestrator_get_job_by_id(uuid) to service_role"));
  assert.ok(!migration.includes("grant execute on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) to authenticated"));
  assert.ok(!migration.includes("create or replace function public.orchestrator_list_jobs("));
});

test("client receives safe mapped jobs without payload or raw result", () => {
  assert.ok(admin.includes("(data ?? []).map(safeJobRow)"));
  assert.ok(admin.includes("safeJobRow(row)"));
  assert.ok(!recent.includes("payload"));
  assert.ok(!recent.includes("service_role"));
});