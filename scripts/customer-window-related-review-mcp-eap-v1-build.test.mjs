import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  formatBuilderError, frameSegment, groupId, manifestPageSql,
  parseBuilderEnv, parseBuildArgs, parseDryRunArgs, runActivate, runBuild, runDryRun,
} from "./customer-window-related-review-mcp-eap-v1-build.mjs";
import { auditReadySnapshotWithClient } from
  "./customer-window-related-review-mcp-eap-v1-ready-audit-core.mjs";

const RULE = "RELATED_REVIEW_MCP_EAP_V1";
const fakeKey = Buffer.alloc(32, 7);
const env = {
  RELATED_REVIEW_DATABASE_URL:
    "postgresql://customer_related_review_builder_login:fake-password@localhost:5432/postgres?sslmode=verify-full",
  RELATED_REVIEW_HMAC_KEY: fakeKey.toString("base64"),
  RELATED_REVIEW_HMAC_KEY_ID: "test-key-v1",
};
const group = groupId(RULE, "EXACT_EMAIL", "unit@example.invalid", fakeKey);
const script = readFileSync(new URL("./customer-window-related-review-mcp-eap-v1-build.mjs", import.meta.url),
  "utf8");
const builderAccessMigration = readFileSync(new URL(
  "../supabase/migrations/20260917130000_add_customer_related_review_builder_access.sql",
  import.meta.url), "utf8");

test("CLI accepts only explicit build modes and preflights build secrets", () => {
  assert.equal(parseDryRunArgs(["--dry-run"]), "dry-run");
  assert.deepEqual(parseBuildArgs(["--build-ready"]), { mode: "build-ready", snapshotId: null });
  assert.deepEqual(parseBuildArgs(["--activate", "--snapshot-id",
    "48D075B3-C8DC-49C3-BED7-DAF02F29FBAB"]), {
    mode: "activate", snapshotId: "48d075b3-c8dc-49c3-bed7-daf02f29fbab",
  });
  for (const args of [[], ["--activate"], ["--activate", "--snapshot-id", "bad"],
    ["--dry-run", "--all"]]) {
    assert.throws(() => parseBuildArgs(args), { code: "build_mode_required" });
  }
  assert.throws(() => parseBuilderEnv({}), /missing_database_url/);
  assert.throws(() => parseBuilderEnv({ ...env, RELATED_REVIEW_HMAC_KEY: "bad" }),
    { code: "invalid_hmac_key" });
  assert.throws(() => parseBuilderEnv({ ...env, RELATED_REVIEW_HMAC_KEY_ID: " " }),
    { code: "invalid_hmac_key_id" });
});

test("HMAC vector uses length-framed UTF-8 and lowercase SHA-256", () => {
  const framed = Buffer.concat([frameSegment(RULE), frameSegment("EXACT_EMAIL"),
    frameSegment("unit@example.invalid")]);
  assert.equal(framed.readUInt32BE(0), Buffer.byteLength(RULE));
  assert.equal(group, createHmac("sha256", fakeKey).update(framed).digest("hex"));
  assert.match(group, /^[0-9a-f]{64}$/);
  assert.notEqual(group, groupId(RULE, "NO_EMAIL_SOURCE_ROW", "MCP_EAP:2", fakeKey));
  assert.notEqual(group, groupId(RULE, "EXACT_EMAIL", "unit@example.invalid", Buffer.alloc(32, 8)));
  assert.equal(frameSegment(null).readUInt32BE(0), 0xffffffff);
  assert.throws(() => groupId(RULE, "EXACT_EMAIL", "", fakeKey), { code: "invalid_group_input" });
});

