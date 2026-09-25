import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  createOperationalHeartbeat,
  finishOperationalRefresh,
  formatRefreshError,
  heartbeatOperationalRefresh,
  parseRefreshArgs,
  runReadyAuditIsolated,
  runRefresh,
  startOperationalRefresh,
  STABLE_COVERAGE_SQL,
} from "./customer-window-related-review-mcp-eap-v1-refresh.mjs";

const previousSnapshotId = "48d075b3-c8dc-49c3-bed7-daf02f29fbab";
const newSnapshotId = "9f54ef84-f9d5-4e09-9f68-be34f55d9e9f";
const source = readFileSync(new URL(
  "./customer-window-related-review-mcp-eap-v1-refresh.mjs", import.meta.url), "utf8");
const postcheckDiagnostics = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_postcheck_e35be012_diagnostics.sql",
  import.meta.url), "utf8");
const postcheckCandidate = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_postcheck_plan_stable_candidates.sql",
  import.meta.url), "utf8");

function fixture({ lock = true, activeCount = 1, readyCount = 0,
  readySnapshotId = newSnapshotId, stableMissing = "0", buildError = null,
  auditError = null, auditResult = null, activateError = null, connectError = null,
  lockQueryError = null, preflightQueryError = null,
  retryContract = null, lifecycleInvalid = false, retentionError = null,
  retentionResults = null } = {}) {
  const state = { queries: [], ended: 0, calls: [], lockHeld: false,
    keyBytes: Buffer.alloc(32, 7), retentionCalls: 0, operationalStarts: 0,
    operationalFinishes: [], heartbeatStops: 0 };
  class Client {
    async connect() {
      state.calls.push("connect");
      if (connectError) throw connectError;
    }
    async end() { state.ended++; state.calls.push("end"); }
    async query(sql, values = []) {
      const text = sql.trim().replace(/\s+/g, " ");
      state.queries.push({ text, values });
      if (text.includes("pg_try_advisory_lock")) {
        if (lockQueryError) throw lockQueryError;
        state.lockHeld = lock;
        return { rows: [{ acquired: lock }] };
      }
      if (text.includes("as active_snapshot_id")) {
        if (preflightQueryError) throw preflightQueryError;
        return { rows: [{
        current_user: "customer_related_review_builder_login",
        session_user: "customer_related_review_builder_login",
        inherited_capability: true,
        snapshots_rls: true,
        active_count: activeCount,
        ready_count: readyCount,
        active_snapshot_id: activeCount === 1 ? previousSnapshotId : null,
        ready_snapshot_id: readyCount === 1 ? readySnapshotId : null,
        active_activated_at: activeCount === 1 ? "2026-09-21T12:00:00.000Z" : null,
        }] };
      }
      if (text.includes("as target_ready_count")) return { rows: [retryContract ?? {
        ready_count: 1,
        target_ready_count: 1,
        target_active_count: 0,
        target_status: "ready",
        target_activated_at: null,
        target_superseded_at: null,
      }] };
      if (text.includes("as target_active_count")) return { rows: [{
        active_count: lifecycleInvalid ? 0 : 1, ready_count: 0, target_active_count: 1,
        previous_status: "superseded",
        previous_activated_at: "2026-09-21T12:00:00.000Z",
        previous_superseded_at: "2026-09-22T12:00:00.000Z",
      }] };
      if (text.includes("as stable_valid_bookings")) return { rows: [{
        stable_valid_bookings: "403975",
        stable_assigned_bookings: stableMissing === "0" ? "403975" : "403974",
        stable_missing_bookings: stableMissing,
        hot_valid_bookings: "12",
      }] };
      if (text.includes("customer_related_review_prune_superseded_v1_m2m")) {
        state.retentionCalls++;
        assert.equal(state.lockHeld, true);
        if (retentionError) throw retentionError;
        const configured = retentionResults?.[state.retentionCalls - 1];
        return { rows: [{ result: configured ?? {
          ok: true,
          deleted: 0,
          deletedSnapshotId: null,
          remainingSupersededBeyondRetention: 0,
          activeSnapshotId: newSnapshotId,
          containsPii: false,
        } }] };
      }
      if (text.includes("pg_advisory_unlock")) {
        state.lockHeld = false;
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      throw new Error("unexpected query");
    }
  }
  const parseEnv = () => ({ connection: {}, keyBytes: state.keyBytes, keyId: "test-key" });
  const buildFn = async () => {
    state.calls.push("build");
    if (buildError) throw buildError;
    return { ok: true, mode: "build-ready", committed: true, snapshotStatus: "ready",
      postCommitVerificationOk: true, snapshotId: newSnapshotId };
  };
  const auditFn = async () => {
    state.calls.push("audit");
    if (auditError) throw auditError;
    return auditResult ?? { ok: true, snapshotId: newSnapshotId, status: "ready",
      manifestMatch: true, countsMatch: true, anomalyCount: 0, containsPii: false };
  };
  const activateFn = async () => {
    state.calls.push("activate");
    if (activateError) throw activateError;
    return { ok: true, mode: "activate", status: "active", committed: true,
      postCommitVerificationOk: true, previousActiveSnapshotId: previousSnapshotId };
  };
  const operationalStartFn = async ({ runId }) => {
    state.operationalStarts++;
    return { ok: true, runId, containsPii: false };
  };
  const operationalFinishFn = async (input) => {
    state.operationalFinishes.push(input);
    return { ok: true, runId: input.runId, status: input.success ? "success" : "error",
      containsPii: false };
  };
  const heartbeatFactory = ({ beat }) => {
    state.heartbeatBeat = beat;
    return { stop: async () => { state.heartbeatStops++; } };
  };
  const operationalClientFactory = () => ({
    connect: async () => {},
    end: async () => {},
  });
  let tick = 0;
  return { state, options: { env: {}, ClientClass: Client, parseEnv, buildFn, auditFn,
    activateFn, operationalStartFn, operationalFinishFn, heartbeatFactory,
    operationalClientFactory,
    randomUUIDFn: () => "11111111-1111-4111-8111-111111111111",
    now: () => { tick += 10; return tick; },
    sleepFn: async (delayMs) => { state.calls.push(`sleep:${delayMs}`); } } };
}

test("manual refresh completes build audit activate and both postchecks", async () => {
  const { state, options } = fixture();
  const result = await runRefresh(options);
  assert.deepEqual(state.calls, ["connect", "build", "audit", "activate", "end"]);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "refresh");
  assert.equal(result.resumedReady, false);
  assert.equal(result.previousSnapshotId, previousSnapshotId);
  assert.equal(result.newSnapshotId, newSnapshotId);
  assert.equal(result.activeCount, 1);
  assert.equal(result.readyCount, 0);
  assert.equal(result.stableValidBookings, "403975");
  assert.equal(result.stableAssignedBookings, "403975");
  assert.equal(result.stableMissingBookings, "0");
  assert.equal(result.hotValidBookings, "12");
  assert.equal(result.stabilityWindowMinutes, 30);
  assert.equal(result.retentionAttempted, true);
  assert.equal(result.retentionDeleted, 0);
  assert.equal(result.retentionRemaining, 0);
  assert.equal(result.retentionLastDeletedSnapshotId, null);
  assert.equal(state.retentionCalls, 1);
  assert.equal(state.operationalStarts, 1);
  assert.equal(state.operationalFinishes.length, 1);
  assert.equal(state.operationalFinishes[0].success, true);
  assert.equal(state.operationalFinishes[0].retentionAttempted, true);
  assert.equal(state.heartbeatStops, 1);
  assert.equal(result.containsPii, false);
  assert.equal(result.readyAuditAttempts, 1);
  assert.equal(result.readyAuditRetried, false);
  const coverageQuery = state.queries.find(({ text }) => text.includes("as stable_valid_bookings"));
  assert.deepEqual(coverageQuery?.values, [newSnapshotId, 30]);
  for (const name of ["buildMs", "auditMs", "activateMs", "lifecyclePostcheckMs",
    "stableCoveragePostcheckMs", "postcheckMs", "retentionMs", "totalMs"]) {
    assert.equal(typeof result.timings[name], "number");
  }
  assert.deepEqual([...state.keyBytes], Array(32).fill(0));
  assert.equal(state.ended, 1);
});

