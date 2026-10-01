import test from "node:test";
import assert from "node:assert/strict";
import {
  PREFLIGHT_CLOCK_SQL,
  PREFLIGHT_NOT_READY_SQL,
  PREFLIGHT_STRUCTURAL_SQL,
  runRelatedReviewPreflight,
  runRefresh,
  UPSTREAM_PREFLIGHT_SQL,
} from "./customer-window-related-review-mcp-eap-v1-refresh.mjs";

const PREVIOUS_SNAPSHOT = "11111111-1111-4111-8111-111111111111";
const NEW_SNAPSHOT = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const CAPTURED_AT = "2026-10-01T17:28:21.038917Z";
const STABILITY_CUTOFF_AT = "2026-10-01T16:43:21.038917Z";
const STABILITY_LAG_MINUTES = 45;

function preflight(overrides = {}) {
  return {
    preflightStatus: "ready",
    preflightReasonCode: "ready",
    preflightCapturedAt: CAPTURED_AT,
    preflightStabilityCutoffAt: STABILITY_CUTOFF_AT,
    stabilityLagMinutes: STABILITY_LAG_MINUTES,
    stabilityWindowMinutes: STABILITY_LAG_MINUTES,
    stableSourceRowsMcpEap: "406258",
    stableSourceRowsOkp: null,
    stableMissingLinksMcpEap: "0",
    stableMissingLinksOkp: null,
    activeWithoutMetrics: "0",
    changedDistinctRelevant: "0",
    duplicateSourceRows: "0",
    duplicateBookingLinks: "0",
    multipleLinks: "0",
    invalidProfileCount: "0",
    invalidResolverCount: "0",
    sourceCreatedAtMissing: "0",
    nullRepresentationCount: "0",
    okpScope: "not_evaluated_related_review_v1",
    ...overrides,
  };
}

function makeClient() {
  const queries = [];
  return class FakeClient {
    constructor() {
      this.queries = queries;
    }

    async connect() {}

    async end() {}

    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ acquired: true }] };
      if (/customer_related_review_snapshots snapshot/.test(sql)
        && /active_snapshot_id/.test(sql)) {
        return {
          rows: [{
            current_user: "customer_related_review_builder_login",
            session_user: "customer_related_review_builder_login",
            inherited_capability: true,
            snapshots_rls: true,
            active_count: 1,
            ready_count: 0,
            active_snapshot_id: PREVIOUS_SNAPSHOT,
            ready_snapshot_id: null,
            active_activated_at: "2026-10-01T16:55:38.912296Z",
          }],
        };
      }
      if (/LIFECYCLE/.test(sql) || /target_active_count/.test(sql)) {
        return {
          rows: [{
            active_count: 1,
            ready_count: 0,
            target_active_count: 1,
            previous_status: "superseded",
            previous_activated_at: "2026-10-01T16:55:38.912296Z",
            previous_superseded_at: "2026-10-01T17:30:00Z",
          }],
        };
      }
      if (/stable_valid_bookings/.test(sql)) {
        return {
          rows: [{
            stable_valid_bookings: "406258",
            stable_assigned_bookings: "406258",
            stable_missing_bookings: "0",
            hot_valid_bookings: "10",
          }],
        };
      }
      if (/pg_advisory_unlock/.test(sql)) return { rows: [{}] };
      throw new Error(`Unexpected query: ${sql.slice(0, 120)}`);
    }
  };
}