test("manifest SQL is keyset paged and excludes raw identity values", () => {
  for (const type of ["A", "G", "M", "R"]) {
    const section = { type, table: {
      A: "customer_analytical_booking_assignments", G: "customer_related_review_groups",
      M: "customer_related_review_members", R: "customer_related_review_metrics",
    }[type], order: type === "A" || type === "M" ? "source, source_row_id" : "group_id" };
    const sql = manifestPageSql(section);
    assert.match(sql, /limit \$3::integer/);
    assert.doesNotMatch(sql, /\boffset\b|email_normalized|phone_normalized|source_customer_id/);
  }
  assert.match(script, /create temp table rr_source on commit drop/);
  assert.match(script, /booking\.booking_status in \(1, 8\)/);
  assert.match(script, /then 'confirmed_customer'/);
  assert.match(script, /then 'related_review'/);
  assert.ok(/booking_link_id is not null and \(resolver_version is null\s*or resolver_version not in \('customer_identity_v1', 'customer_identity_v2'\)\)/
    .test(script));
  assert.match(script, /grp\.v1_booking_count \+ grp\.v2_booking_count <> grp\.booking_count/);
  assert.match(script, /count\(distinct h\.key_kind\) <> 1/);
  assert.match(script, /bad_metric_dates/);
  for (const field of ["booking_count", "profile_count", "email_count", "phone_count",
    "source_customer_count", "conflict_count", "candidate_count", "v1_count", "v2_count",
    "first_purchase_at", "last_purchase_at"]) {
    assert.ok(script.slice(script.indexOf("const EXPECTED_GROUPS_SQL"),
      script.indexOf("const EXPECTED_ASSIGNMENTS_SQL"))
      .includes(`as ${field}`));
  }
  assert.match(script, /from rr_expected_assignments expected\s+full join actual using \(source, source_row_id\)/);
  assert.match(script, /from rr_expected_members expected\s+full join actual using \(source, source_row_id\)/);
  assert.match(script, /from rr_expected_groups expected full join actual using \(group_id\)/);
  assert.match(script, /join rr_actual_members member using \(source, source_row_id\)/);
  assert.doesNotMatch(script, /exists \(select 1 from public\.customer_related_review_members/);
  assert.match(script, /expected_row_id is null or actual_row_id is null\s+or actual_booking_link_id is distinct from expected_booking_link_id/);
  assert.match(script, /actual_representation_type is distinct from expected_representation_type/);
  assert.match(script, /actual_group_id is distinct from expected_group_id/);
  assert.match(script, /actual_profile_id is distinct from expected_profile_id/);
  assert.match(script, /grp\.key_kind = 'EXACT_EMAIL' and grp\.email_count <> 1/);
  assert.match(script, /grp\.key_kind = 'NO_EMAIL_SOURCE_ROW'[\s\S]*grp\.booking_count <> 1 or grp\.email_count <> 0/);
  assert.equal((script.match(/client\.query\("COMMIT"\)/g) || []).length, 1);
  assert.doesNotMatch(script, /customer_window_bookings_v|customer_identity_links|customer_identity_resolution_events/);
  assert.equal((script.match(/pg_catalog\.transaction_timestamp\(\)/g) || []).length, 1);
  assert.match(script, /clock\.captured_at - interval '\$\{STABILITY_WINDOW_MINUTES\} minutes'/);
  assert.match(script, /greatest\(booking\.created_at, booking\.updated_at,\s*booking\.source_synced_at, link\.created_at, link\.updated_at\)/);
  assert.match(script, /\$\{ACTIVITY_AT_SQL\} > cutoff\.stability_cutoff_at/);
  assert.match(script, /\$\{ACTIVITY_AT_SQL\} <= cutoff\.stability_cutoff_at/);
  assert.match(script, /cross join rr_cutoff cutoff/g);
});

function operationalStage({ bookingAt, linkAt = null, hasLink = true,
  resolverVersion = "customer_identity_v2", hasMetrics = true }) {
  const cutoff = Date.parse("2026-09-17T11:30:00Z");
  const activityAt = Math.max(Date.parse(bookingAt), linkAt ? Date.parse(linkAt) : 0);
  const hot = activityAt > cutoff;
  return {
    hotCount: hot ? "1" : "0",
    extraRows: hot ? 0 : 1,
    anomalous: !hot && (!hasLink || !["customer_identity_v1", "customer_identity_v2"]
      .includes(resolverVersion) || !hasMetrics),
    unexpectedResolver: !hot && hasLink
      && !["customer_identity_v1", "customer_identity_v2"].includes(resolverVersion),
    activeWithoutMetrics: !hot && hasLink && !hasMetrics,
  };
}

function fakeBuilder({ anomaly = false, duplicateSourceRow = false,
  resolverVersion = "customer_identity_v1", groupResolverMismatch = false,
  insertError = false, pidChanges = false, queryFailure = null, operationalCase = null,
  auditOverride = {}, readyCount = 0, activeCount = 0, supersededCount = 0,
  postCommitMismatch = false } = {}) {
  const state = { queries: [], ended: false, config: null, readyHash: null,
    snapshotId: null, keyId: null, hmacPages: 0, verifyPages: 0 };
  class Client {
    constructor(config) { state.config = config; }
    async connect() {}
    async end() { state.ended = true; }
    async query(sql, values = []) {
      const text = sql.trim().replace(/\s+/g, " ");
      state.queries.push({ text, values });
      if (queryFailure && text.includes(queryFailure.match)) throw queryFailure.error;
      if (text.includes("as hot_valid_source_count")) return { rows: [{
        hot_valid_source_count: operationalCase?.hotCount ?? "0",
      }] };
      if (text.includes("select current_user as current_user")) return { rows: [{
        current_user: "customer_related_review_builder_login",
        session_user: "customer_related_review_builder_login",
        inherited_capability: true,
        source_rls: true, links_rls: true, profiles_rls: true, snapshots_rls: true,
        backend_pid: 42, classification_count: 1, active_count: activeCount,
        ready_count: readyCount, superseded_count: supersededCount,
      }] };
      if (text.includes("count(distinct source_row_id)::text as distinct_rows")) return { rows: [{
        rows: duplicateSourceRow ? "3" : String(2 + (operationalCase?.extraRows ?? 0)),
        distinct_rows: String(2 + (operationalCase?.extraRows ?? 0)),
        confirmed: String(1 + (operationalCase && !operationalCase.anomalous
          ? operationalCase.extraRows : 0)), related: "1",
        unexpected_resolver_versions: operationalCase
          ? operationalCase.unexpectedResolver ? "1" : "0"
          : ["customer_identity_v1", "customer_identity_v2"].includes(resolverVersion) ? "0" : "1",
        anomalies: anomaly || duplicateSourceRow || operationalCase?.anomalous
          || (!operationalCase && !["customer_identity_v1", "customer_identity_v2"]
            .includes(resolverVersion)) ? "1" : "0",
        active_without_metrics: operationalCase?.activeWithoutMetrics ? "1" : "0",
      }] };
      if (text.includes("select source_row_id::text as source_row_id, email_normalized")) {
        return { rows: state.hmacPages++ === 0
          ? [{ source_row_id: "2", email_normalized: "unit@example.invalid" }] : [] };
      }
      if (text.includes("source_row.email_normalized, h.group_id, h.key_kind")) {
        return { rows: state.verifyPages++ === 0
          ? [{ source_row_id: "2", email_normalized: "unit@example.invalid",
            group_id: group, key_kind: "EXACT_EMAIL" }] : [] };
      }
      if (text.includes("as mixed_group_keys")) return { rows: [{ mixed_group_keys: "0" }] };
      if (text.startsWith("insert into public.customer_related_review_snapshots")) {
        if (insertError) throw new Error("synthetic insert failed");
        state.snapshotId = values[0];
        state.keyId = values[1];
        return { rows: [] };
      }
      if (text.includes("with source_counts as materialized")) return { rows: [{
        valid_source_count: "2", confirmed_count: "1", related_count: "1", hmac_count: "1",
        anomaly_count: "0", missing_metrics_count: "0", ...auditOverride,
      }] };
      if (text.includes("as bad_assignments")) return { rows: [{
        assignment_count: "2", bad_assignments: "0", ...auditOverride,
      }] };
      if (text.includes("as bad_members")) return { rows: [{
        member_count: "1", bad_members: "0", ...auditOverride,
      }] };
      if (text.includes("as bad_group_aggregates")) return { rows: [{
        group_count: "1", bad_groups: groupResolverMismatch ? "1" : "0",
        bad_group_aggregates: "0", ...auditOverride,
      }] };
      if (text.includes("as bad_metric_dates")) return { rows: [{
        metrics_count: "1", bad_metrics: "0", bad_metric_dates: "0", ...auditOverride,
      }] };
      if (text.includes("as expected_contact_candidate_count")) return { rows: [{
        analytics_count: "1", contact_candidate_count: "1",
        expected_contact_candidate_count: "1", bad_analytics: "0",
        bad_contact_candidates: "0", ...auditOverride,
      }] };
      if (text.includes("as confirmed_related_overlap")) return { rows: [{
        confirmed_related_overlap: "0", ...auditOverride,
      }] };
      if (text.startsWith("select count(*)::text as count from public.")) {
        const table = text.match(/from public\.([a-z_]+)/)[1];
        return { rows: [{ count: table === "customer_analytical_booking_assignments" ? "2" : "1" }] };
      }
      if (text.includes("from public.customer_analytical_booking_assignments")
        && text.includes("order by source, source_row_id limit")) {
        return { rows: values[1] === "0" ? [
          { source: "MCP_EAP", source_row_id: "1", booking_link_id: "00000000-0000-0000-0000-000000000001",
            representation_type: "confirmed_customer", customer_id: "00000000-0000-0000-0000-000000000011",
            related_group_id: null },
          { source: "MCP_EAP", source_row_id: "2", booking_link_id: "00000000-0000-0000-0000-000000000002",
            representation_type: "related_review", customer_id: null, related_group_id: group },
        ] : [] };
      }
      if (text.includes("from public.customer_related_review_groups") && text.includes("order by group_id limit")) {
        return { rows: values[1] === "" ? [{ group_id: group, key_kind: "EXACT_EMAIL",
          booking_count: "1", profile_count: "1", email_count: "1", phone_count: "0",
          source_customer_count: "1", conflict_count: "1", candidate_count: "0",
          v1_booking_count: "1", v2_booking_count: "0",
          has_exact_email_phone_corroboration: "false", has_source_customer_email_corroboration: "false" }] : [] };
      }
      if (text.includes("from public.customer_related_review_members") && text.includes("order by source, source_row_id limit")) {
        return { rows: values[1] === "0" ? [{ source: "MCP_EAP", source_row_id: "2", group_id: group,
          booking_link_id: "00000000-0000-0000-0000-000000000002",
          profile_id: "00000000-0000-0000-0000-000000000022", link_status: "conflict",
          resolver_version: "customer_identity_v1", relationship_type: "EXACT_EMAIL",
          reason_code: null }] : [] };
      }
      if (text.includes("from public.customer_related_review_metrics") && text.includes("order by group_id limit")) {
        return { rows: values[1] === "" ? [{ group_id: group, total_reservations: "1",
          first_purchase_at: "2026-09-17T10:20:30.123456",
          last_purchase_at: "2026-09-17T10:20:30.123456" }] : [] };
      }
      if (text.startsWith("update public.customer_related_review_snapshots")) {
        state.readyHash = values[1];
        return { rows: [] };
      }
      if (text.startsWith("select status, manifest_sha256")) {
        return { rows: [{ status: "ready", manifest_sha256: state.readyHash }] };
      }
      if (text.startsWith("select snapshot_id::text as snapshot_id, status, rule_key")) {
        return { rows: [{
          snapshot_id: state.snapshotId, status: postCommitMismatch ? "building" : "ready",
          rule_key: RULE, key_id: state.keyId, manifest_sha256: state.readyHash,
          valid_source_count: "2", confirmed_count: "1", related_count: "1", group_count: "1",
          anomaly_count: "0", active_profiles_without_metrics_count: "0",
          built_at: "2026-09-21T12:00:00.000Z",
        }] };
      }
      if (text.includes("select not exists (select 1 from public.customer_related_review_snapshots")) {
        return { rows: [{ absent: true, backend_pid: 42 }] };
      }
      if (text.includes("select pg_catalog.pg_backend_pid() as backend_pid")) {
        return { rows: [{ backend_pid: pidChanges ? 43 : 42 }] };
      }
      return { rows: [] };
    }
  }
  return { Client, state };
}

test("mock full dry-run streams manifest, audits, and rolls back", async () => {
  const { Client, state } = fakeBuilder();
  const result = await runDryRun({ env, ClientClass: Client });
  assert.equal(result.ok, true);
  assert.equal(result.validSourceCount, "2");
  assert.equal(result.relatedCount, "1");
  assert.equal(result.rollbackCleanupOk, true);
  assert.equal(result.pendingBatches, 1);
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(state.ended, true);
  assert.equal(state.config.query_timeout, 11 * 60 * 1000);
  assert.equal(result.maxBatchSize, 1);
  assert.equal(result.manifestQueryCount, 12);
  assert.equal(result.manifestRowsHashed, 5);
  assert.equal(state.queries.filter((q) => q.text.startsWith("create temp table rr_expected_groups")).length, 1);
  assert.equal(state.queries.filter((q) => q.text.startsWith("create unique index rr_expected_groups_id_idx")).length, 1);
  for (const table of ["assignments", "members", "groups", "metrics"]) {
    assert.equal(state.queries.filter((q) => q.text.startsWith(`create temp table rr_actual_${table}`)).length, 1);
  }
  for (const timing of ["auditPrepareMs", "auditSnapshotLoadMs", "auditCoverageMs",
    "auditAssignmentsMs", "auditMembersMs", "auditGroupsMs", "auditMetricsMs",
    "auditOverlapMs", "auditCheckMs", "auditMs"]) {
    assert.equal(typeof result.timings[timing], "number");
  }
  assert.equal(state.queries.filter((q) => q.text.includes("order by source, source_row_id limit")
    && q.values[2] === 5000).length, 4);
  assert.equal(state.queries.filter((q) => q.text.startsWith("select count(*)::text as count from public.")).length, 4);
  assert.equal(state.queries.filter((q) => q.text.includes("order by group_id limit")
    && q.values[2] === 5000).length, 4);
  assert.equal(result.stabilityWindowMinutes, 30);
  assert.equal(result.hotValidSourceCount, "0");
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(state.queries.some((q) => q.text === "COMMIT"), false);
  assert.doesNotMatch(JSON.stringify(result), /unit@example|fake-password|00000000-0000/);
});

test("build-ready shares the certified pipeline and commits only after ready", async () => {
  const dry = fakeBuilder();
  const dryResult = await runBuild({ mode: "dry-run", env, ClientClass: dry.Client });
  const ready = fakeBuilder({ activeCount: 1 });
  const result = await runBuild({ mode: "build-ready", env, ClientClass: ready.Client });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "build-ready");
  assert.match(result.snapshotId, /^[0-9a-f-]{36}$/);
  assert.equal(result.snapshotStatus, "ready");
  assert.equal(result.committed, true);
  assert.equal(result.postCommitVerificationOk, true);
  assert.equal(result.manifestSha256, dryResult.manifestSha256);
  assert.equal(result.validSourceCount, dryResult.validSourceCount);
  const readyCheckAt = ready.state.queries.findIndex((q) => q.text.startsWith(
    "select status, manifest_sha256"));
  const commitAt = ready.state.queries.findIndex((q) => q.text === "COMMIT");
  const postCommitAt = ready.state.queries.findIndex((q) => q.text.startsWith(
    "select snapshot_id::text as snapshot_id"));
  assert.ok(readyCheckAt >= 0 && readyCheckAt < commitAt && commitAt < postCommitAt);
  assert.equal(ready.state.queries.filter((q) => q.text === "COMMIT").length, 1);
  assert.equal(ready.state.queries.filter((q) => q.text === "ROLLBACK").length, 0);
  assert.equal(ready.state.ended, true);
  assert.doesNotMatch(JSON.stringify(result), /unit@example|fake-password|00000000-0000/);
});