test("build failure stops before audit and activation", async () => {
  const unsafe = new Error("sensitive message");
  unsafe.stack = "sensitive stack";
  const { state, options } = fixture({ buildError: unsafe });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false, code: "build_ready_failed", phase: "build-ready", activated: false,
    buildCode: "builder_failed", buildPhase: "initializing", committed: false,
  });
  assert.deepEqual(state.calls, ["connect", "build", "end"]);
  assert.equal(state.operationalFinishes.length, 1);
  assert.equal(state.operationalFinishes[0].success, false);
  assert.equal(state.operationalFinishes[0].errorCode, "build_ready_failed");
  assert.equal(state.retentionCalls, 0);
  assert.doesNotMatch(JSON.stringify(formatRefreshError(failure)), /sensitive message|sensitive stack/);
});

test("build failure preserves sanitized builder phase and PostgreSQL metadata", async () => {
  const databaseError = Object.assign(new Error("unsafe detail"), {
    code: "23514",
    constraint: "customer_related_review_groups_booking_count_check",
    table: "customer_related_review_groups",
    column: "booking_count",
  });
  const { state, options } = fixture({ buildError: databaseError });
  options.buildErrorFormatter = () => ({
    ok: false,
    code: "builder_failed",
    phase: "groups_insert",
    committed: false,
    dbCode: "23514",
    dbConstraint: "customer_related_review_groups_booking_count_check",
    dbTable: "customer_related_review_groups",
    dbColumn: "booking_count",
  });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false,
    code: "build_ready_failed",
    phase: "build-ready",
    activated: false,
    buildCode: "builder_failed",
    buildPhase: "groups_insert",
    committed: false,
    dbCode: "23514",
    dbConstraint: "customer_related_review_groups_booking_count_check",
    dbTable: "customer_related_review_groups",
    dbColumn: "booking_count",
  });
  assert.deepEqual(state.calls, ["connect", "build", "end"]);
  assert.equal(state.retentionCalls, 0);
});

test("BuildError metadata remains causal while the public refresh code stays compatible", async () => {
  const { state, options } = fixture({ buildError: new Error("not emitted") });
  options.buildErrorFormatter = () => ({
    ok: false,
    code: "source_or_link_anomaly",
    phase: "staging_audit",
    committed: false,
  });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false,
    code: "build_ready_failed",
    phase: "build-ready",
    activated: false,
    buildCode: "source_or_link_anomaly",
    buildPhase: "staging_audit",
    committed: false,
  });
  assert.deepEqual(state.calls, ["connect", "build", "end"]);
  assert.equal(state.operationalFinishes.length, 1);
  assert.equal(state.operationalFinishes[0].errorCode, "build_ready_failed");
});

