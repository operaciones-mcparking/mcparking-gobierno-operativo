import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath = "supabase/migrations/20260818140000_align_recovery_with_worker_restart_detection.sql";
const migration = readFileSync(migrationPath, "utf8");
const liveness = readFileSync("src/lib/orquestador/liveness.ts", "utf8");

test("replaces only the existing recovery signature with hardened privileges", () => {
  assert.match(migration, /create or replace function public\.orchestrator_recover_stuck_worker\(\s*p_worker_id text,\s*p_recent_hours integer default 6,\s*p_reason text default 'manual_recovery_from_web',\s*p_dry_run boolean default true\s*\)/s);
  assert.match(migration, /returns jsonb[\s\S]*security definer[\s\S]*set search_path = 'pg_catalog', 'ops_orchestrator'/);
  assert.match(migration, /revoke all on function public\.orchestrator_recover_stuck_worker\(text, integer, text, boolean\) from public/);
  assert.match(migration, /revoke execute[\s\S]*from anon[\s\S]*revoke execute[\s\S]*from authenticated[\s\S]*grant execute[\s\S]*to service_role/);
  assert.equal((migration.match(/create or replace function public\.orchestrator_recover_stuck_worker/g) ?? []).length, 1);
});

test("preserves state and ownership locks before evaluating recovery", () => {
  assert.match(migration, /orchestrator_workers[\s\S]*where worker_id = p_worker_id[\s\S]*for update/);
  assert.match(migration, /orchestrator_jobs[\s\S]*where id = v_worker\.current_job_id[\s\S]*for update/);
  assert.match(migration, /v_job\.status <> 'running'/);
  assert.match(migration, /v_job\.locked_by_worker_id is distinct from v_worker\.worker_id/);
  assert.match(migration, /'reason_code', 'no_current_job'/);
  assert.match(migration, /'reason_code', 'ownership_or_state_changed'/);
});

test("keeps stale-worker recovery and rejects recent job heartbeats", () => {
  assert.match(migration, /v_stale_timeout constant interval := interval '5 minutes'/);
  assert.match(migration, /v_job\.last_heartbeat_at < v_now - v_stale_timeout/);
  assert.match(migration, /v_worker\.last_seen_at < v_now - v_stale_timeout/);
  assert.match(migration, /if not v_job_stale or not \(v_worker_stale or v_restart_evidence\)/);
  assert.match(migration, /'stale_candidate'/);
  assert.match(migration, /'heartbeat_not_stale'/);
});

test("restart path requires a recent worker and strong timestamp evidence", () => {
  assert.match(migration, /v_worker_recent_timeout constant interval := interval '90 seconds'/);
  assert.match(migration, /v_worker\.last_seen_at >= v_now - v_worker_recent_timeout/);
  assert.match(migration, /v_job\.started_at is not null/);
  assert.match(migration, /v_worker_started_at > v_job\.started_at/);
  assert.match(migration, /v_worker_started_at > v_job\.last_heartbeat_at/);
  assert.match(migration, /'worker_restarted_orphan_job'/);
});

test("malformed worker started_at cannot abort or authorize recovery", () => {
  assert.match(migration, /begin\s+v_worker_started_at := \(v_worker\.metadata ->> 'started_at'\)::timestamptz;\s+exception/s);
  assert.match(migration, /when invalid_datetime_format or datetime_field_overflow then\s+v_worker_started_at := null/s);
  assert.match(migration, /v_worker_started_at is not null/);
});

test("dry-run is read-only and keeps the candidate contract", () => {
  const dryRun = migration.slice(migration.indexOf("if p_dry_run then"), migration.indexOf("v_error_message :="));
  assert.doesNotMatch(dryRun, /\b(update|insert|delete)\b/i);
  for (const field of ["id", "job_type", "status", "requested_source", "locked_by_worker_id", "attempts", "max_attempts", "created_at", "started_at", "last_heartbeat_at", "worker_last_seen_at"]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  assert.match(dryRun, /'candidate_jobs', jsonb_build_array\(v_candidate\)/);
});

test("real recovery fails the job, records an event, and releases the worker", () => {
  assert.match(migration, /update ops_orchestrator\.orchestrator_jobs[\s\S]*status = 'failed'[\s\S]*finished_at = coalesce\(finished_at, v_now\)/);
  assert.match(migration, /insert into ops_orchestrator\.orchestrator_job_events[\s\S]*'failed'[\s\S]*'recovery_mode', v_recovery_mode/);
  assert.match(migration, /update ops_orchestrator\.orchestrator_workers[\s\S]*status = 'idle'[\s\S]*current_job_id = null/);
  assert.match(migration, /\{last_automatic_recovery\}/);
  assert.match(migration, /'recovered_stale_job'/);
  assert.match(migration, /'recovered_restarted_orphan_job'/);
  assert.doesNotMatch(migration, /delete from|status\s*=\s*'succeeded'|orchestrator_create_job/i);
});

test("UI orphan threshold remains aligned and ambiguous dry-runs stay blocked", () => {
  assert.match(liveness, /if \(heartbeatAgeSeconds <= 300\) return "STALE_RUNNING"/);
  assert.match(liveness, /workerSignalAgeSeconds <= 90 && workerStartedMs > restartBoundary \? "ORPHAN_SUSPECTED"/);
  assert.match(liveness, /result\.candidateJobs\.length !== 1/);
  assert.match(liveness, /candidate\.lockedByWorkerId !== expectedWorkerId/);
});