test("existing ready snapshot blocks build-ready while active snapshot does not", async () => {
  const blocked = fakeBuilder({ readyCount: 1, activeCount: 1 });
  let failure;
  try { await runBuild({ mode: "build-ready", env, ClientClass: blocked.Client }); }
  catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), { ok: false,
    code: "ready_snapshot_already_exists", phase: "preflight", committed: false });
  assert.equal(blocked.state.queries.some((q) => q.text.startsWith(
    "insert into public.customer_related_review_snapshots")), false);
  assert.equal(blocked.state.queries.filter((q) => q.text === "COMMIT").length, 0);
  assert.equal(blocked.state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(blocked.state.ended, true);
});

test("superseded snapshots do not block build-ready", async () => {
  const fixture = fakeBuilder({ activeCount: 1, supersededCount: 7 });
  const result = await runBuild({ mode: "build-ready", env, ClientClass: fixture.Client });
  assert.equal(result.ok, true);
  assert.equal(result.snapshotStatus, "ready");
  assert.equal(fixture.state.queries.filter((q) => q.text === "COMMIT").length, 1);
});

for (const [label, options] of [
  ["staging", { queryFailure: { match: "create temp table rr_source", error: new Error("staging") } }],
  ["HMAC", { queryFailure: { match: "create temp table rr_hmac", error: new Error("hmac") } }],
  ["audit", { auditOverride: { bad_assignments: "1" } }],
  ["manifest", { queryFailure: { match: "select count(*)::text as count from public.",
    error: new Error("manifest") } }],
  ["ready update", { queryFailure: { match: "update public.customer_related_review_snapshots",
    error: new Error("ready") } }],
]) {
  test(`build-ready ${label} failure rolls back without commit`, async () => {
    const { Client, state } = fakeBuilder(options);
    await assert.rejects(runBuild({ mode: "build-ready", env, ClientClass: Client }));
    assert.equal(state.queries.filter((q) => q.text === "COMMIT").length, 0);
    assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
    assert.equal(state.ended, true);
  });
}