test("operational heartbeat emits one pulse at a time and cleans its timer", async () => {
  let callback;
  let cleared = 0;
  let beats = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const heartbeat = createOperationalHeartbeat({
    beat: async () => { beats++; await pending; },
    intervalMs: 60_000,
    setIntervalFn: (fn, interval) => {
      assert.equal(interval, 60_000);
      callback = fn;
      return 17;
    },
    clearIntervalFn: (timer) => { assert.equal(timer, 17); cleared++; },
    onFailure: () => assert.fail("heartbeat should not fail"),
  });
  callback();
  callback();
  await Promise.resolve();
  assert.equal(beats, 1);
  release();
  await heartbeat.stop();
  assert.equal(cleared, 1);
});

test("transient heartbeat failure is sanitized and stop leaves no timer", async () => {
  let callback;
  let observed;
  let cleared = 0;
  const heartbeat = createOperationalHeartbeat({
    beat: async () => { throw Object.assign(new Error("password=secret"), { code: "08006" }); },
    setIntervalFn: (fn) => { callback = fn; return 21; },
    clearIntervalFn: () => { cleared++; },
    onFailure: (error) => { observed = error.code; },
  });
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  await heartbeat.stop();
  assert.equal(observed, "08006");
  assert.equal(cleared, 1);
});

test("operational RPC adapters preserve run CAS and safe finish telemetry", async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const client = { query: async (sql, values) => {
    calls.push({ sql, values });
    const status = sql.includes("refresh_finish") ? (values[1] ? "success" : "error") : null;
    return { rows: [{ result: { ok: true, runId, ...(status ? { status } : {}),
      containsPii: false } }] };
  } };
  await startOperationalRefresh({ client, runId });
  await heartbeatOperationalRefresh({ client, runId });
  await finishOperationalRefresh({ client, runId, success: false,
    errorCode: "ready_audit_failed", errorPhase: "ready-audit",
    retentionAttempted: false });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].values, [runId]);
  assert.deepEqual(calls[1].values, [runId]);
  assert.deepEqual(calls[2].values, [runId, false, "ready_audit_failed", "ready-audit",
    false, null, null, null]);
});

test("ready audit failure leaves the READY snapshot and never activates", async () => {
  const { state, options } = fixture({ auditError: new Error("sensitive") });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false, code: "ready_audit_failed", phase: "ready-audit", activated: false,
    newSnapshotId,
    readyAuditOk: false,
    readyAuditStatus: null,
    manifestMatch: null,
    countsMatch: null,
    anomalyCount: null,
    readyAuditCode: "ready_audit_failed",
    errorType: "Error",
    readyAuditAttempts: 1,
    readyAuditRetried: false,
  });
  assert.deepEqual(state.calls, ["connect", "build", "audit", "end"]);
});

function isolatedAuditFailure({ dbCode = "57014", phase = "overlap",
  code = "ready_audit_failed" } = {}) {
  const error = new Error("sensitive audit failure");
  error.readyAuditSafe = {
    ok: false,
    code,
    phase,
    dbCode,
    auditPhaseStarted: phase,
    auditPhaseDurationMs: 120_000,
  };
  error.auditPhase = phase;
  return error;
}

test("normal refresh retries one transient 57014 against the same READY then activates", async () => {
  const { state, options } = fixture();
  let auditCalls = 0;
  options.auditFn = async ({ snapshotId }) => {
    state.calls.push("audit");
    auditCalls++;
    assert.equal(snapshotId, newSnapshotId);
    assert.equal(state.lockHeld, true);
    if (auditCalls === 1) throw isolatedAuditFailure();
    return { ok: true, snapshotId, status: "ready", manifestMatch: true,
      countsMatch: true, anomalyCount: 0, containsPii: false };
  };
  options.sleepFn = async (delayMs) => {
    assert.equal(state.lockHeld, true);
    assert.equal(delayMs, 10_000);
    state.calls.push(`sleep:${delayMs}`);
  };
  const result = await runRefresh(options);
  assert.equal(result.ok, true);
  assert.equal(result.readyAuditAttempts, 2);
  assert.equal(result.readyAuditRetried, true);
  assert.equal(result.firstAuditDbCode, "57014");
  assert.equal(result.firstAuditPhase, "overlap");
  assert.equal(result.retryAuditOk, true);
  assert.equal(typeof result.retryAuditDurationMs, "number");
  assert.deepEqual(state.calls,
    ["connect", "build", "audit", "sleep:10000", "audit", "activate", "end"]);
  assert.equal(auditCalls, 2);
  assert.equal(state.queries.filter(({ text }) => text.includes("as target_ready_count")).length,
    1);
});

test("a second 57014 stops without activation and preserves the READY for manual recovery", async () => {
  const { state, options } = fixture();
  let auditCalls = 0;
  options.auditFn = async () => {
    state.calls.push("audit");
    auditCalls++;
    assert.equal(state.lockHeld, true);
    throw isolatedAuditFailure();
  };
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "ready_audit_failed");
  assert.equal(formatted.newSnapshotId, newSnapshotId);
  assert.equal(formatted.readyAuditAttempts, 2);
  assert.equal(formatted.readyAuditRetried, true);
  assert.equal(formatted.firstAuditDbCode, "57014");
  assert.equal(formatted.firstAuditPhase, "overlap");
  assert.equal(formatted.retryAuditOk, false);
  assert.equal(typeof formatted.retryAuditDurationMs, "number");
  assert.equal(state.calls.includes("activate"), false);
  assert.equal(auditCalls, 2);
});

