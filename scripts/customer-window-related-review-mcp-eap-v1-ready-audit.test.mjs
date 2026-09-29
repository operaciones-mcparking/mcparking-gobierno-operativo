import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertReadyAuditResult, auditReadySnapshotWithClient, formatReadyAuditError,
  createAuditWatchdog,
  LEGACY_OVERLAP_SQL, OVERLAP_SQL,
  parseReadyAuditArgs, READY_AUDIT_LOCK_TIMEOUT_MS,
  READY_AUDIT_STATEMENT_TIMEOUT_MS, runReadyAudit,
} from "./customer-window-related-review-mcp-eap-v1-ready-audit.mjs";

const snapshotId = "11111111-1111-4111-8111-111111111111";
const manifest = "a".repeat(64);
const script = readFileSync(new URL("./customer-window-related-review-mcp-eap-v1-ready-audit.mjs",
  import.meta.url), "utf8");
const coreScript = readFileSync(new URL(
  "./customer-window-related-review-mcp-eap-v1-ready-audit-core.mjs", import.meta.url), "utf8");
const timeoutAudit = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_ready_audit_session_timeouts.sql",
  import.meta.url), "utf8");
const overlapDiagnostic = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_overlap_audit_diagnostics.sql",
  import.meta.url), "utf8");
const failingReadyOverlapDiagnostic = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_overlap_audit_e35be012_diagnostics.sql",
  import.meta.url), "utf8");
const waitDiagnostic = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_ready_audit_wait_diagnostics.sql",
  import.meta.url), "utf8");
const schemaMigration = readFileSync(new URL(
  "../supabase/migrations/20260917120000_add_customer_related_review_mcp_eap_v1_schema.sql",
  import.meta.url), "utf8");

function fakeAudit({ status = "ready", countMismatch = false, groupMismatch = false,
  metricMismatch = false, overlap = false, storedManifest = manifest,
  recomputedManifest = manifest } = {}) {
  const state = { queries: [], connectCount: 0, endCount: 0, configs: [] };
  class Client {
    constructor(config) {
      this.clientId = state.configs.length + 1;
      state.configs.push(config);
    }
    async connect() { state.connectCount++; }
    async end() { state.endCount++; }
    async query(sql, values = []) {
      const text = sql.trim().replace(/\s+/g, " ");
      state.queries.push({ text, values, clientId: this.clientId });
      if (text === "set statement_timeout = '300000ms'"
        || text === "set lock_timeout = '30000ms'") return { rows: [] };
      if (text === "show statement_timeout") {
        return { rows: [{ statement_timeout: "5min" }] };
      }
      if (text === "show lock_timeout") return { rows: [{ lock_timeout: "30s" }] };
      if (text === "select pg_catalog.pg_backend_pid() as audit_pid") {
        return { rows: [{ audit_pid: 4321 }] };
      }
      if (text.startsWith("select snapshot_id::text as snapshot_id")) return { rows: [{
        snapshot_id: snapshotId, status, rule_key: "RELATED_REVIEW_MCP_EAP_V1",
        key_id: "test-key-v1", manifest_sha256: storedManifest,
        valid_source_count: "2", confirmed_count: "1", related_count: "1",
        group_count: "1", anomaly_count: "0", active_profiles_without_metrics_count: "0",
        built_at: "2026-09-21T12:00:00.000Z",
      }] };
      if (text.includes("as assignment_count")) return { rows: [{
        group_count: "1", member_count: "1", assignment_count: countMismatch ? "3" : "2",
        metrics_count: "1", analytics_count: "1", contact_candidate_count: "1",
        confirmed_count: "1", related_count: "1",
      }] };
      if (text.includes("as bad_group_purity")) return { rows: [{
        bad_group_aggregates: groupMismatch ? "1" : "0",
        bad_group_purity: "0", bad_metrics: metricMismatch ? "1" : "0",
      }] };
      if (text.includes("as bad_contact_candidate_keys")) return { rows: [{
        bad_analytics: "0", bad_contact_candidate_keys: "0",
        bad_contact_candidate_contract: "0",
      }] };
      if (text.includes("as overlap_count")) return { rows: [{ overlap_count: overlap ? "1" : "0" }] };
      return { rows: [] };
    }
  }
  return {
    Client, state,
    options: {
      snapshotId, ClientClass: Client, buildConfig: () => ({}),
      hashManifestFn: async () => recomputedManifest,
    },
  };
}