test("post-commit verification failure is reported as committed without rollback", async () => {
  const { Client, state } = fakeBuilder({ postCommitMismatch: true });
  let failure;
  try { await runBuild({ mode: "build-ready", env, ClientClass: Client }); }
  catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), { ok: false,
    code: "post_commit_verification_failed", phase: "post_commit_verification", committed: true });
  assert.equal(state.queries.filter((q) => q.text === "COMMIT").length, 1);
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 0);
  assert.equal(state.ended, true);
});

test("HMAC key bytes are zeroed after build-ready", async () => {
  const keyBytes = Buffer.from(fakeKey);
  const { Client } = fakeBuilder();
  await runBuild({ mode: "build-ready", env, ClientClass: Client,
    parseEnv: () => ({ connection: {}, keyBytes, keyId: "test-key-v1" }) });
  assert.deepEqual([...keyBytes], Array(32).fill(0));
});

for (const field of ["bad_assignments", "bad_members", "bad_groups", "bad_group_aggregates",
  "bad_metrics", "bad_metric_dates", "confirmed_related_overlap"]) {
  test(`${field} still fails closed after audit aggregation`, async () => {
    const { Client, state } = fakeBuilder({ auditOverride: { [field]: "1" } });
    let failure;
    try { await runDryRun({ env, ClientClass: Client }); } catch (error) { failure = error; }
    assert.deepEqual(formatBuilderError(failure), { ok: false, code: `${field}_nonzero`,
      phase: "audit", committed: false });
    assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
    assert.equal(state.ended, true);
    assert.equal(state.queries.some((q) => q.text === "COMMIT"), false);
  });
}

test("coverage mismatch remains fail-closed", async () => {
  const { Client, state } = fakeBuilder({ auditOverride: { valid_source_count: "3" } });
  let failure;
  try { await runDryRun({ env, ClientClass: Client }); } catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), { ok: false, code: "coverage_mismatch",
    phase: "audit", committed: false });
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(state.queries.some((q) => q.text === "COMMIT"), false);
  assert.equal(state.ended, true);
});

test("group purity failure remains fail-closed", async () => {
  const { Client, state } = fakeBuilder({ auditOverride: { bad_groups: "1" } });
  let failure;
  try { await runDryRun({ env, ClientClass: Client }); } catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), { ok: false, code: "bad_groups_nonzero",
    phase: "audit", committed: false });
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(state.ended, true);
});