test("non-57014 database failures never retry", async () => {
  const { state, options } = fixture();
  options.auditFn = async () => {
    state.calls.push("audit");
    throw isolatedAuditFailure({ dbCode: "28P01", phase: "contract" });
  };
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.readyAuditAttempts, 1);
  assert.equal(formatted.readyAuditRetried, false);
  assert.equal(formatted.firstAuditDbCode, "28P01");
  assert.deepEqual(state.calls, ["connect", "build", "audit", "end"]);
});

test("READY contract change during retry delay aborts before the second audit", async () => {
  const { state, options } = fixture({ retryContract: {
    ready_count: 0,
    target_ready_count: 0,
    target_active_count: 1,
    target_status: "active",
    target_activated_at: "2026-09-23T12:00:00.000Z",
    target_superseded_at: null,
  } });
  options.auditFn = async () => {
    state.calls.push("audit");
    throw isolatedAuditFailure();
  };
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "ready_audit_retry_snapshot_changed");
  assert.equal(formatted.readyAuditAttempts, 1);
  assert.equal(formatted.readyAuditRetried, true);
  assert.equal(state.calls.filter((call) => call === "audit").length, 1);
  assert.equal(state.calls.includes("activate"), false);
  assert.equal(state.lockHeld, false);
});

test("activation failure is safe and reports no automatic rollback", async () => {
  const { state, options } = fixture({ activateError: new Error("sensitive") });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false, code: "activate_failed", phase: "activate", activated: false,
    newSnapshotId,
  });
  assert.deepEqual(state.calls, ["connect", "build", "audit", "activate", "end"]);
});

test("stable coverage mismatch fails after committed activation without cleanup", async () => {
  const { state, options } = fixture({ stableMissing: "1" });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.ok, false);
  assert.equal(formatted.code, "stable_coverage_incomplete");
  assert.equal(formatted.phase, "postcheck");
  assert.equal(formatted.activated, true);
  assert.equal(formatted.newSnapshotId, newSnapshotId);
  assert.equal(formatted.committed, true);
  assert.equal(formatted.postcheckPhaseStarted, "stable_coverage");
  assert.equal(formatted.postcheckPhaseFinished, undefined);
  assert.equal(typeof formatted.postcheckPhaseDurationMs, "number");
  assert.deepEqual({ ...formatted,
    postcheckPhaseStarted: undefined,
    postcheckPhaseFinished: undefined,
    postcheckPhaseDurationMs: undefined,
  }, {
    ok: false, code: "stable_coverage_incomplete", phase: "postcheck", activated: true,
    newSnapshotId, committed: true,
    postcheckPhaseStarted: undefined,
    postcheckPhaseFinished: undefined,
    postcheckPhaseDurationMs: undefined,
  });
  assert.deepEqual(state.calls, ["connect", "build", "audit", "activate", "end"]);
  assert.equal(state.retentionCalls, 0);
  assert.doesNotMatch(source, /delete from|truncate|drop table|exec\(/i);
});

test("retention runs only after lifecycle and stable coverage while the main lock is held", async () => {
  const { state, options } = fixture();
  await runRefresh(options);
  const lifecycleIndex = state.queries.findIndex(({ text }) => text.includes("as target_active_count"));
  const coverageIndex = state.queries.findIndex(({ text }) => text.includes("as stable_valid_bookings"));
  const retentionIndex = state.queries.findIndex(({ text }) =>
    text.includes("customer_related_review_prune_superseded_v1_m2m"));
  const unlockIndex = state.queries.findIndex(({ text }) => text.includes("pg_advisory_unlock"));
  assert.ok(lifecycleIndex >= 0 && lifecycleIndex < coverageIndex);
  assert.ok(coverageIndex < retentionIndex && retentionIndex < unlockIndex);
  assert.equal(state.retentionCalls, 1);
  assert.equal(state.lockHeld, false);
});

test("retention is never called when an earlier refresh stage fails", async () => {
  const cases = [
    { buildError: new Error("build") },
    { auditError: new Error("audit") },
    { activateError: new Error("activate") },
    { lifecycleInvalid: true },
    { stableMissing: "1" },
  ];
  for (const scenario of cases) {
    const { state, options } = fixture(scenario);
    await assert.rejects(runRefresh(options));
    assert.equal(state.retentionCalls, 0);
  }
});

test("retention makes at most two calls and aggregates two deleted snapshots", async () => {
  const deletedOne = "70000000-0000-4000-8000-000000000001";
  const deletedTwo = "70000000-0000-4000-8000-000000000002";
  const { state, options } = fixture({ retentionResults: [
    { ok: true, deleted: 1, deletedSnapshotId: deletedOne,
      remainingSupersededBeyondRetention: 7, activeSnapshotId: newSnapshotId,
      containsPii: false },
    { ok: true, deleted: 1, deletedSnapshotId: deletedTwo,
      remainingSupersededBeyondRetention: 6, activeSnapshotId: newSnapshotId,
      containsPii: false },
    { ok: true, deleted: 1, deletedSnapshotId: "70000000-0000-4000-8000-000000000003",
      remainingSupersededBeyondRetention: 5, activeSnapshotId: newSnapshotId,
      containsPii: false },
  ] });
  const result = await runRefresh(options);
  assert.equal(state.retentionCalls, 2);
  assert.equal(result.retentionDeleted, 2);
  assert.equal(result.retentionRemaining, 6);
  assert.equal(result.retentionLastDeletedSnapshotId, deletedTwo);
  assert.equal(result.retentionAttempted, true);
});