test("CLI requires one valid snapshot UUID", () => {
  assert.equal(parseReadyAuditArgs(["--snapshot-id", snapshotId]), snapshotId);
  for (const args of [[], ["--snapshot-id"], ["--snapshot-id", "bad"], ["--all", snapshotId]]) {
    assert.throws(() => parseReadyAuditArgs(args), { code: "snapshot_id_required" });
  }
});

test("ready audit validates manifest and all reconciliations read-only", async () => {
  const fixture = fakeAudit();
  const result = await runReadyAudit(fixture.options);
  assert.deepEqual(result, {
    ok: true, snapshotId, status: "ready", manifestMatch: true,
    countsMatch: true, anomalyCount: 0, containsPii: false,
    effectiveStatementTimeoutMs: 300_000,
    effectiveLockTimeoutMs: 30_000,
  });
  assert.equal(fixture.state.connectCount, 1);
  assert.equal(fixture.state.endCount, 1);
  assert.equal(fixture.state.configs[0].application_name,
    "customer_related_review_ready_audit");
  assert.equal(fixture.state.queries.every((query) =>
    /^(?:select|with|set|show)\b/i.test(query.text)), true);
  assert.doesNotMatch(fixture.state.queries.map((query) => query.text).join("\n"),
    /\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b|\bcreate\b|\bdrop\b|\balter\b|\bcommit\b/i);
  assert.doesNotMatch(JSON.stringify(result), /email|phone|source_row|booking|profile/i);
});

test("ready audit applies and verifies session-only statement and lock timeouts", async () => {
  const fixture = fakeAudit();
  const observed = [];
  const result = await runReadyAudit({
    ...fixture.options,
    onSessionSettings: (settings) => observed.push(settings),
  });
  assert.equal(READY_AUDIT_STATEMENT_TIMEOUT_MS, 300_000);
  assert.equal(READY_AUDIT_LOCK_TIMEOUT_MS, 30_000);
  assert.deepEqual(observed, [{
    effectiveStatementTimeoutMs: 300_000,
    effectiveLockTimeoutMs: 30_000,
  }]);
  assert.equal(result.effectiveStatementTimeoutMs, 300_000);
  assert.equal(result.effectiveLockTimeoutMs, 30_000);
  assert.deepEqual(fixture.state.queries.slice(0, 4).map(({ text }) => text), [
    "set statement_timeout = '300000ms'",
    "set lock_timeout = '30000ms'",
    "show statement_timeout",
    "show lock_timeout",
  ]);
  assert.equal(fixture.state.endCount, 1);
  const allSql = fixture.state.queries.map(({ text }) => text).join("\n");
  assert.doesNotMatch(allSql, /alter\s+(?:role|database|system)|set\s+persistent/i);
});

test("ready audit rejects an ineffective session timeout before audit queries", async () => {
  const fixture = fakeAudit();
  const originalQuery = fixture.Client.prototype.query;
  fixture.Client.prototype.query = async function query(sql, values) {
    if (String(sql).trim().toLowerCase() === "show statement_timeout") {
      return { rows: [{ statement_timeout: "2min" }] };
    }
    return originalQuery.call(this, sql, values);
  };
  await assert.rejects(runReadyAudit(fixture.options), {
    code: "ready_audit_session_timeout_invalid",
  });
  assert.equal(fixture.state.queries.some(({ text }) =>
    text === "select pg_catalog.pg_backend_pid() as audit_pid"), false);
  assert.equal(fixture.state.endCount, 1);
});

test("watchdog client never receives the ready-audit session overrides", async () => {
  const fixture = fakeAudit();
  const originalQuery = fixture.Client.prototype.query;
  fixture.Client.prototype.query = async function query(sql, values) {
    if (this.clientId === 1 && String(sql).includes(
      "from public.customer_related_review_snapshots where snapshot_id")) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return originalQuery.call(this, sql, values);
  };
  await runReadyAudit({
    ...fixture.options,
    watchdogThresholdMs: 1,
    watchdogIntervalMs: 1000,
  });
  assert.equal(fixture.state.configs.length, 2);
  const settingQueries = fixture.state.queries.filter(({ text }) =>
    /^set (?:statement|lock)_timeout/.test(text));
  assert.equal(settingQueries.length, 2);
  assert.equal(settingQueries.every(({ clientId }) => clientId === 1), true);
  assert.equal(fixture.state.endCount, 2);
});