test("hot booking is informational and does not enter coverage or manifest", async () => {
  const baseline = fakeBuilder();
  const baselineResult = await runDryRun({ env, ClientClass: baseline.Client });
  const hot = fakeBuilder({ operationalCase: operationalStage({
    bookingAt: "2026-09-17T11:58:00Z", hasLink: false,
  }) });
  const result = await runDryRun({ env, ClientClass: hot.Client });
  assert.equal(result.hotValidSourceCount, "1");
  assert.equal(result.validSourceCount, baselineResult.validSourceCount);
  assert.equal(result.confirmedCount, baselineResult.confirmedCount);
  assert.equal(result.relatedCount, baselineResult.relatedCount);
  assert.equal(result.manifestSha256, baselineResult.manifestSha256);
  assert.equal(hot.state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(hot.state.ended, true);
  assert.doesNotMatch(JSON.stringify(result), /unit@example|fake-password|00000000-0000/);
});

for (const [label, fixture, expectedPhase, expectedCode, expectedHot] of [
  ["20-minute booking without link", { bookingAt: "2026-09-17T11:40:00Z", hasLink: false },
    "staging_index", "builder_failed", "1"],
  ["31-minute booking without link", { bookingAt: "2026-09-17T11:29:00Z", hasLink: false },
    "staging_audit", "source_or_link_anomaly", "0"],
  ["31-minute coherent booking", { bookingAt: "2026-09-17T11:29:00Z",
    linkAt: "2026-09-17T11:29:30Z" }, "staging_index", "builder_failed", "0"],
  ["recent booking without link", { bookingAt: "2026-09-17T11:58:00Z", hasLink: false },
    "staging_index", "builder_failed", "1"],
  ["old booking without link", { bookingAt: "2026-09-17T09:00:00Z", hasLink: false },
    "staging_audit", "source_or_link_anomaly", "0"],
  ["old booking with recent link", { bookingAt: "2026-09-17T09:00:00Z",
    linkAt: "2026-09-17T11:57:00Z" }, "staging_index", "builder_failed", "1"],
  ["old coherent booking", { bookingAt: "2026-09-17T09:00:00Z",
    linkAt: "2026-09-17T09:01:00Z" }, "staging_index", "builder_failed", "0"],
  ["old unknown resolver", { bookingAt: "2026-09-17T09:00:00Z",
    resolverVersion: "customer_identity_v3" }, "staging_audit", "unexpected_resolver_versions", "0"],
  ["recent unknown resolver", { bookingAt: "2026-09-17T11:58:00Z",
    resolverVersion: "customer_identity_v3" }, "staging_index", "builder_failed", "1"],
  ["old active without metrics", { bookingAt: "2026-09-17T09:00:00Z",
    hasMetrics: false }, "staging_audit", "source_or_link_anomaly", "0"],
  ["recent active without metrics", { bookingAt: "2026-09-17T11:58:00Z",
    hasMetrics: false }, "staging_index", "builder_failed", "1"],
]) {
  test(`${label} respects the stability cutoff`, async () => {
    const operationalCase = operationalStage(fixture);
    const { Client, state } = fakeBuilder({ operationalCase, queryFailure: {
      match: "create unique index rr_source_row_idx", error: new Error("test boundary"),
    } });
    let failure;
    try { await runDryRun({ env, ClientClass: Client }); } catch (error) { failure = error; }
    assert.equal(formatBuilderError(failure).phase, expectedPhase);
    assert.equal(formatBuilderError(failure).code, expectedCode);
    const hotQuery = state.queries.find((q) => q.text.includes("as hot_valid_source_count"));
    assert.ok(hotQuery);
    assert.equal(operationalCase.hotCount, expectedHot);
    assert.equal(state.queries.filter((q) => q.text.startsWith("create temp table rr_cutoff")).length, 1);
    assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
    assert.equal(state.ended, true);
  });
}

for (const [label, options, expected] of [
  ["source anomaly", { anomaly: true }, "source_or_link_anomaly"],
  ["duplicate source row", { duplicateSourceRow: true }, "source_or_link_anomaly"],
  ["unknown resolver version", { resolverVersion: "customer_identity_v3" }, "unexpected_resolver_versions"],
  ["null resolver version", { resolverVersion: null }, "unexpected_resolver_versions"],
  ["empty resolver version", { resolverVersion: "" }, "unexpected_resolver_versions"],
  ["V1 plus V2 group mismatch", { groupResolverMismatch: true }, "bad_groups_nonzero"],
  ["synthetic INSERT error", { insertError: true }, /synthetic insert failed/],
  ["session change", { pidChanges: true }, "backend_changed"],
]) {
  test(`${label} fails with rollback and client.end`, async () => {
    const { Client, state } = fakeBuilder(options);
    const result = runDryRun({ env, ClientClass: Client });
    if (typeof expected === "string") await assert.rejects(result, { code: expected });
    else await assert.rejects(result, expected);
    assert.equal(state.ended, true);
    assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
    assert.equal(state.queries.some((q) => q.text === "COMMIT"), false);
    if (options.duplicateSourceRow || !(options.resolverVersion === undefined
      || ["customer_identity_v1", "customer_identity_v2"].includes(options.resolverVersion))) {
      const auditAt = state.queries.findIndex((q) => q.text.includes("as unexpected_resolver_versions"));
      const indexAt = state.queries.findIndex((q) => q.text.startsWith("create unique index rr_source_row_idx"));
      assert.notEqual(auditAt, -1);
      assert.equal(indexAt, -1);
      assert.equal(state.queries.some((q) => q.text.startsWith(
        "insert into public.customer_related_review_snapshots")), false);
    }
  });
}

test("valid staging is audited before its UNIQUE index is built", async () => {
  const { Client, state } = fakeBuilder();
  await runDryRun({ env, ClientClass: Client });
  const auditAt = state.queries.findIndex((q) => q.text.includes("as unexpected_resolver_versions"));
  const indexAt = state.queries.findIndex((q) => q.text.startsWith("create unique index rr_source_row_idx"));
  const snapshotAt = state.queries.findIndex((q) => q.text.startsWith(
    "insert into public.customer_related_review_snapshots"));
  assert.ok(auditAt >= 0 && auditAt < indexAt && indexAt < snapshotAt);
});

test("manifest timestamp remains textual, not Date", async () => {
  const { Client, state } = fakeBuilder();
  const result = await runDryRun({ env, ClientClass: Client });
  assert.equal(result.ok, true);
  assert.equal(state.queries.some((q) => /to_char\(first_purchase_at/.test(q.text)), true);
  assert.equal(state.queries.some((q) => /source_row_id::text/.test(q.text)), true);
});

test("PostgreSQL 23505 reports only safe SQLSTATE and the failing phase", async () => {
  const error = Object.assign(new Error("unit@example.invalid fake-password"), {
    code: "23505", detail: "phone + UUID", query: "secret SQL", table: "customer_related_review_groups",
  });
  const { Client, state } = fakeBuilder({ queryFailure: {
    match: "insert into public.customer_related_review_groups", error,
  } });
  await assert.rejects(runDryRun({ env, ClientClass: Client }), (caught) => caught === error);
  const output = formatBuilderError(error);
  assert.deepEqual(output, { ok: false, code: "builder_failed", phase: "groups_insert", committed: false,
    dbCode: "23505", dbTable: "customer_related_review_groups" });
  assert.doesNotMatch(JSON.stringify(output), /unit@example|fake-password|phone|secret SQL|stack/);
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(state.ended, true);
});

test("PostgreSQL 23514 reports the constraint without detail or hint", async () => {
  const error = Object.assign(new Error("private details"), {
    code: "23514", constraint: "customer_related_review_metrics_check",
    detail: "unit@example.invalid", hint: "fake-password", where: "secret SQL",
  });
  const { Client, state } = fakeBuilder({ queryFailure: {
    match: "insert into public.customer_related_review_metrics", error,
  } });
  await assert.rejects(runDryRun({ env, ClientClass: Client }), (caught) => caught === error);
  assert.deepEqual(formatBuilderError(error), { ok: false, code: "builder_failed",
    phase: "metrics_insert", committed: false, dbCode: "23514",
    dbConstraint: "customer_related_review_metrics_check" });
  assert.equal(state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(state.ended, true);
});

test("Node errors expose only errorType and BuildError retains its code", async () => {
  const nodeError = new TypeError("unit@example.invalid fake-password");
  const node = fakeBuilder({ queryFailure: { match: "create temp table rr_hmac", error: nodeError } });
  await assert.rejects(runDryRun({ env, ClientClass: node.Client }), (caught) => caught === nodeError);
  assert.deepEqual(formatBuilderError(nodeError), { ok: false, code: "builder_failed",
    phase: "hmac_stage", committed: false, errorType: "TypeError" });
  assert.equal(node.state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(node.state.ended, true);

  const build = fakeBuilder({ duplicateSourceRow: true });
  let buildError;
  try { await runDryRun({ env, ClientClass: build.Client }); } catch (error) { buildError = error; }
  assert.deepEqual(formatBuilderError(buildError), { ok: false,
    code: "source_or_link_anomaly", phase: "staging_audit", committed: false });
  assert.equal(build.state.queries.filter((q) => q.text === "ROLLBACK").length, 1);
  assert.equal(build.state.ended, true);
});

const activationSnapshotId = "48d075b3-c8dc-49c3-bed7-daf02f29fbab";
const activationManifest = "c".repeat(64);

function activationContract() {
  return {
    snapshot_id: activationSnapshotId,
    status: "ready",
    rule_key: RULE,
    key_id: "test-key-v1",
    manifest_sha256: activationManifest,
    valid_source_count: "10",
    confirmed_count: "6",
    related_count: "4",
    group_count: "2",
    anomaly_count: "0",
    active_profiles_without_metrics_count: "0",
    built_at: "2026-09-21T12:00:00.000Z",
  };
}

function fakeActivation({ targetStatus = "ready", targetMissing = false, activeIds = [],
  updateMissing = false, supersedeMissing = false, verifyMismatch = false,
  previousVerifyMismatch = false, postCommitMismatch = false,
  queryFailure = null, eventFailure = null, targetOverride = {} } = {}) {
  const state = { queries: [], ended: false, verificationQueries: 0, eventMatches: 0,
    connectCount: 0, endCount: 0, client: null,
    previousStatus: activeIds.length === 1 ? "active" : null,
    transactionPreviousStatus: null };
  class Client {
    constructor(config) { state.config = config; this.listeners = new Map(); state.client = this; }
    on(name, listener) { this.listeners.set(name, listener); }
    off(name, listener) {
      if (this.listeners.get(name) === listener) this.listeners.delete(name);
      state.listenerCount = this.listeners.size;
    }
    emit(name, value) { this.listeners.get(name)?.(value); }
    async connect() { state.connectCount++; }
    async end() {
      state.ended = true;
      state.endCount++;
      state.listenerCount = this.listeners.size;
    }
    async query(sql, values = []) {
      const text = sql.trim().replace(/\s+/g, " ");
      state.queries.push({ text, values });
      if (text === "BEGIN") state.transactionPreviousStatus = state.previousStatus;
      if (text === "ROLLBACK") state.previousStatus = state.transactionPreviousStatus;
      if (text === "COMMIT") state.transactionPreviousStatus = null;
      if (queryFailure && text.includes(queryFailure.match)) throw queryFailure.error;
      if (eventFailure && text.includes(eventFailure.match)) {
        state.eventMatches++;
        if (state.eventMatches === (eventFailure.occurrence || 1)) {
          this.emit("error", eventFailure.error);
        }
      }
      if (text.includes("select current_user as current_user")) return { rows: [{
        current_user: "customer_related_review_builder_login",
        session_user: "customer_related_review_builder_login",
        inherited_capability: true,
        snapshots_rls: true,
        backend_pid: 42,
      }] };
      if (text.startsWith("select snapshot_id::text as snapshot_id")
        && text.includes("where snapshot_id = $1::uuid") && !text.endsWith("for update")) {
        if (values[0] !== activationSnapshotId) return { rows: [{
          snapshot_id: values[0],
          status: previousVerifyMismatch ? "active" : "superseded",
          activated_at: "2026-09-20T13:00:00.000Z",
          superseded_at: previousVerifyMismatch ? null : "2026-09-21T13:00:00.000Z",
        }] };
        return { rows: [activationContract()] };
      }
      if (text.includes("as assignment_count") && text.includes("as related_count")) {
        return { rows: [{
          group_count: "2", member_count: "4", assignment_count: "10", metrics_count: "2",
          analytics_count: "2", contact_candidate_count: "4",
          confirmed_count: "6", related_count: "4",
        }] };
      }
      if (text.includes("as bad_group_purity") && text.includes("as bad_metrics")) {
        return { rows: [{
          bad_group_aggregates: "0", bad_group_purity: "0", bad_metrics: "0",
        }] };
      }
      if (text.includes("as bad_contact_candidate_keys")) return { rows: [{
        bad_analytics: "0", bad_contact_candidate_keys: "0",
        bad_contact_candidate_contract: "0",
      }] };
      if (text.includes("as overlap_count")) return { rows: [{ overlap_count: "0" }] };
      if (text.includes("where snapshot_id = $1::uuid") && text.endsWith("for update")) {
        return { rows: targetMissing ? [] : [{
          ...activationContract(), status: targetStatus, ...targetOverride,
        }] };
      }
      if (text.includes("status = 'active'") && text.includes("order by snapshot_id")
        && text.endsWith("for update")) {
        return { rows: activeIds.map((snapshot_id) => ({
          snapshot_id, activated_at: "2026-09-20T13:00:00.000Z",
        })) };
      }
      if (text.startsWith("update public.customer_related_review_snapshots")
        && text.includes("set status = 'superseded'")) {
        if (!supersedeMissing) state.previousStatus = "superseded";
        return { rows: supersedeMissing ? [] : [{
          snapshot_id: values[0], status: "superseded",
          activated_at: "2026-09-20T13:00:00.000Z",
          superseded_at: "2026-09-21T13:00:00.000Z",
        }] };
      }
      if (text.startsWith("update public.customer_related_review_snapshots")) {
        return { rows: updateMissing ? [] : [{
          snapshot_id: activationSnapshotId, status: "active",
          activated_at: "2026-09-21T13:00:00.000Z",
        }] };
      }
      if (text.includes("count(*) over ()::integer as active_count")) {
        state.verificationQueries++;
        const mismatch = verifyMismatch || (postCommitMismatch && state.verificationQueries === 2);
        return { rows: [{
          ...activationContract(),
          status: "active",
          manifest_sha256: mismatch ? "d".repeat(64) : activationManifest,
          activated_at: "2026-09-21T13:00:00.000Z",
          active_count: 1,
        }] };
      }
      return { rows: [] };
    }
  }
  return { Client, state };
}

function successfulReadyAudit() {
  return async (_client, snapshotId) => ({
    result: { ok: true },
    snapshot: { ...activationContract(), snapshot_id: snapshotId },
  });
}

test("activate revalidates READY and commits exactly one first active snapshot", async () => {
  const fixture = fakeActivation();
  let prevalidatedBeforeBegin = false;
  let embeddedClientIsActivationClient = false;
  const phases = [];
  const result = await runActivate({
    snapshotId: activationSnapshotId,
    env,
    ClientClass: fixture.Client,
    buildConfig: () => ({}),
    readyAuditFn: async (auditClient, ...args) => {
      prevalidatedBeforeBegin = !fixture.state.queries.some((query) => query.text === "BEGIN");
      embeddedClientIsActivationClient = auditClient === fixture.state.client;
      return successfulReadyAudit()(auditClient, ...args);
    },
    onPhase: (phase) => phases.push(phase),
  });
  assert.equal(prevalidatedBeforeBegin, true);
  assert.equal(embeddedClientIsActivationClient, true);
  assert.equal(fixture.state.connectCount, 1);
  assert.equal(fixture.state.endCount, 1);
  assert.deepEqual(phases, ["activate_env", "activate_connect", "activate_prevalidate_start",
    "activate_prevalidate_done", "activate_begin", "activate_lock", "activate_recheck",
    "activate_swap", "activate_verify", "activate_commit", "activate_postcommit",
    "activate_end"]);
  assert.deepEqual(result, {
    ok: true,
    mode: "activate",
    snapshotId: activationSnapshotId,
    status: "active",
    previousActiveSnapshotId: null,
    manifestSha256: activationManifest,
    validSourceCount: "10",
    confirmedCount: "6",
    relatedCount: "4",
    groupCount: "2",
    anomalyCount: 0,
    containsPii: false,
    committed: true,
    postCommitVerificationOk: true,
  });
  const beginAt = fixture.state.queries.findIndex((query) => query.text === "BEGIN");
  const lockAt = fixture.state.queries.findIndex((query) =>
    query.text.includes("order by snapshot_id") && query.text.endsWith("for update"));
  const updateAt = fixture.state.queries.findIndex((query) =>
    query.text.startsWith("update public.customer_related_review_snapshots"));
  const commitAt = fixture.state.queries.findIndex((query) => query.text === "COMMIT");
  assert.ok(beginAt >= 0 && beginAt < lockAt && lockAt < updateAt && updateAt < commitAt);
  assert.equal(fixture.state.queries.filter((query) => query.text === "COMMIT").length, 1);
  assert.equal(fixture.state.queries.some((query) => query.text === "ROLLBACK"), false);
  assert.equal(fixture.state.ended, true);
  assert.doesNotMatch(JSON.stringify(result), /email|phone|source_row|booking|profile/i);
});

test("activate atomically supersedes the prior active snapshot", async () => {
  const previousActiveSnapshotId = "11111111-1111-4111-8111-111111111111";
  const fixture = fakeActivation({ activeIds: [previousActiveSnapshotId] });
  const result = await runActivate({
    snapshotId: activationSnapshotId,
    env,
    ClientClass: fixture.Client,
    buildConfig: () => ({}),
    readyAuditFn: successfulReadyAudit(),
  });
  assert.equal(result.previousActiveSnapshotId, previousActiveSnapshotId);
  const supersedeAt = fixture.state.queries.findIndex((query) =>
    query.text.includes("set status = 'superseded'"));
  const activateAt = fixture.state.queries.findIndex((query) =>
    query.text.includes("set status = 'active'"));
  const commitAt = fixture.state.queries.findIndex((query) => query.text === "COMMIT");
  assert.ok(supersedeAt >= 0 && supersedeAt < activateAt && activateAt < commitAt);
  assert.equal(fixture.state.previousStatus, "superseded");
  assert.equal(fixture.state.queries.filter((query) => query.values[0]
    === previousActiveSnapshotId && query.text.includes("superseded_at")).length, 3);
});

test("failed target activation rolls back the prior supersede", async () => {
  const previousActiveSnapshotId = "11111111-1111-4111-8111-111111111111";
  const fixture = fakeActivation({ activeIds: [previousActiveSnapshotId], updateMissing: true });
  let failure;
  try {
    await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
      buildConfig: () => ({}), readyAuditFn: successfulReadyAudit() });
  } catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), {
    ok: false, code: "activation_update_failed", phase: "activate_swap", committed: false,
  });
  assert.equal(fixture.state.queries.some((query) =>
    query.text.includes("set status = 'superseded'")), true);
  assert.equal(fixture.state.queries.some((query) => query.text === "COMMIT"), false);
  assert.equal(fixture.state.queries.filter((query) => query.text === "ROLLBACK").length, 1);
  assert.equal(fixture.state.previousStatus, "active");
});