test("a zero-delete retention result stops before the second call", async () => {
  const { state, options } = fixture({ retentionResults: [{
    ok: true, deleted: 0, deletedSnapshotId: null,
    remainingSupersededBeyondRetention: 0, activeSnapshotId: newSnapshotId,
    containsPii: false,
  }] });
  const result = await runRefresh(options);
  assert.equal(state.retentionCalls, 1);
  assert.equal(result.retentionDeleted, 0);
  assert.equal(result.retentionRemaining, 0);
});

test("retention failure is explicit after committed activation and releases the lock", async () => {
  const databaseError = Object.assign(new Error("sensitive retention detail"), {
    code: "55P03", detail: "private", hint: "secret",
  });
  const { state, options } = fixture({ retentionError: databaseError });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.ok, false);
  assert.equal(formatted.code, "retention_failed");
  assert.equal(formatted.phase, "retention");
  assert.equal(formatted.activated, true);
  assert.equal(formatted.committed, true);
  assert.equal(formatted.newSnapshotId, newSnapshotId);
  assert.equal(formatted.retentionAttempted, true);
  assert.equal(formatted.retentionDeleted, 0);
  assert.equal(formatted.retentionErrorCode, "55P03");
  assert.equal(formatted.dbCode, "55P03");
  assert.equal(typeof formatted.retentionDurationMs, "number");
  assert.doesNotMatch(JSON.stringify(formatted), /sensitive|private|secret/i);
  assert.equal(state.retentionCalls, 1);
  assert.equal(state.lockHeld, false);
  assert.equal(state.ended, 1);
});

test("postcheck database failures identify the exact unfinished subphase", async () => {
  const { options } = fixture();
  const BaseClient = options.ClientClass;
  options.ClientClass = class extends BaseClient {
    async query(sql, values = []) {
      if (sql.includes("as stable_valid_bookings")) {
        const error = new Error("sensitive SQL text");
        error.code = "57014";
        throw error;
      }
      return super.query(sql, values);
    }
  };
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "refresh_failed");
  assert.equal(formatted.phase, "postcheck");
  assert.equal(formatted.dbCode, "57014");
  assert.equal(formatted.postcheckPhaseStarted, "stable_coverage");
  assert.equal(formatted.postcheckPhaseFinished, undefined);
  assert.equal(typeof formatted.postcheckPhaseDurationMs, "number");
  assert.doesNotMatch(JSON.stringify(formatted), /sensitive SQL text|stack/i);
});

test("stable coverage is frozen at snapshot captured_at even after a late activation", () => {
  const capturedAtMinutes = 14 * 60 + 37;
  const activityAtMinutes = 14 * 60 + 20;
  const activatedAtMinutes = 14 * 60 + 57;
  const stabilityWindowMinutes = 30;
  assert.equal(activityAtMinutes <= capturedAtMinutes - stabilityWindowMinutes, false);
  assert.equal(activityAtMinutes <= activatedAtMinutes - stabilityWindowMinutes, true);
  assert.match(STABLE_COVERAGE_SQL,
    /snapshot\.captured_at[\s\S]*snapshot\.snapshot_id = \$1::uuid/);
  assert.match(STABLE_COVERAGE_SQL,
    /valid\.activity_at <= snapshot_clock\.captured_at[\s\S]*\$2::integer/);
  assert.doesNotMatch(STABLE_COVERAGE_SQL,
    /clock_timestamp\s*\(|current_timestamp|transaction_timestamp\s*\(|\bnow\s*\(/i);
  assert.doesNotMatch(source, /new Date\s*\(/);
});

test("coverage query keeps stable missing strict and hot bookings informational", () => {
  assert.match(STABLE_COVERAGE_SQL,
    /count\(\*\) filter \(where presence\.is_stable and not presence\.is_assigned\)/);
  assert.match(STABLE_COVERAGE_SQL,
    /where not is_stable\) as hot_valid_bookings/);
  assert.match(source, /check\(stableMissingBookings === "0", "stable_coverage_incomplete"\)/);
});

test("coverage comparison is plan-stable for a newly inserted snapshot UUID", () => {
  assert.match(STABLE_COVERAGE_SQL,
    /assignment_keys as materialized[\s\S]*where assignment\.snapshot_id = \$1::uuid/);
  assert.match(STABLE_COVERAGE_SQL,
    /from stable[\s\S]*union all[\s\S]*from assignment_keys assignment/);
  assert.match(STABLE_COVERAGE_SQL,
    /group by key_row\.source, key_row\.source_row_id/);
  assert.doesNotMatch(STABLE_COVERAGE_SQL,
    /from stable\s+(?:left\s+)?join public\.customer_analytical_booking_assignments/i);
});

test("coverage presence aggregation preserves assigned, missing and extra semantics", () => {
  const stable = new Set(["MCP_EAP:1", "MCP_EAP:2", "MCP_EAP:3"]);
  const assigned = new Set(["MCP_EAP:1", "MCP_EAP:3", "MCP_EAP:4"]);
  const allKeys = new Set([...stable, ...assigned]);
  const counts = [...allKeys].reduce((result, key) => ({
    stable: result.stable + Number(stable.has(key)),
    assigned: result.assigned + Number(stable.has(key) && assigned.has(key)),
    missing: result.missing + Number(stable.has(key) && !assigned.has(key)),
  }), { stable: 0, assigned: 0, missing: 0 });
  assert.deepEqual(counts, { stable: 3, assigned: 2, missing: 1 });
});

test("postcheck diagnostics remain read-only and isolate lifecycle and coverage plans", () => {
  for (const sql of [postcheckDiagnostics, postcheckCandidate]) {
    assert.match(sql, /begin transaction read only;/i);
    assert.match(sql, /set local statement_timeout = '10min';/i);
    assert.match(sql, /set local lock_timeout = '30s';/i);
    assert.match(sql, /explain \(analyze, buffers, verbose, settings, format text\)/i);
    assert.match(sql, /rollback;/i);
    assert.doesNotMatch(sql,
      /^\s*(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|commit)\b/im);
  }
  assert.match(postcheckDiagnostics,
    /e35be012-3399-4815-8d26-8a5612db265b[\s\S]*c4c9b384-e64d-45d7-a366-2d292a01f8c7/);
  assert.match(postcheckCandidate, /stable_assignment_presence as materialized/);
});

test("concurrent refresh is rejected before build", async () => {
  const { state, options } = fixture({ lock: false });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false, code: "refresh_already_running", phase: "preflight", activated: false,
    diagnosticCode: "refresh_lock_query",
  });
  assert.deepEqual(state.calls, ["connect", "end"]);
});

test("existing READY fails closed before build", async () => {
  const { state, options } = fixture({ readyCount: 1 });
  let failure;
  try { await runRefresh(options); } catch (error) { failure = error; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false, code: "ready_snapshot_already_exists", phase: "preflight", activated: false,
    diagnosticCode: "snapshot_contract_validation",
  });
  assert.deepEqual(state.calls, ["connect", "end"]);
});