async function runScenario({
  preflightResult = preflight(),
  buildFn,
  operationalFinishes = [],
  env = {},
} = {}) {
  const ClientClass = makeClient();
  let buildCalls = 0;
  const result = await runRefresh({
    ClientClass,
    env,
    parseEnv: () => ({
      connection: {},
      keyBytes: Buffer.alloc(32),
      stabilityLagMinutes: preflightResult.stabilityLagMinutes,
    }),
    preflightFn: async () => preflightResult,
    buildFn: buildFn ?? (async ({ capturedAt }) => {
      buildCalls++;
      assert.equal(capturedAt, CAPTURED_AT);
      return {
        ok: true,
        mode: "build-ready",
        committed: true,
        snapshotStatus: "ready",
        postCommitVerificationOk: true,
        snapshotId: NEW_SNAPSHOT,
      };
    }),
    auditFn: async () => ({
      ok: true,
      snapshotId: NEW_SNAPSHOT,
      status: "ready",
      manifestMatch: true,
      countsMatch: true,
      anomalyCount: 0,
      effectiveStatementTimeoutMs: 300000,
      effectiveLockTimeoutMs: 30000,
    }),
    activateFn: async () => ({
      ok: true,
      mode: "activate",
      status: "active",
      committed: true,
      postCommitVerificationOk: true,
      previousActiveSnapshotId: PREVIOUS_SNAPSHOT,
    }),
    retentionFn: async () => ({
      ok: true,
      containsPii: false,
      deleted: 0,
      remainingSupersededBeyondRetention: 0,
      activeSnapshotId: NEW_SNAPSHOT,
      deletedSnapshotId: null,
    }),
    operationalStartFn: async ({ runId }) => ({
      ok: true,
      containsPii: false,
      runId,
      status: "running",
    }),
    operationalHeartbeatFn: async ({ runId }) => ({
      ok: true,
      containsPii: false,
      runId,
      status: "running",
    }),
    operationalFinishFn: async (payload) => {
      operationalFinishes.push(payload);
      return {
        ok: true,
        containsPii: false,
        runId: payload.runId,
        status: payload.success ? "success" : "error",
      };
    },
    heartbeatFactory: () => ({ stop: async () => {} }),
    operationalClientFactory: ({ ClientClass: OperationalClientClass }) =>
      new OperationalClientClass({}),
    randomUUIDFn: () => RUN_ID,
    now: (() => {
      let value = 0;
      return () => ++value;
    })(),
    sleepFn: async () => {},
  });
  return { result, buildCalls, operationalFinishes };
}

test("READY preflight invokes the builder with the same captured_at and lag contract", async () => {
  const { result, buildCalls } = await runScenario();
  assert.equal(buildCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.preflightStatus, "ready");
  assert.equal(result.preflightCapturedAt, CAPTURED_AT);
  assert.equal(result.stabilityLagMinutes, STABILITY_LAG_MINUTES);
  assert.equal(result.stabilityWindowMinutes, STABILITY_LAG_MINUTES);
  assert.equal(result.buildInvoked, true);
  assert.equal(result.newSnapshotId, NEW_SNAPSHOT);
});

for (const [name, overrides, reason] of [
  ["missing links", { stableMissingLinksMcpEap: "2", preflightStatus: "not_ready",
    preflightReasonCode: "stable_missing_links_mcp_eap" }, "stable_missing_links_mcp_eap"],
  ["metrics", { activeWithoutMetrics: "3", preflightStatus: "not_ready",
    preflightReasonCode: "active_without_metrics" }, "active_without_metrics"],
  ["changedDistinct", { changedDistinctRelevant: "5", preflightStatus: "not_ready",
    preflightReasonCode: "changed_distinct_relevant" }, "changed_distinct_relevant"],
]) {
  test(`NOT_READY ${name} skips builder and preserves the active snapshot`, async () => {
    const finishes = [];
    const { result, buildCalls } = await runScenario({
      preflightResult: preflight(overrides),
      operationalFinishes: finishes,
    });
    assert.equal(buildCalls, 0);
    assert.equal(result.ok, true);
    assert.equal(result.preflightStatus, "not_ready");
    assert.equal(result.preflightReasonCode, reason);
    assert.equal(result.activeSnapshotId, PREVIOUS_SNAPSHOT);
    assert.equal(result.newSnapshotId, undefined);
    assert.equal(result.buildInvoked, false);
    assert.equal(finishes.at(-1).success, true);
  });
}

test("structural preflight ERROR is a real failure and does not invoke the builder", async () => {
  const finishes = [];
  await assert.rejects(() => runScenario({
    preflightResult: preflight({
      preflightStatus: "error",
      preflightReasonCode: "structural_invariant",
      duplicateBookingLinks: "1",
    }),
    buildFn: async () => {
      throw new Error("builder should not run");
    },
    operationalFinishes: finishes,
  }), /preflight_structural_error/);
  assert.equal(finishes.at(-1).success, false);
});