test("activate embedded core audit returns on the externally owned client and starts phase B", async () => {
  const fixture = fakeActivation();
  const phases = [];
  const result = await runActivate({
    snapshotId: activationSnapshotId,
    env,
    ClientClass: fixture.Client,
    buildConfig: () => ({}),
    readyAuditFn: (client, id, { onPhase }) => auditReadySnapshotWithClient(client, id, {
      hashManifestFn: async () => activationManifest,
      onPhase,
    }),
    onPhase: (phase) => phases.push(phase),
  });
  assert.equal(result.ok, true);
  assert.ok(phases.indexOf("activate_prevalidate_contract")
    < phases.indexOf("activate_prevalidate_manifest"));
  assert.ok(phases.indexOf("activate_prevalidate_manifest")
    < phases.indexOf("activate_prevalidate_done"));
  assert.ok(phases.indexOf("activate_prevalidate_done") < phases.indexOf("activate_begin"));
  assert.equal(fixture.state.connectCount, 1);
  assert.equal(fixture.state.endCount, 1);
  assert.equal(fixture.state.queries.filter((query) => query.text === "BEGIN").length, 1);
});

for (const [label, options, code] of [
  ["missing snapshot", { targetMissing: true }, "snapshot_not_found"],
  ["building snapshot", { targetStatus: "building" }, "snapshot_not_ready"],
  ["failed snapshot", { targetStatus: "failed" }, "snapshot_not_ready"],
  ["already active snapshot", { targetStatus: "active" }, "snapshot_already_active"],
  ["multiple active snapshots", { activeIds: [
    "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222",
  ] }, "multiple_active_snapshots"],
  ["prior active supersede race", {
    activeIds: ["11111111-1111-4111-8111-111111111111"], supersedeMissing: true,
  }, "previous_snapshot_supersede_failed"],
  ["prior active verification mismatch", {
    activeIds: ["11111111-1111-4111-8111-111111111111"], previousVerifyMismatch: true,
  }, "previous_snapshot_verification_failed"],
  ["manifest changed after prevalidation", {
    targetOverride: { manifest_sha256: "e".repeat(64) },
  }, "snapshot_changed_since_prevalidation"],
  ["counts changed after prevalidation", {
    targetOverride: { related_count: "5" },
  }, "snapshot_changed_since_prevalidation"],
  ["activation update race", { updateMissing: true }, "activation_update_failed"],
  ["in-transaction verification mismatch", {
    verifyMismatch: true,
  }, "activation_verification_failed"],
]) {
  test(`activate fails closed for ${label}`, async () => {
    const fixture = fakeActivation(options);
    let failure;
    try {
      await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
        buildConfig: () => ({}), readyAuditFn: successfulReadyAudit() });
    } catch (error) { failure = error; }
    assert.deepEqual(formatBuilderError(failure), {
      ok: false, code, phase: code === "snapshot_not_found" || code === "snapshot_not_ready"
        || code === "snapshot_already_active" ? "activate_lock"
        : code === "multiple_active_snapshots" ? "activate_lock"
            : code === "snapshot_changed_since_prevalidation" ? "activate_recheck"
              : code === "activation_update_failed"
                || code === "previous_snapshot_supersede_failed" ? "activate_swap"
                  : "activate_verify",
      committed: false,
    });
    assert.equal(fixture.state.queries.some((query) => query.text === "COMMIT"), false);
    assert.equal(fixture.state.queries.filter((query) => query.text === "ROLLBACK").length, 1);
    assert.equal(fixture.state.ended, true);
  });
}