test("standalone ready audit result continues to activation", async () => {
  const auditResult = {
    ok: true,
    snapshotId: newSnapshotId,
    status: "ready",
    manifestMatch: true,
    countsMatch: true,
    anomalyCount: 0,
    containsPii: false,
  };
  const { state, options } = fixture({ auditResult });
  const result = await runRefresh(options);
  assert.equal(result.ok, true);
  assert.deepEqual(state.calls, ["connect", "build", "audit", "activate", "end"]);
});

test("textual zero anomaly count is accepted explicitly", async () => {
  const { state, options } = fixture({ auditResult: {
    ok: true, snapshotId: newSnapshotId, status: "ready",
    manifestMatch: true, countsMatch: true, anomalyCount: "0", containsPii: false,
  } });
  const result = await runRefresh(options);
  assert.equal(result.ok, true);
  assert.equal(state.calls.includes("activate"), true);
});

for (const [name, patch] of [
  ["manifest mismatch", { manifestMatch: false }],
  ["count mismatch", { countsMatch: false }],
  ["positive anomaly count", { anomalyCount: 1 }],
  ["non-ready status", { status: "active" }],
]) {
  test(`ready audit ${name} stops before activation with safe diagnostics`, async () => {
    const auditResult = {
      ok: true, snapshotId: newSnapshotId, status: "ready",
      manifestMatch: true, countsMatch: true, anomalyCount: 0, ...patch,
    };
    const { state, options } = fixture({ auditResult });
    let failure;
    try { await runRefresh(options); } catch (error) { failure = error; }
    const formatted = formatRefreshError(failure);
    assert.equal(formatted.code, "ready_audit_failed");
    assert.equal(formatted.phase, "ready-audit");
    assert.equal(formatted.readyAuditOk, false);
    assert.equal(formatted.readyAuditStatus, auditResult.status);
    assert.equal(formatted.manifestMatch, auditResult.manifestMatch);
    assert.equal(formatted.countsMatch, auditResult.countsMatch);
    assert.equal(formatted.anomalyCount, auditResult.anomalyCount);
    assert.deepEqual(state.calls, ["connect", "build", "audit", "end"]);
  });
}

test("resume-ready audits and activates the existing READY without another build", async () => {
  const { state, options } = fixture({ readyCount: 1 });
  const result = await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  assert.equal(result.ok, true);
  assert.equal(result.resumedReady, true);
  assert.equal(result.newSnapshotId, newSnapshotId);
  assert.equal(result.timings.buildMs, 0);
  assert.equal(result.readyAuditAttempts, 1);
  assert.equal(result.readyAuditRetried, false);
  assert.deepEqual(state.calls, ["connect", "audit", "activate", "end"]);
});

test("resume-ready fails closed when the requested READY is not the installed READY", async () => {
  const otherReady = "11111111-1111-4111-8111-111111111111";
  const { state, options } = fixture({ readyCount: 1, readySnapshotId: otherReady });
  let failure;
  try {
    await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  } catch (error) { failure = error; }
  assert.equal(formatRefreshError(failure).code, "resume_ready_snapshot_mismatch");
  assert.deepEqual(state.calls, ["connect", "end"]);
});

test("resume-ready retries one transient 57014 against the same READY then activates", async () => {
  const { state, options } = fixture({ readyCount: 1 });
  let auditCalls = 0;
  options.auditFn = async ({ snapshotId }) => {
    state.calls.push("audit");
    auditCalls++;
    assert.equal(snapshotId, newSnapshotId);
    assert.equal(state.lockHeld, true);
    if (auditCalls === 1) throw isolatedAuditFailure();
    return { ok: true, snapshotId, status: "ready", manifestMatch: true,
      countsMatch: true, anomalyCount: 0, containsPii: false };
  };
  options.sleepFn = async (delayMs) => {
    assert.equal(state.lockHeld, true);
    assert.equal(delayMs, 10_000);
    state.calls.push(`sleep:${delayMs}`);
  };
  const result = await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  assert.equal(result.ok, true);
  assert.equal(result.resumedReady, true);
  assert.equal(result.readyAuditAttempts, 2);
  assert.equal(result.readyAuditRetried, true);
  assert.equal(result.firstAuditDbCode, "57014");
  assert.equal(result.firstAuditPhase, "overlap");
  assert.equal(result.retryAuditOk, true);
  assert.equal(typeof result.retryAuditDurationMs, "number");
  assert.deepEqual(state.calls,
    ["connect", "audit", "sleep:10000", "audit", "activate", "end"]);
  assert.equal(auditCalls, 2);
  assert.equal(state.queries.filter(({ text }) => text.includes("as target_ready_count")).length,
    1);
});