test("race rows after the frozen cutoff are outside the preflight universe", () => {
  assert.match(UPSTREAM_PREFLIGHT_SQL, /<= \$1::timestamptz/);
  assert.match(UPSTREAM_PREFLIGHT_SQL, /transaction_timestamp\(\)::text as captured_at/);
  assert.match(PREFLIGHT_CLOCK_SQL, /pg_catalog\.make_interval\(mins => \$1::integer\)/);
  assert.match(UPSTREAM_PREFLIGHT_SQL, /stability_cutoff_at/);
});

test("45 minute lag excludes the 30 to 45 minute moving edge", () => {
  const capturedAt = Date.parse("2026-10-01T18:58:19Z");
  const cutoff45 = capturedAt - 45 * 60 * 1000;
  const movingEdge = Date.parse("2026-10-01T18:20:52Z");
  assert.equal(movingEdge <= capturedAt - 30 * 60 * 1000, true);
  assert.equal(movingEdge <= cutoff45, false);
});

test("45 minute lag still detects debt older than the safety cutoff", () => {
  const capturedAt = Date.parse("2026-10-01T18:58:19Z");
  const cutoff45 = capturedAt - 45 * 60 * 1000;
  const oldDebt = Date.parse("2026-10-01T18:12:00Z");
  assert.equal(oldDebt <= cutoff45, true);
});

test("preflight short-circuits structural checks when missing links make it NOT_READY", async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === PREFLIGHT_CLOCK_SQL) {
        assert.deepEqual(params, [STABILITY_LAG_MINUTES]);
        return {
          rows: [{
            captured_at: CAPTURED_AT,
            stability_cutoff_at: STABILITY_CUTOFF_AT,
            stability_lag_minutes: STABILITY_LAG_MINUTES,
          }],
        };
      }
      if (sql === PREFLIGHT_NOT_READY_SQL) {
        assert.deepEqual(params, [STABILITY_CUTOFF_AT]);
        return {
          rows: [{
            has_stable_missing_links_mcp_eap: true,
            has_active_without_metrics: false,
            has_changed_distinct_relevant: false,
          }],
        };
      }
      if (sql === PREFLIGHT_STRUCTURAL_SQL) {
        assert.fail("structural preflight should be skipped for upstream NOT_READY");
      }
      throw new Error("unexpected query");
    },
  };
  const result = await runRelatedReviewPreflight({ client });
  assert.equal(result.preflightStatus, "not_ready");
  assert.equal(result.preflightReasonCode, "stable_missing_links_mcp_eap");
  assert.equal(result.stableMissingLinksMcpEap, "1");
  assert.equal(result.nullRepresentationCount, "1");
  assert.equal(queries.length, 2);
});

test("preflight runs structural guards only after upstream checks are clear", async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === PREFLIGHT_CLOCK_SQL) {
        assert.deepEqual(params, [STABILITY_LAG_MINUTES]);
        return {
          rows: [{
            captured_at: CAPTURED_AT,
            stability_cutoff_at: STABILITY_CUTOFF_AT,
            stability_lag_minutes: STABILITY_LAG_MINUTES,
          }],
        };
      }
      if (sql === PREFLIGHT_NOT_READY_SQL) {
        assert.deepEqual(params, [STABILITY_CUTOFF_AT]);
        return {
          rows: [{
            has_stable_missing_links_mcp_eap: false,
            has_active_without_metrics: false,
            has_changed_distinct_relevant: false,
          }],
        };
      }
      if (sql === PREFLIGHT_STRUCTURAL_SQL) {
        assert.deepEqual(params, []);
        return {
          rows: [{
            has_duplicate_source_rows: false,
            has_duplicate_booking_links: false,
            has_multiple_links: false,
            has_invalid_profile_count: false,
            has_invalid_resolver_count: false,
            has_source_created_at_missing: false,
            has_null_representation_count: false,
          }],
        };
      }
      throw new Error("unexpected query");
    },
  };
  const result = await runRelatedReviewPreflight({ client });
  assert.equal(result.preflightStatus, "ready");
  assert.equal(result.preflightReasonCode, "ready");
  assert.equal(queries.length, 3);
});

test("builder failure after READY remains an ERROR", async () => {
  await assert.rejects(() => runScenario({
    buildFn: async ({ capturedAt }) => {
      assert.equal(capturedAt, CAPTURED_AT);
      throw new Error("synthetic builder failure");
    },
  }), /build_ready_failed/);
});