for (const code of ["manifest_mismatch", "snapshot_count_mismatch",
  "group_reconciliation_failed", "metric_reconciliation_failed", "confirmed_related_overlap"]) {
  test(`activation prevalidation propagates ${code} before opening a transaction`, async () => {
    const fixture = fakeActivation();
    const auditError = Object.assign(new Error("sensitive detail"), { code });
    let failure;
    try {
      await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
        buildConfig: () => ({}), readyAuditFn: async () => { throw auditError; } });
    } catch (error) { failure = error; }
    assert.deepEqual(formatBuilderError(failure), {
      ok: false, code, phase: "activate_prevalidate_start", committed: false,
    });
    assert.equal(fixture.state.queries.some((query) => query.text.startsWith(
      "update public.customer_related_review_snapshots")), false);
    assert.equal(fixture.state.queries.filter((query) => query.text === "ROLLBACK").length, 0);
    assert.equal(fixture.state.ended, true);
  });
}

test("activation post-commit mismatch is reported as committed without rollback", async () => {
  const fixture = fakeActivation({ postCommitMismatch: true });
  let failure;
  try {
    await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
      buildConfig: () => ({}), readyAuditFn: successfulReadyAudit() });
  } catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), {
    ok: false, code: "post_commit_verification_failed",
    phase: "activate_postcommit", committed: true,
  });
  assert.equal(fixture.state.queries.filter((query) => query.text === "COMMIT").length, 1);
  assert.equal(fixture.state.queries.some((query) => query.text === "ROLLBACK"), false);
  assert.equal(fixture.state.ended, true);
});