test("resume-ready stops after two 57014 audits without activation", async () => {
  const { state, options } = fixture({ readyCount: 1 });
  let auditCalls = 0;
  options.auditFn = async () => {
    state.calls.push("audit");
    auditCalls++;
    assert.equal(state.lockHeld, true);
    throw isolatedAuditFailure();
  };
  let failure;
  try {
    await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "ready_audit_failed");
  assert.equal(formatted.newSnapshotId, newSnapshotId);
  assert.equal(formatted.readyAuditAttempts, 2);
  assert.equal(formatted.readyAuditRetried, true);
  assert.equal(formatted.firstAuditDbCode, "57014");
  assert.equal(formatted.firstAuditPhase, "overlap");
  assert.equal(formatted.retryAuditOk, false);
  assert.equal(auditCalls, 2);
  assert.equal(state.calls.includes("activate"), false);
  assert.equal(state.queries.filter(({ text }) => text.includes("as target_ready_count")).length,
    1);
});

test("resume-ready does not retry a non-57014 ready audit failure", async () => {
  const { state, options } = fixture({ readyCount: 1 });
  options.auditFn = async () => {
    state.calls.push("audit");
    throw isolatedAuditFailure({ dbCode: "28P01", phase: "contract" });
  };
  let failure;
  try {
    await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.readyAuditAttempts, 1);
  assert.equal(formatted.readyAuditRetried, false);
  assert.equal(formatted.firstAuditDbCode, "28P01");
  assert.deepEqual(state.calls, ["connect", "audit", "end"]);
});

test("resume-ready aborts when the READY changes during the retry delay", async () => {
  const { state, options } = fixture({ readyCount: 1, retryContract: {
    ready_count: 0,
    target_ready_count: 0,
    target_active_count: 1,
    target_status: "active",
    target_activated_at: "2026-09-23T12:00:00.000Z",
    target_superseded_at: null,
  } });
  options.auditFn = async () => {
    state.calls.push("audit");
    assert.equal(state.lockHeld, true);
    throw isolatedAuditFailure();
  };
  let failure;
  try {
    await runRefresh({ ...options, resumeReadySnapshotId: newSnapshotId });
  } catch (error) { failure = error; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "ready_audit_retry_snapshot_changed");
  assert.equal(formatted.readyAuditAttempts, 1);
  assert.equal(formatted.readyAuditRetried, true);
  assert.equal(state.calls.filter((call) => call === "audit").length, 1);
  assert.equal(state.calls.includes("activate"), false);
});

function isolatedChild({ stdout = "", stderr = "", exitCode = 0 } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    child.stdout.end(stdout);
    child.stderr.end(stderr);
    child.emit("close", exitCode);
  });
  return child;
}