test("watchdog emits one safe wait event only after threshold and clears its timer", async () => {
  const timers = [];
  const cleared = [];
  const events = [];
  let clock = 1_000;
  const watchdog = createAuditWatchdog({
    snapshotId,
    auditPid: 4321,
    queryState: async () => ({
      wait_event_type: "Lock",
      wait_event: "transactionid",
      blocking_pids: [99, 88, 99],
      query: "must never be emitted",
    }),
    emit: (event) => events.push(event),
    thresholdMs: 20_000,
    intervalMs: 20_000,
    now: () => clock,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => cleared.push(timer),
  });
  watchdog.start("overlap");
  assert.equal(timers[0].delay, 20_000);
  assert.deepEqual(events, []);
  clock = 21_000;
  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{
    event: "audit_wait",
    snapshotId,
    auditPhase: "overlap",
    auditPid: 4321,
    elapsedMs: 20_000,
    waitEventType: "Lock",
    waitEvent: "transactionid",
    blockingPids: [88, 99],
  }]);
  assert.doesNotMatch(JSON.stringify(events), /query|must never|secret/i);
  watchdog.finish();
  await watchdog.close();
  assert.ok(cleared.length >= 1);
});

test("fast audit phases finish without opening the lazy watchdog connection", async () => {
  const fixture = fakeAudit();
  await runReadyAudit(fixture.options);
  assert.equal(fixture.state.connectCount, 1);
  assert.equal(fixture.state.configs.length, 1);
});

test("watchdog tolerates probe failure and leaves no scheduled timer after close", async () => {
  const timers = [];
  const cleared = new Set();
  const events = [];
  const watchdog = createAuditWatchdog({
    snapshotId,
    auditPid: 4321,
    queryState: async () => { throw new Error("simulated-secret"); },
    emit: (event) => events.push(event),
    thresholdMs: 20_000,
    intervalMs: 20_000,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => cleared.add(timer),
  });
  watchdog.start("groups_metrics");
  timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  await watchdog.close();
  assert.deepEqual(events, []);
  assert.equal(timers.slice(1).every((timer) => cleared.has(timer)), true);
});

test("shared ready audit contract accepts numeric and textual zero only", () => {
  const valid = {
    ok: true, snapshotId, status: "ready", manifestMatch: true,
    countsMatch: true, anomalyCount: 0, containsPii: false,
  };
  assert.equal(assertReadyAuditResult(valid, snapshotId), valid);
  assert.equal(assertReadyAuditResult({ ...valid, anomalyCount: "0" }, snapshotId).anomalyCount,
    "0");
  for (const patch of [
    { anomalyCount: 1 },
    { anomalyCount: "1" },
    { manifestMatch: false },
    { countsMatch: false },
    { status: "active" },
  ]) {
    assert.throws(() => assertReadyAuditResult({ ...valid, ...patch }, snapshotId),
      { code: "ready_audit_contract_failed" });
  }
  assert.throws(() => assertReadyAuditResult(valid,
    "22222222-2222-4222-8222-222222222222"), { code: "ready_audit_snapshot_mismatch" });
});

for (const [label, options, code] of [
  ["count mismatch", { countMismatch: true }, "snapshot_count_mismatch"],
  ["non-ready status", { status: "active" }, "snapshot_not_ready"],
  ["group mismatch", { groupMismatch: true }, "group_reconciliation_failed"],
  ["metric mismatch", { metricMismatch: true }, "metric_reconciliation_failed"],
  ["overlap", { overlap: true }, "confirmed_related_overlap"],
  ["manifest mismatch", { recomputedManifest: "b".repeat(64) }, "manifest_mismatch"],
]) {
  test(`ready audit detects ${label}`, async () => {
    const fixture = fakeAudit(options);
    let failure;
    try { await runReadyAudit(fixture.options); } catch (error) { failure = error; }
    assert.equal(failure?.code, code);
    assert.equal(fixture.state.connectCount, 1);
    assert.equal(fixture.state.endCount, 1);
    const output = formatReadyAuditError(failure, failure?.auditPhase);
    assert.equal(output.ok, false);
    assert.equal(output.code, code);
    assert.doesNotMatch(JSON.stringify(output), /password|stack|detail|query|unit@example/);
  });
}