test("pg.Client error event before activation commit is safe and rolls back", async () => {
  const databaseError = Object.assign(new Error("terminating connection sensitive detail"), {
    code: "25P03", detail: "unit@example.invalid", stack: "fake-password",
  });
  const fixture = fakeActivation({ eventFailure: {
    match: "where snapshot_id = $1::uuid", error: databaseError,
  } });
  let failure;
  try {
    await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
      buildConfig: () => ({}), readyAuditFn: successfulReadyAudit() });
  } catch (error) { failure = error; }
  const output = formatBuilderError(failure);
  assert.deepEqual(output, {
    ok: false,
    code: "database_idle_transaction_timeout",
    phase: "activate_lock",
    committed: false,
    dbCode: "25P03",
  });
  assert.doesNotMatch(JSON.stringify(output), /sensitive|unit@example|fake-password|stack|detail/);
  assert.equal(fixture.state.queries.some((query) => query.text === "COMMIT"), false);
  assert.equal(fixture.state.queries.filter((query) => query.text === "ROLLBACK").length, 1);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.listenerCount, 0);
});

test("pg.Client error event after activation commit is safe and remains committed", async () => {
  const databaseError = Object.assign(new Error("connection lost sensitive detail"), {
    code: "08006", detail: "unit@example.invalid",
  });
  const fixture = fakeActivation({ eventFailure: {
    match: "count(*) over ()::integer as active_count", occurrence: 2, error: databaseError,
  } });
  let failure;
  try {
    await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
      buildConfig: () => ({}), readyAuditFn: successfulReadyAudit() });
  } catch (error) { failure = error; }
  const output = formatBuilderError(failure);
  assert.deepEqual(output, {
    ok: false,
    code: "builder_failed",
    phase: "activate_postcommit",
    committed: true,
    dbCode: "08006",
  });
  assert.doesNotMatch(JSON.stringify(output), /sensitive|unit@example|stack|detail/);
  assert.equal(fixture.state.queries.filter((query) => query.text === "COMMIT").length, 1);
  assert.equal(fixture.state.queries.some((query) => query.text === "ROLLBACK"), false);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.listenerCount, 0);
});

test("activation watchdog stops a hung prevalidation without opening a transaction", async () => {
  const fixture = fakeActivation();
  let failure;
  try {
    await runActivate({ snapshotId: activationSnapshotId, env, ClientClass: fixture.Client,
      buildConfig: () => ({}), watchdogMs: 10,
      readyAuditFn: async () => new Promise(() => {}) });
  } catch (error) { failure = error; }
  assert.deepEqual(formatBuilderError(failure), {
    ok: false,
    code: "activation_phase_timeout",
    phase: "activate_prevalidate_start",
    committed: false,
  });
  assert.equal(fixture.state.queries.some((query) => query.text === "BEGIN"), false);
  assert.equal(fixture.state.queries.some((query) => query.text === "ROLLBACK"), false);
  assert.equal(fixture.state.ended, true);
  assert.equal(fixture.state.listenerCount, 0);
});

test("activation source performs no rebuild, delete, or broad snapshot update", () => {
  const activationSource = script.slice(script.indexOf("export async function runActivate"),
    script.indexOf("if (process.argv[1]"));
  assert.doesNotMatch(activationSource,
    /\bdelete\b|rr_source|insert into public\.customer_related_review_|customer_source_bookings/);
  assert.match(activationSource,
    /where snapshot_id = \$1::uuid and status = 'ready'/);
  assert.match(activationSource,
    /where snapshot_id = \$1::uuid and status = 'active'/);
  assert.match(activationSource, /set status = 'superseded', superseded_at = now\(\)/);
  assert.doesNotMatch(activationSource, /activation_lifecycle_migration_required/);
  assert.match(activationSource, /activate_prevalidate/);
  assert.match(activationSource, /SET LOCAL idle_in_transaction_session_timeout = '60s'/);
  assert.equal((script.match(/console\.log\(JSON\.stringify/g) || []).length, 1);
  assert.equal((script.match(/console\.error\(JSON\.stringify\(formatBuilderError/g) || []).length, 1);
  assert.doesNotMatch(activationSource, /Promise\.race\(\[client\.query/);
  assert.doesNotMatch(script, /await import\(.*ready-audit/);
  assert.match(script, /from\s+"\.\/customer-window-related-review-mcp-eap-v1-ready-audit-core\.mjs"/);
});

test("READY derived data is immutable through the installed builder capability", () => {
  assert.match(builderAccessMigration,
    /grant select, insert on table\s+public\.customer_related_review_groups,\s+public\.customer_related_review_members,\s+public\.customer_analytical_booking_assignments,\s+public\.customer_related_review_metrics\s+to customer_related_review_builder;/);
  assert.doesNotMatch(builderAccessMigration,
    /grant[^;]*(?:update|delete)[^;]*customer_related_review_(?:groups|members|metrics)/i);
  assert.doesNotMatch(builderAccessMigration,
    /grant[^;]*(?:update|delete)[^;]*customer_analytical_booking_assignments/i);
  assert.equal((builderAccessMigration.match(/and snapshot\.status = 'building'/g) || []).length, 4);
});