test("integrated ready audit uses the standalone script in an isolated process", async () => {
  let invocation;
  const result = await runReadyAuditIsolated({
    snapshotId: newSnapshotId,
    env: { SAFE_MARKER: "present" },
    execPath: "node-test",
    scriptPath: "ready-audit-test.mjs",
    spawnFn: (command, args, options) => {
      invocation = { command, args, options };
      return isolatedChild({ stdout: `${JSON.stringify({
        ok: true, snapshotId: newSnapshotId, status: "ready",
        manifestMatch: true, countsMatch: true, anomalyCount: 0, containsPii: false,
      })}\n`, stderr: `${JSON.stringify({
        event: "audit_session_settings",
        effectiveStatementTimeoutMs: 300_000,
        effectiveLockTimeoutMs: 30_000,
      })}\n` });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.effectiveStatementTimeoutMs, 300_000);
  assert.equal(result.effectiveLockTimeoutMs, 30_000);
  assert.equal(invocation.command, "node-test");
  assert.deepEqual(invocation.args, ["ready-audit-test.mjs", "--snapshot-id", newSnapshotId]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.env.SAFE_MARKER, "present");
});

test("isolated audit preserves safe 57014 phase telemetry only", async () => {
  let failure;
  try {
    await runReadyAuditIsolated({
      snapshotId: newSnapshotId,
      spawnFn: () => isolatedChild({ exitCode: 1, stderr: [
        JSON.stringify({ event: "audit_session_settings",
          effectiveStatementTimeoutMs: 300_000, effectiveLockTimeoutMs: 30_000 }),
        JSON.stringify({ event: "audit_phase", auditPhaseStarted: "contract" }),
        JSON.stringify({ event: "audit_phase", auditPhaseFinished: "contract",
          auditPhaseDurationMs: 10 }),
        JSON.stringify({ event: "audit_phase", auditPhaseStarted: "counts" }),
        JSON.stringify({ event: "audit_wait", snapshotId: newSnapshotId,
          auditPhase: "counts", auditPid: 4321, elapsedMs: 20_000,
          waitEventType: "Lock", waitEvent: "transactionid", blockingPids: [91, 90] }),
        JSON.stringify({ ok: false, code: "ready_audit_failed", phase: "counts",
          dbCode: "57014", auditPhaseDurationMs: 660000 }),
      ].join("\n") }),
    });
  } catch (error) { failure = error; }
  assert.deepEqual(failure.readyAuditSafe, {
    ok: false, code: "ready_audit_failed", phase: "counts", dbCode: "57014",
    auditPhaseDurationMs: 660000, auditPhaseStarted: "counts", auditPhaseFinished: "contract",
    auditPhase: "counts", auditPid: 4321, elapsedMs: 20_000,
    waitEventType: "Lock", waitEvent: "transactionid", blockingPids: [90, 91],
    effectiveStatementTimeoutMs: 300_000, effectiveLockTimeoutMs: 30_000,
  });
  assert.doesNotMatch(JSON.stringify(failure.readyAuditSafe), /password|database_url|sql|stack/i);
});

test("build resolves before isolated audit while the dedicated lock client stays open", async () => {
  const { state, options } = fixture();
  let buildClosed = false;
  options.buildFn = async () => {
    state.calls.push("build");
    buildClosed = true;
    return { ok: true, mode: "build-ready", committed: true, snapshotStatus: "ready",
      postCommitVerificationOk: true, snapshotId: newSnapshotId };
  };
  options.auditFn = async () => {
    assert.equal(buildClosed, true);
    assert.equal(state.ended, 0);
    state.calls.push("audit");
    return { ok: true, snapshotId: newSnapshotId, status: "ready",
      manifestMatch: true, countsMatch: true, anomalyCount: 0, containsPii: false };
  };
  await runRefresh(options);
  assert.deepEqual(state.calls, ["connect", "build", "audit", "activate", "end"]);
  assert.equal(state.queries.some(({ text }) => text.includes("pg_advisory_unlock")), true);
});

test("preflight connection failures expose only classified safe diagnostics", async () => {
  for (const [rawCode, expectedCode] of [
    ["28P01", "db_auth_failed"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "db_tls_failed"],
    ["ECONNREFUSED", "db_connect_failed"],
  ]) {
    const error = Object.assign(new Error("postgresql://user:secret@example.invalid/db"), {
      code: rawCode,
    });
    const { state, options } = fixture({ connectError: error });
    let failure;
    try { await runRefresh(options); } catch (caught) { failure = caught; }
    const formatted = formatRefreshError(failure);
    assert.equal(formatted.code, expectedCode);
    assert.equal(formatted.phase, "preflight");
    assert.equal(formatted.diagnosticCode, "database_connect");
    if (/^[A-Z0-9]{5}$/.test(rawCode)) assert.equal(formatted.dbCode, rawCode);
    assert.doesNotMatch(JSON.stringify(formatted), /secret|postgresql:/i);
    assert.deepEqual(state.calls, ["connect", "end"]);
  }
});

test("preflight environment errors preserve only certified parser codes", async () => {
  const { state, options } = fixture();
  options.parseEnv = () => {
    throw Object.assign(new Error("secret HMAC material"), { code: "invalid_hmac_key" });
  };
  let failure;
  try { await runRefresh(options); } catch (caught) { failure = caught; }
  const formatted = formatRefreshError(failure);
  assert.equal(formatted.code, "invalid_hmac_key");
  assert.equal(formatted.phase, "preflight");
  assert.equal(formatted.diagnosticCode, "environment");
  assert.doesNotMatch(JSON.stringify(formatted), /secret|HMAC material/i);
  assert.deepEqual(state.calls, []);
});

test("preflight SQL failures preserve SQLSTATE without query text or detail", async () => {
  const error = Object.assign(new Error("sensitive query detail"), {
    code: "42501", detail: "email@example.test", hint: "secret", where: "SQL body",
  });
  const { state, options } = fixture({ preflightQueryError: error });
  let failure;
  try { await runRefresh(options); } catch (caught) { failure = caught; }
  assert.deepEqual(formatRefreshError(failure), {
    ok: false,
    code: "preflight_query_failed",
    phase: "preflight",
    activated: false,
    diagnosticCode: "snapshot_contract_query",
    dbCode: "42501",
  });
  assert.deepEqual(state.calls, ["connect", "end"]);
});

test("refresh CLI accepts only default or explicit resume-ready UUID", () => {
  assert.deepEqual(parseRefreshArgs([]), { resumeReadySnapshotId: null });
  assert.deepEqual(parseRefreshArgs(["--resume-ready", newSnapshotId]), {
    resumeReadySnapshotId: newSnapshotId,
  });
  assert.throws(() => parseRefreshArgs(["--resume-ready", "invalid"]),
    /refresh_arguments_invalid/);
});

test("orchestrator reuses certified modules and emits no PII or secrets", () => {
  assert.match(source, /buildFn = runBuild/);
  assert.match(source, /auditFn = runReadyAuditIsolated/);
  assert.match(source, /customer-window-related-review-mcp-eap-v1-ready-audit\.mjs/);
  assert.match(source, /assertReadyAuditResult\(audit, newSnapshotId\)/);
  assert.match(source, /--resume-ready/);
  assert.match(source, /activateFn = runActivate/);
  assert.match(source, /buildFn\(\{ mode: "build-ready"/);
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(STABLE_COVERAGE_SQL, /\$2::integer \* interval '1 minute'/);
  assert.match(STABLE_COVERAGE_SQL, /greatest\(booking\.created_at, booking\.updated_at,[\s\S]*link\.created_at, link\.updated_at\)/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:DATABASE_URL|HMAC|password|email|phone|source_row_id)/i);
  assert.equal((source.match(/console\.log\(JSON\.stringify/g) ?? []).length, 1);
  assert.equal((source.match(/console\.error\(JSON\.stringify/g) ?? []).length, 3);
});