test("ready audit source contains no write path", () => {
  assert.doesNotMatch(coreScript,
    /client\.query\(\s*["'`]\s*(?:insert|update|delete|merge|create|drop|alter|commit|rollback)\b/i);
  assert.match(coreScript, /hashManifestFn\(client, snapshotId, snapshot\.key_id\)/);
  assert.doesNotMatch(coreScript, /client\.connect\(|client\.end\(|new Client/);
  assert.match(script, /await client\.connect\(\)/);
  assert.match(script, /await client\.end\(\)/);
  assert.match(script, /customer_related_review_ready_audit/);
  assert.match(script, /customer_related_review_ready_audit_watchdog/);
  assert.doesNotMatch(script, /pg_(?:try_)?advisory_(?:xact_)?lock/);
  assert.doesNotMatch(script, /alter\s+(?:role|database|system)|set\s+persistent/i);
  assert.match(script, /set statement_timeout = '\$\{READY_AUDIT_STATEMENT_TIMEOUT_MS\}ms'/);
  assert.match(script, /set lock_timeout = '\$\{READY_AUDIT_LOCK_TIMEOUT_MS\}ms'/);
});

test("live wait diagnostic exposes activity, locks, and blocker PIDs without query text", () => {
  assert.match(waitDiagnostic, /^begin transaction read only;/m);
  assert.match(waitDiagnostic, /from pg_catalog\.pg_stat_activity activity/);
  assert.match(waitDiagnostic, /from pg_catalog\.pg_locks lock/);
  assert.match(waitDiagnostic, /pg_catalog\.pg_blocking_pids/);
  assert.match(waitDiagnostic, /wait_event_type/);
  assert.match(waitDiagnostic, /wait_event/);
  assert.doesNotMatch(waitDiagnostic, /activity\.query\b|select[\s\S]*\bquery\s*,/i);
  assert.doesNotMatch(waitDiagnostic,
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|commit)\b/i);
  assert.match(waitDiagnostic, /^rollback;$/m);
});

test("embedded ready audit uses an externally owned connected client", async () => {
  const fixture = fakeAudit();
  const client = new fixture.Client();
  await client.connect();
  const phases = [];
  const finished = [];
  const result = await auditReadySnapshotWithClient(client, snapshotId, {
    hashManifestFn: async () => manifest,
    onPhase: (phase) => phases.push(phase),
    onPhaseFinished: (phase, durationMs) => finished.push({ phase, durationMs }),
  });
  assert.equal(result.result.ok, true);
  assert.deepEqual(phases, ["contract", "counts", "groups_metrics", "groups_analytics", "overlap", "manifest"]);
  assert.deepEqual(finished.map(({ phase }) => phase), phases);
  assert.equal(finished.every(({ durationMs }) => Number.isSafeInteger(durationMs)
    && durationMs >= 0), true);
  assert.equal(fixture.state.connectCount, 1);
  assert.equal(fixture.state.endCount, 0);
  await client.end();
  assert.equal(fixture.state.endCount, 1);
});

test("query cancellation identifies the exact audit phase without SQL or data", async () => {
  const fixture = fakeAudit();
  const originalQuery = fixture.Client.prototype.query;
  fixture.Client.prototype.query = async function query(sql, values) {
    if (String(sql).includes("as bad_group_purity")) {
      throw Object.assign(new Error("secret SQL and data"), { code: "57014" });
    }
    return originalQuery.call(this, sql, values);
  };
  let tick = 0;
  let failure;
  try {
    await runReadyAudit({ ...fixture.options, now: () => { tick += 25; return tick; } });
  } catch (error) { failure = error; }
  const output = formatReadyAuditError(failure, failure?.auditPhase);
  assert.equal(output.phase, "groups_metrics");
  assert.equal(output.auditPhaseStarted, "groups_metrics");
  assert.equal(output.dbCode, "57014");
  assert.equal(output.auditPhaseDurationMs, 25);
  assert.doesNotMatch(JSON.stringify(output), /secret|SQL and data|stack|query/i);
});

test("lock timeout preserves SQLSTATE with a safe diagnostic code", () => {
  const output = formatReadyAuditError(Object.assign(new Error("sensitive lock detail"), {
    code: "55P03",
  }), "overlap");
  assert.equal(output.dbCode, "55P03");
  assert.equal(output.diagnosticCode, "lock_timeout");
  assert.doesNotMatch(JSON.stringify(output), /sensitive|detail|stack|query/i);
});

test("session timeout diagnostic is catalog-only and read-only", () => {
  for (const setting of ["statement_timeout", "lock_timeout",
    "idle_in_transaction_session_timeout"]) {
    assert.match(timeoutAudit, new RegExp(`'${setting}'`));
  }
  assert.match(timeoutAudit, /from pg_catalog\.pg_settings/);
  assert.match(timeoutAudit, /setting\.source/);
  assert.match(timeoutAudit, /setting\.context/);
  assert.doesNotMatch(timeoutAudit, /sourcecontext/);
  assert.doesNotMatch(timeoutAudit,
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|commit|rollback)\b/i);
});

function legacyOverlap(assignments, members, snapshot) {
  return assignments.filter((assignment) => assignment.snapshot === snapshot
    && assignment.type === "confirmed_customer").reduce((count, assignment) => count
      + members.filter((member) => member.snapshot === assignment.snapshot
        && member.source === assignment.source && member.row === assignment.row).length, 0);
}

function planStableOverlap(assignments, members, snapshot) {
  const sidesByKey = new Map();
  for (const member of members.filter((row) => row.snapshot === snapshot)) {
    sidesByKey.set(`${member.source}:${member.row}`, new Set([1]));
  }
  for (const assignment of assignments.filter((row) => row.snapshot === snapshot
    && row.type === "confirmed_customer")) {
    const key = `${assignment.source}:${assignment.row}`;
    const sides = sidesByKey.get(key) ?? new Set();
    sides.add(2);
    sidesByKey.set(key, sides);
  }
  return [...sidesByKey.values()].filter((sides) => sides.has(1) && sides.has(2)).length;
}

test("plan-stable overlap preserves the exact legacy count for zero and positive overlap", () => {
  const fixtures = [
    { assignments: [], members: [] },
    {
      assignments: [
        { snapshot: "s1", source: "MCP_EAP", row: 1, type: "confirmed_customer" },
        { snapshot: "s1", source: "MCP_EAP", row: 2, type: "confirmed_customer" },
        { snapshot: "s1", source: "MCP_EAP", row: 3, type: "related_review" },
        { snapshot: "s2", source: "MCP_EAP", row: 4, type: "confirmed_customer" },
      ],
      members: [
        { snapshot: "s1", source: "MCP_EAP", row: 2 },
        { snapshot: "s1", source: "MCP_EAP", row: 3 },
        { snapshot: "s2", source: "MCP_EAP", row: 4 },
      ],
    },
    {
      assignments: [1, 2, 3].map((row) => ({
        snapshot: "s1", source: "MCP_EAP", row, type: "confirmed_customer",
      })),
      members: [1, 2].map((row) => ({ snapshot: "s1", source: "MCP_EAP", row })),
    },
  ];
  for (const fixture of fixtures) {
    assert.equal(planStableOverlap(fixture.assignments, fixture.members, "s1"),
      legacyOverlap(fixture.assignments, fixture.members, "s1"));
  }
  assert.equal(planStableOverlap(fixtures[0].assignments, fixtures[0].members, "s1"), 0);
  assert.equal(planStableOverlap(fixtures[1].assignments, fixtures[1].members, "s1"), 1);
  assert.equal(planStableOverlap(fixtures[2].assignments, fixtures[2].members, "s1"), 2);
});

test("plan-stable overlap consumes each side once without a correlated join", () => {
  assert.match(LEGACY_OVERLAP_SQL,
    /from public\.customer_analytical_booking_assignments assignment[\s\S]*join public\.customer_related_review_members member/);
  assert.match(OVERLAP_SQL,
    /from public\.customer_related_review_members member[\s\S]*member\.snapshot_id = \$1/);
  assert.match(OVERLAP_SQL,
    /union all[\s\S]*from public\.customer_analytical_booking_assignments assignment[\s\S]*assignment\.snapshot_id = \$1/);
  assert.match(OVERLAP_SQL,
    /group by signal\.source, signal\.source_row_id[\s\S]*min\(signal\.side\) = 1[\s\S]*max\(signal\.side\) = 2/);
  assert.doesNotMatch(OVERLAP_SQL, /\bjoin\b|\bexists\b|\bintersect\b/i);
  assert.match(schemaMigration,
    /customer_related_review_members_pkey\s+primary key \(snapshot_id, source, source_row_id\)/);
  assert.match(schemaMigration,
    /customer_analytical_booking_assignments_pkey\s+primary key \(snapshot_id, source, source_row_id\)/);
});

test("overlap diagnostic is read-only, reversible, and compares both measured plans", () => {
  assert.match(overlapDiagnostic, /^begin transaction read only;/m);
  assert.match(overlapDiagnostic, /set local statement_timeout = '10min'/);
  assert.equal((overlapDiagnostic.match(/explain \(analyze, buffers, verbose, settings/g)
    ?? []).length, 2);
  assert.match(overlapDiagnostic, /overlap_parity_ok/);
  assert.match(overlapDiagnostic, /pg_catalog\.pg_get_indexdef/);
  for (const column of ["name", "setting", "unit", "context", "source", "sourcefile",
    "sourceline", "pending_restart"]) {
    assert.match(overlapDiagnostic, new RegExp(`setting\\.${column}`));
  }
  assert.match(overlapDiagnostic, /'pg_catalog\.pg_settings'::pg_catalog\.regclass/);
  assert.doesNotMatch(overlapDiagnostic, /sourcecontext/);
  assert.match(overlapDiagnostic, /^rollback;$/m);
  assert.doesNotMatch(overlapDiagnostic,
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|commit)\b/i);
});

test("failing READY diagnostic preserves the pre-fix query that produced the bad plan", () => {
  const failingSnapshot = "e35be012-3399-4815-8d26-8a5612db265b";
  const historicalSnapshot = "81497e21-dd74-4c13-bda4-ffd20822d76c";
  const measuredSection = failingReadyOverlapDiagnostic.slice(
    failingReadyOverlapDiagnostic.indexOf("-- 10 measured failing READY"));
  const measuredQuery = measuredSection.match(
    /explain \(analyze, buffers, verbose, settings, format text\)\s+([\s\S]*?);\s+rollback;/)?.[1];
  const normalizeSql = (sql) => sql?.replace(/\s+/g, " ").trim();
  assert.match(normalizeSql(measuredQuery),
    /from public\.customer_related_review_members member where member\.snapshot_id/);
  assert.match(normalizeSql(measuredQuery), /and exists \( select 1/);
  assert.match(failingReadyOverlapDiagnostic, /^begin transaction read only;$/m);
  assert.match(failingReadyOverlapDiagnostic, /set local statement_timeout = '10min'/);
  assert.match(failingReadyOverlapDiagnostic, /set local lock_timeout = '30s'/);
  for (const setting of ["statement_timeout", "lock_timeout", "work_mem", "jit"]) {
    assert.match(failingReadyOverlapDiagnostic, new RegExp(`show ${setting};`));
  }
  for (const snapshot of [failingSnapshot, historicalSnapshot]) {
    assert.match(failingReadyOverlapDiagnostic, new RegExp(snapshot, "g"));
  }
  for (const count of ["member_count", "assignment_count", "confirmed_assignment_count",
    "related_assignment_count"]) {
    assert.match(failingReadyOverlapDiagnostic, new RegExp(count));
  }
  assert.equal((failingReadyOverlapDiagnostic.match(
    /explain \(analyze, buffers, verbose, settings, format text\)/g) ?? []).length, 2);
  assert.match(failingReadyOverlapDiagnostic, /pg_catalog\.pg_get_indexdef/);
  assert.match(failingReadyOverlapDiagnostic, /pg_catalog\.pg_stat_all_tables/);
  assert.match(failingReadyOverlapDiagnostic, /pg_catalog\.pg_policy/);
  assert.match(failingReadyOverlapDiagnostic, /^rollback;$/m);
  assert.doesNotMatch(failingReadyOverlapDiagnostic,
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|commit)\b/i);
});

test("measured candidate SQL contains the exact chosen production query", () => {
  const failingSnapshot = "e35be012-3399-4815-8d26-8a5612db265b";
  const candidateDiagnostic = readFileSync(new URL(
    "../supabase/debug/customer_window_related_review_overlap_plan_stable_candidates.sql",
    import.meta.url), "utf8");
  const chosenSection = candidateDiagnostic.slice(candidateDiagnostic.indexOf(
    "-- 05 measured UNION ALL plus grouping, failing READY"));
  const chosenQuery = chosenSection.match(
    /explain \(analyze, buffers, verbose, settings, format text\)\s+([\s\S]*?);\s+rollback;/)?.[1];
  const expected = OVERLAP_SQL.replaceAll("$1", `'${failingSnapshot}'::uuid`);
  const normalizeSql = (sql) => sql?.replace(/\s+/g, " ").trim();
  assert.equal(normalizeSql(chosenQuery), normalizeSql(expected));
  assert.match(candidateDiagnostic, /alternatives_parity_ok/);
  assert.doesNotMatch(candidateDiagnostic,
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|commit)\b/i);
});
