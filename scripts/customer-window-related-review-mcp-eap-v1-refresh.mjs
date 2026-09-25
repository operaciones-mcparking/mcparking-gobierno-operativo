import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  formatBuilderError,
  parseBuilderEnv,
  runActivate,
  runBuild,
  STABLE_COVERAGE_SQL,
  STABILITY_WINDOW_MINUTES,
} from "./customer-window-related-review-mcp-eap-v1-build.mjs";
import {
  assertReadyAuditResult,
  formatReadyAuditError,
} from "./customer-window-related-review-mcp-eap-v1-ready-audit.mjs";

const LOGIN = "customer_related_review_builder_login";
const REFRESH_LOCK_CLASS = 181923741;
const REFRESH_LOCK_KEY = 2;
const RETENTION_MAX_CALLS = 2;
const RETENTION_RPC_SQL = `
  select public.customer_related_review_prune_superseded_v1_m2m() as result
`;
const OPERATIONAL_START_SQL = `
  select public.customer_related_review_refresh_start_v1_m2m($1::uuid) as result
`;
const OPERATIONAL_HEARTBEAT_SQL = `
  select public.customer_related_review_refresh_heartbeat_v1_m2m($1::uuid) as result
`;
const OPERATIONAL_FINISH_SQL = `
  select public.customer_related_review_refresh_finish_v1_m2m(
    $1::uuid, $2::boolean, $3::text, $4::text, $5::boolean,
    $6::integer, $7::uuid, $8::text
  ) as result
`;
const HEARTBEAT_INTERVAL_MS = 60_000;
const OPERATIONAL_QUERY_TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorContext = new WeakMap();
const READY_AUDIT_SCRIPT = fileURLToPath(new URL(
  "./customer-window-related-review-mcp-eap-v1-ready-audit.mjs", import.meta.url));
const READY_AUDIT_OUTPUT_LIMIT = 64 * 1024;
const READY_AUDIT_RETRY_DELAY_MS = 10_000;
const SAFE_ENV_CODES = new Set([
  "missing_database_url", "invalid_database_url", "incomplete_database_url",
  "tls_verify_full_required", "unsupported_connection_option", "ambiguous_ca",
  "ca_unavailable", "invalid_ca", "invalid_hmac_key_id", "invalid_hmac_key",
  "binary_type_unsupported",
]);
const AUTH_DB_CODES = new Set(["28000", "28P01"]);
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export class RefreshError extends Error {
  constructor(code) {
    super(code);
    this.name = "RefreshError";
    this.code = code;
  }
}

export function parseRefreshArgs(args) {
  if (args.length === 0) return { resumeReadySnapshotId: null };
  if (args.length === 2 && args[0] === "--resume-ready" && UUID.test(args[1])) {
    return { resumeReadySnapshotId: args[1].toLowerCase() };
  }
  throw new RefreshError("refresh_arguments_invalid");
}

function check(value, code) {
  if (!value) throw new RefreshError(code);
}

function canonicalCount(value, code) {
  check(typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value), code);
  return value;
}

export function formatRefreshError(error) {
  const context = error && typeof error === "object" ? errorContext.get(error) : null;
  const rawCode = typeof error?.code === "string" ? error.code : null;
  let code = error instanceof RefreshError ? error.code : "refresh_failed";
  if (!(error instanceof RefreshError) && context?.phase === "preflight") {
    if (SAFE_ENV_CODES.has(rawCode)) code = rawCode;
    else if (context.diagnosticCode === "database_connect") {
      if (AUTH_DB_CODES.has(rawCode)) code = "db_auth_failed";
      else if (TLS_ERROR_CODES.has(rawCode)) code = "db_tls_failed";
      else code = "db_connect_failed";
    } else if (["refresh_lock_query", "snapshot_contract_query"].includes(
      context.diagnosticCode)) {
      code = "preflight_query_failed";
    }
  }
  if (!(error instanceof RefreshError) && context?.phase === "retention") {
    code = "retention_failed";
  }
  const result = {
    ok: false,
    code,
    phase: context?.phase || "initializing",
    activated: context?.activated === true,
  };
  if (context?.phase === "preflight" && context?.diagnosticCode
    && /^[a-z][a-z0-9_]{0,79}$/.test(context.diagnosticCode)) {
    result.diagnosticCode = context.diagnosticCode;
  }
  if (!(error instanceof RefreshError)) {
    const safeBuilderError = formatBuilderError(error);
    for (const key of ["dbCode", "dbConstraint", "dbTable", "dbColumn", "errorType"]) {
      if (safeBuilderError[key]) result[key] = safeBuilderError[key];
    }
  }
  if (context?.newSnapshotId && UUID.test(context.newSnapshotId)) {
    result.newSnapshotId = context.newSnapshotId;
  }
  if (context?.committed === true) result.committed = true;
  if (context?.phase === "retention") {
    result.retentionAttempted = context.retentionAttempted === true;
    result.retentionDeleted = context.retentionDeleted;
    if (Number.isSafeInteger(context.retentionRemaining) && context.retentionRemaining >= 0) {
      result.retentionRemaining = context.retentionRemaining;
    }
    if (Number.isSafeInteger(context.retentionDurationMs)
      && context.retentionDurationMs >= 0) {
      result.retentionDurationMs = context.retentionDurationMs;
    }
    if (context.retentionLastDeletedSnapshotId
      && UUID.test(context.retentionLastDeletedSnapshotId)) {
      result.retentionLastDeletedSnapshotId = context.retentionLastDeletedSnapshotId;
    }
    const retentionErrorCode = error instanceof RefreshError ? error.code : rawCode;
    if (typeof retentionErrorCode === "string"
      && /^[A-Za-z0-9_]{1,80}$/.test(retentionErrorCode)) {
      result.retentionErrorCode = retentionErrorCode;
    }
  }
  if (["lifecycle", "stable_coverage"].includes(context?.postcheckPhaseStarted)) {
    result.postcheckPhaseStarted = context.postcheckPhaseStarted;
  }
  if (["lifecycle", "stable_coverage"].includes(context?.postcheckPhaseFinished)) {
    result.postcheckPhaseFinished = context.postcheckPhaseFinished;
  }
  if (Number.isSafeInteger(context?.postcheckPhaseDurationMs)
    && context.postcheckPhaseDurationMs >= 0) {
    result.postcheckPhaseDurationMs = context.postcheckPhaseDurationMs;
  }
  if (context?.readyAudit) Object.assign(result, context.readyAudit);
  return result;
}

export async function runSnapshotRetention({ client }) {
  const response = (await client.query(RETENTION_RPC_SQL)).rows[0]?.result;
  check(response && typeof response === "object" && !Array.isArray(response)
    && response.ok === true && response.containsPii === false
    && Number.isSafeInteger(response.deleted) && [0, 1].includes(response.deleted)
    && Number.isSafeInteger(response.remainingSupersededBeyondRetention)
    && response.remainingSupersededBeyondRetention >= 0
    && typeof response.activeSnapshotId === "string"
    && UUID.test(response.activeSnapshotId)
    && ((response.deleted === 0 && response.deletedSnapshotId == null)
      || (response.deleted === 1 && typeof response.deletedSnapshotId === "string"
        && UUID.test(response.deletedSnapshotId))),
  "retention_contract_invalid");
  return response;
}

function operationalResult(response, expectedStatus = null) {
  check(response && typeof response === "object" && !Array.isArray(response)
    && response.ok === true && response.containsPii === false
    && typeof response.runId === "string" && UUID.test(response.runId)
    && (expectedStatus === null || response.status === expectedStatus),
  "refresh_operational_contract_invalid");
  return response;
}

export async function startOperationalRefresh({ client, runId }) {
  return operationalResult((await client.query(OPERATIONAL_START_SQL, [runId])).rows[0]?.result);
}

export async function heartbeatOperationalRefresh({ client, runId }) {
  return operationalResult((await client.query(OPERATIONAL_HEARTBEAT_SQL,
    [runId])).rows[0]?.result);
}

export async function finishOperationalRefresh({ client, runId, success, errorCode = null,
  errorPhase = null, retentionAttempted = false, retentionDeleted = null,
  retentionLastDeletedSnapshotId = null, retentionErrorCode = null }) {
  return operationalResult((await client.query(OPERATIONAL_FINISH_SQL, [
    runId, success, errorCode, errorPhase, retentionAttempted,
    retentionAttempted ? retentionDeleted : null,
    retentionAttempted ? retentionLastDeletedSnapshotId : null,
    retentionAttempted ? retentionErrorCode : null,
  ])).rows[0]?.result, success ? "success" : "error");
}

function safeHeartbeatFailure(error) {
  const safe = formatBuilderError(error);
  const result = { event: "refresh_heartbeat_failed", containsPii: false };
  for (const key of ["dbCode", "dbConstraint", "dbTable", "dbColumn", "errorType"]) {
    if (safe[key]) result[key] = safe[key];
  }
  return result;
}

export function createOperationalHeartbeat({ beat, intervalMs = HEARTBEAT_INTERVAL_MS,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  onFailure = (error) => console.error(JSON.stringify(safeHeartbeatFailure(error))) }) {
  let stopped = false;
  let inFlight = null;
  const pulse = () => {
    if (stopped || inFlight) return;
    inFlight = Promise.resolve().then(beat).catch(onFailure).finally(() => { inFlight = null; });
  };
  const timer = setIntervalFn(pulse, intervalMs);
  return {
    async stop() {
      if (!stopped) {
        stopped = true;
        clearIntervalFn(timer);
      }
      if (inFlight) await inFlight;
    },
  };
}

function readyAuditDiagnostic(result = null, error = null) {
  const anomalyCount = result?.anomalyCount;
  const safeAnomalyCount = (typeof anomalyCount === "number" && Number.isSafeInteger(anomalyCount)
      && anomalyCount >= 0) || (typeof anomalyCount === "string" && /^\d+$/.test(anomalyCount))
    ? anomalyCount : null;
  const status = ["building", "ready", "active", "superseded", "failed"]
    .includes(result?.status) ? result.status : null;
  const contractOk = result?.ok === true && status === "ready"
    && result.manifestMatch === true && result.countsMatch === true
    && (anomalyCount === 0 || anomalyCount === "0");
  const diagnostic = {
    readyAuditOk: contractOk,
    readyAuditStatus: status,
    manifestMatch: typeof result?.manifestMatch === "boolean" ? result.manifestMatch : null,
    countsMatch: typeof result?.countsMatch === "boolean" ? result.countsMatch : null,
    anomalyCount: safeAnomalyCount,
  };
  const settings = result ?? error?.readyAuditSafe ?? error?.readyAuditSessionSettings;
  for (const key of ["effectiveStatementTimeoutMs", "effectiveLockTimeoutMs"]) {
    if (Number.isSafeInteger(settings?.[key]) && settings[key] >= 0) {
      diagnostic[key] = settings[key];
    }
  }
  if (error) {
    const safeError = error.readyAuditSafe ?? formatReadyAuditError(
      error, error?.auditPhase || "audit");
    diagnostic.readyAuditCode = safeError.code;
    for (const key of ["dbCode", "dbConstraint", "dbTable", "dbColumn", "errorType",
      "auditPhaseStarted", "auditPhaseFinished", "auditPhaseDurationMs", "auditPhase", "auditPid",
      "elapsedMs", "waitEventType", "waitEvent", "blockingPids"]) {
      if (safeError[key] !== undefined && safeError[key] !== null) {
        diagnostic[key] = safeError[key];
      }
    }
  }
  return diagnostic;
}

function parseSafeJsonLines(value) {
  return value.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed] : [];
    } catch { return []; }
  });
}

function safeAuditWait(row, snapshotId) {
  if (row?.event !== "audit_wait" || row.snapshotId !== snapshotId
    || !["contract", "counts", "groups_metrics", "overlap", "manifest"]
      .includes(row.auditPhase)
    || !Number.isSafeInteger(row.auditPid) || row.auditPid <= 0
    || !Number.isSafeInteger(row.elapsedMs) || row.elapsedMs < 0
    || !Array.isArray(row.blockingPids)
    || !row.blockingPids.every((pid) => Number.isSafeInteger(pid) && pid > 0)
    || ![row.waitEventType, row.waitEvent].every((value) => value === null
      || (typeof value === "string" && /^[A-Za-z0-9_ -]{1,80}$/.test(value)))) return null;
  return {
    auditPhase: row.auditPhase,
    auditPid: row.auditPid,
    elapsedMs: row.elapsedMs,
    waitEventType: row.waitEventType,
    waitEvent: row.waitEvent,
    blockingPids: [...new Set(row.blockingPids)].sort((left, right) => left - right),
  };
}

function safeAuditSessionSettings(row) {
  if (row?.event !== "audit_session_settings"
    || row.effectiveStatementTimeoutMs !== 300_000
    || row.effectiveLockTimeoutMs !== 30_000) return null;
  return {
    effectiveStatementTimeoutMs: row.effectiveStatementTimeoutMs,
    effectiveLockTimeoutMs: row.effectiveLockTimeoutMs,
  };
}

export async function runReadyAuditIsolated({ snapshotId, env = process.env,
  spawnFn = spawn, execPath = process.execPath, scriptPath = READY_AUDIT_SCRIPT } = {}) {
  check(typeof snapshotId === "string" && UUID.test(snapshotId), "invalid_snapshot_id");
  return new Promise((resolveAudit, rejectAudit) => {
    const child = spawnFn(execPath, [scriptPath, "--snapshot-id", snapshotId], {
      env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current, chunk) => (current + String(chunk)).slice(-READY_AUDIT_OUTPUT_LIMIT);
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectAudit(error);
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      const stdoutRows = parseSafeJsonLines(stdout);
      const stderrRows = parseSafeJsonLines(stderr);
      const sessionSettings = stderrRows.map(safeAuditSessionSettings).filter(Boolean).at(-1);
      const latestWait = stderrRows.map((row) => safeAuditWait(row, snapshotId))
        .filter(Boolean).at(-1);
      if (exitCode === 0) {
        const result = stdoutRows.at(-1);
        if (result?.ok === true && sessionSettings) {
          return resolveAudit({ ...result, ...sessionSettings });
        }
      }
      const failure = [...stderrRows].reverse().find((row) => row?.ok === false);
      const started = [...stderrRows].reverse().find((row) =>
        typeof row?.auditPhaseStarted === "string")?.auditPhaseStarted;
      const finished = [...stderrRows].reverse().find((row) =>
        typeof row?.auditPhaseFinished === "string")?.auditPhaseFinished;
      const safe = {
        ok: false,
        code: typeof failure?.code === "string" ? failure.code : "ready_audit_failed",
        phase: typeof failure?.phase === "string" ? failure.phase : "audit",
      };
      for (const key of ["dbCode", "dbConstraint", "dbTable", "dbColumn", "errorType",
        "auditPhaseDurationMs"]) {
        if (failure?.[key] !== undefined && failure?.[key] !== null) safe[key] = failure[key];
      }
      if (started) safe.auditPhaseStarted = started;
      if (finished) safe.auditPhaseFinished = finished;
      if (sessionSettings) Object.assign(safe, sessionSettings);
      if (latestWait) Object.assign(safe, latestWait);
      const error = new Error("isolated_ready_audit_failed");
      error.name = "ReadyAuditProcessError";
      error.auditPhase = safe.auditPhaseStarted;
      error.readyAuditSafe = safe;
      rejectAudit(error);
    });
  });
}

const PREFLIGHT_SQL = `
  select current_user as current_user, session_user as session_user,
    pg_catalog.pg_has_role(current_user, 'customer_related_review_builder', 'USAGE')
      as inherited_capability,
    pg_catalog.row_security_active('public.customer_related_review_snapshots') as snapshots_rls,
    count(*) filter (where snapshot.status = 'active')::integer as active_count,
    count(*) filter (where snapshot.status = 'ready')::integer as ready_count,
    (pg_catalog.array_agg(snapshot.snapshot_id::text order by snapshot.snapshot_id)
      filter (where snapshot.status = 'active'))[1] as active_snapshot_id,
    (pg_catalog.array_agg(snapshot.snapshot_id::text order by snapshot.snapshot_id)
      filter (where snapshot.status = 'ready'))[1] as ready_snapshot_id,
    (pg_catalog.array_agg(snapshot.activated_at order by snapshot.snapshot_id)
      filter (where snapshot.status = 'active'))[1] as active_activated_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
`;

const LIFECYCLE_POSTCHECK_SQL = `
  select
    count(*) filter (where snapshot.status = 'active')::integer as active_count,
    count(*) filter (where snapshot.status = 'ready')::integer as ready_count,
    count(*) filter (where snapshot.status = 'active'
      and snapshot.snapshot_id = $1::uuid)::integer as target_active_count,
    case when $2::uuid is null then null else (
      select previous.status
      from public.customer_related_review_snapshots previous
      where previous.snapshot_id = $2::uuid
    ) end as previous_status,
    case when $2::uuid is null then null else (
      select previous.activated_at
      from public.customer_related_review_snapshots previous
      where previous.snapshot_id = $2::uuid
    ) end as previous_activated_at,
    case when $2::uuid is null then null else (
      select previous.superseded_at
      from public.customer_related_review_snapshots previous
      where previous.snapshot_id = $2::uuid
    ) end as previous_superseded_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
`;

const READY_RETRY_CONTRACT_SQL = `
  select
    count(*) filter (where snapshot.status = 'ready')::integer as ready_count,
    count(*) filter (where snapshot.snapshot_id = $1::uuid
      and snapshot.status = 'ready')::integer as target_ready_count,
    count(*) filter (where snapshot.snapshot_id = $1::uuid
      and snapshot.status = 'active')::integer as target_active_count,
    (pg_catalog.array_agg(snapshot.status order by snapshot.snapshot_id)
      filter (where snapshot.snapshot_id = $1::uuid))[1] as target_status,
    (pg_catalog.array_agg(snapshot.activated_at order by snapshot.snapshot_id)
      filter (where snapshot.snapshot_id = $1::uuid))[1] as target_activated_at,
    (pg_catalog.array_agg(snapshot.superseded_at order by snapshot.snapshot_id)
      filter (where snapshot.snapshot_id = $1::uuid))[1] as target_superseded_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
`;

export { STABLE_COVERAGE_SQL };

export async function runRefresh({
  env = process.env,
  ClientClass = pg.Client,
  parseEnv = parseBuilderEnv,
  buildFn = runBuild,
  auditFn = runReadyAuditIsolated,
  activateFn = runActivate,
  retentionFn = runSnapshotRetention,
  operationalStartFn = startOperationalRefresh,
  operationalHeartbeatFn = heartbeatOperationalRefresh,
  operationalFinishFn = finishOperationalRefresh,
  heartbeatFactory = createOperationalHeartbeat,
  operationalClientFactory = ({ ClientClass: OperationalClientClass, connection }) =>
    new OperationalClientClass({ ...connection, query_timeout: OPERATIONAL_QUERY_TIMEOUT_MS }),
  randomUUIDFn = randomUUID,
  resumeReadySnapshotId = null,
  now = () => Date.now(),
  sleepFn = (delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs)),
  readyAuditRetryDelayMs = READY_AUDIT_RETRY_DELAY_MS,
} = {}) {
  const totalStarted = now();
  const timings = {};
  let phase = "preflight";
  let client;
  let operationalClient;
  let lockAcquired = false;
  let newSnapshotId = null;
  let activated = false;
  let committed = false;
  let readyAudit = null;
  let readyAuditAttempts = 0;
  let readyAuditRetried = false;
  let firstAuditDbCode = null;
  let firstAuditPhase = null;
  let retryAuditOk = null;
  let retryAuditDurationMs = null;
  let postcheckPhaseStarted = null;
  let postcheckPhaseFinished = null;
  let postcheckPhaseStartedAt = null;
  let postcheckPhaseDurationMs = null;
  let retentionAttempted = false;
  let retentionDeleted = 0;
  let retentionRemaining = null;
  let retentionLastDeletedSnapshotId = null;
  let retentionStartedAt = null;
  let retentionDurationMs = null;
  let diagnosticCode = "arguments";
  let operationalStarted = false;
  let operationalFinished = false;
  let heartbeat = null;
  const runId = randomUUIDFn();
  const auditTelemetry = () => ({
    readyAuditAttempts,
    readyAuditRetried,
    ...(firstAuditDbCode ? { firstAuditDbCode } : {}),
    ...(firstAuditPhase ? { firstAuditPhase } : {}),
    ...(retryAuditOk !== null ? { retryAuditOk } : {}),
    ...(retryAuditDurationMs !== null ? { retryAuditDurationMs } : {}),
  });
  try {
    check(resumeReadySnapshotId === null
      || (typeof resumeReadySnapshotId === "string" && UUID.test(resumeReadySnapshotId)),
    "invalid_resume_ready_snapshot_id");
    check(Number.isInteger(readyAuditRetryDelayMs) && readyAuditRetryDelayMs >= 0,
      "invalid_ready_audit_retry_delay");
    check(typeof runId === "string" && UUID.test(runId), "invalid_refresh_run_id");
    if (resumeReadySnapshotId) resumeReadySnapshotId = resumeReadySnapshotId.toLowerCase();
    diagnosticCode = "environment";
    const parsed = parseEnv(env);
    parsed.keyBytes.fill(0);
    parsed.connection.query_timeout = 11 * 60 * 1000;
    diagnosticCode = "database_connect";
    client = new ClientClass(parsed.connection);
    await client.connect();

    diagnosticCode = "refresh_lock_query";
    const lock = (await client.query(
      "select pg_catalog.pg_try_advisory_lock($1::integer, $2::integer) as acquired",
      [REFRESH_LOCK_CLASS, REFRESH_LOCK_KEY],
    )).rows[0];
    check(lock?.acquired === true, "refresh_already_running");
    lockAcquired = true;

    diagnosticCode = "operational_start";
    operationalClient = operationalClientFactory({ ClientClass, connection: parsed.connection });
    await operationalClient.connect();
    const operationalStart = await operationalStartFn({ client: operationalClient, runId });
    check(operationalStart?.ok === true && operationalStart.runId === runId,
      "refresh_operational_start_failed");
    operationalStarted = true;
    heartbeat = heartbeatFactory({
      beat: () => operationalHeartbeatFn({ client: operationalClient, runId }),
    });

    diagnosticCode = "snapshot_contract_query";
    const preflight = (await client.query(PREFLIGHT_SQL)).rows[0];
    diagnosticCode = "snapshot_contract_validation";
    check(preflight?.current_user === LOGIN && preflight?.session_user === LOGIN
      && preflight?.inherited_capability === true, "builder_identity_mismatch");
    check(preflight.snapshots_rls === true, "builder_rls_inactive");
    check(preflight.active_count === 1 && UUID.test(preflight.active_snapshot_id || ""),
      "active_snapshot_count_invalid");
    check(preflight.active_activated_at != null, "active_snapshot_contract_invalid");
    if (resumeReadySnapshotId) {
      check(preflight.ready_count === 1
        && preflight.ready_snapshot_id === resumeReadySnapshotId,
      "resume_ready_snapshot_mismatch");
    } else {
      check(preflight.ready_count === 0, "ready_snapshot_already_exists");
    }
    const previousSnapshotId = preflight.active_snapshot_id;
    const previousActivatedAt = String(preflight.active_activated_at);

    if (resumeReadySnapshotId) {
      newSnapshotId = resumeReadySnapshotId;
      timings.buildMs = 0;
    } else {
      phase = "build-ready";
      const buildStarted = now();
      let build;
      try {
        build = await buildFn({ mode: "build-ready", env, ClientClass });
      } catch {
        throw new RefreshError("build_ready_failed");
      }
      timings.buildMs = now() - buildStarted;
      check(build?.ok === true && build.mode === "build-ready" && build.committed === true
        && build.snapshotStatus === "ready" && build.postCommitVerificationOk === true
        && UUID.test(build.snapshotId || ""), "build_ready_contract_failed");
      newSnapshotId = build.snapshotId;
    }

    phase = "ready-audit";
    const auditStarted = now();
    let audit;
    try {
      readyAuditAttempts = 1;
      audit = await auditFn({ snapshotId: newSnapshotId, env, ClientClass });
      readyAudit = { ...readyAuditDiagnostic(audit), ...auditTelemetry() };
      assertReadyAuditResult(audit, newSnapshotId);
    } catch (error) {
      const firstDiagnostic = readyAuditDiagnostic(audit, error);
      firstAuditDbCode = firstDiagnostic.dbCode ?? null;
      const observedFirstPhase = firstDiagnostic.auditPhaseStarted
        ?? error?.readyAuditSafe?.phase ?? null;
      firstAuditPhase = ["contract", "counts", "groups_metrics", "overlap", "manifest"]
        .includes(observedFirstPhase) ? observedFirstPhase : null;
      readyAudit = { ...firstDiagnostic, ...auditTelemetry() };
      const retryable = firstDiagnostic.readyAuditCode === "ready_audit_failed"
        && firstDiagnostic.dbCode === "57014"
        && activated === false && committed === false;
      if (!retryable) throw new RefreshError("ready_audit_failed");

      readyAuditRetried = true;
      readyAudit = { ...firstDiagnostic, ...auditTelemetry() };
      await sleepFn(readyAuditRetryDelayMs);
      diagnosticCode = "ready_audit_retry_contract_query";
      const retryContract = (await client.query(READY_RETRY_CONTRACT_SQL,
        [newSnapshotId])).rows[0];
      diagnosticCode = "ready_audit_retry_contract_validation";
      check(retryContract?.ready_count === 1
        && retryContract.target_ready_count === 1
        && retryContract.target_active_count === 0
        && retryContract.target_status === "ready"
        && retryContract.target_activated_at == null
        && retryContract.target_superseded_at == null,
      "ready_audit_retry_snapshot_changed");

      const retryStarted = now();
      readyAuditAttempts = 2;
      audit = null;
      try {
        audit = await auditFn({ snapshotId: newSnapshotId, env, ClientClass });
        retryAuditDurationMs = Math.max(0, now() - retryStarted);
        assertReadyAuditResult(audit, newSnapshotId);
        retryAuditOk = true;
        readyAudit = { ...readyAuditDiagnostic(audit), ...auditTelemetry() };
      } catch (retryError) {
        retryAuditDurationMs = Math.max(0, now() - retryStarted);
        retryAuditOk = false;
        readyAudit = {
          ...readyAuditDiagnostic(audit, retryError),
          ...auditTelemetry(),
        };
        throw new RefreshError("ready_audit_failed");
      }
    }
    timings.auditMs = now() - auditStarted;

    phase = "activate";
    const activateStarted = now();
    let activation;
    try {
      activation = await activateFn({ snapshotId: newSnapshotId, env, ClientClass });
    } catch (error) {
      const safe = formatBuilderError(error);
      committed = safe.committed === true;
      activated = committed;
      throw new RefreshError("activate_failed");
    }
    timings.activateMs = now() - activateStarted;
    committed = activation?.committed === true;
    activated = committed;
    check(activation?.ok === true && activation.mode === "activate"
      && activation.status === "active" && activation.committed === true
      && activation.postCommitVerificationOk === true
      && activation.previousActiveSnapshotId === previousSnapshotId,
    "activate_contract_failed");

    phase = "postcheck";
    const postcheckStarted = now();
    postcheckPhaseStarted = "lifecycle";
    postcheckPhaseFinished = null;
    postcheckPhaseStartedAt = now();
    const lifecycle = (await client.query(LIFECYCLE_POSTCHECK_SQL,
      [newSnapshotId, previousSnapshotId])).rows[0];
    check(lifecycle?.active_count === 1 && lifecycle.ready_count === 0
      && lifecycle.target_active_count === 1
      && lifecycle.previous_status === "superseded"
      && lifecycle.previous_superseded_at != null
      && String(lifecycle.previous_activated_at) === previousActivatedAt,
    "lifecycle_postcheck_failed");
    postcheckPhaseFinished = "lifecycle";
    postcheckPhaseDurationMs = now() - postcheckPhaseStartedAt;
    timings.lifecyclePostcheckMs = postcheckPhaseDurationMs;

    postcheckPhaseStarted = "stable_coverage";
    postcheckPhaseFinished = null;
    postcheckPhaseStartedAt = now();
    const coverage = (await client.query(STABLE_COVERAGE_SQL,
      [newSnapshotId, STABILITY_WINDOW_MINUTES])).rows[0];
    const stableValidBookings = canonicalCount(coverage?.stable_valid_bookings,
      "stable_coverage_invalid");
    const stableAssignedBookings = canonicalCount(coverage?.stable_assigned_bookings,
      "stable_coverage_invalid");
    const stableMissingBookings = canonicalCount(coverage?.stable_missing_bookings,
      "stable_coverage_invalid");
    const hotValidBookings = canonicalCount(coverage?.hot_valid_bookings,
      "stable_coverage_invalid");
    check(stableMissingBookings === "0", "stable_coverage_incomplete");
    check(stableValidBookings === stableAssignedBookings, "stable_coverage_incomplete");
    postcheckPhaseFinished = "stable_coverage";
    postcheckPhaseDurationMs = now() - postcheckPhaseStartedAt;
    timings.stableCoveragePostcheckMs = postcheckPhaseDurationMs;
    timings.postcheckMs = now() - postcheckStarted;

    phase = "retention";
    retentionAttempted = true;
    retentionStartedAt = now();
    for (let attempt = 0; attempt < RETENTION_MAX_CALLS; attempt++) {
      const retention = await retentionFn({ client });
      check(retention.activeSnapshotId === newSnapshotId, "retention_active_snapshot_mismatch");
      retentionRemaining = retention.remainingSupersededBeyondRetention;
      if (retention.deleted === 0) break;
      retentionDeleted++;
      retentionLastDeletedSnapshotId = retention.deletedSnapshotId;
    }
    retentionDurationMs = now() - retentionStartedAt;
    timings.retentionMs = retentionDurationMs;
    timings.totalMs = now() - totalStarted;

    await heartbeat.stop();
    heartbeat = null;
    diagnosticCode = "operational_finish_success";
    const operationalFinish = await operationalFinishFn({
      client: operationalClient,
      runId,
      success: true,
      retentionAttempted,
      retentionDeleted,
      retentionLastDeletedSnapshotId,
      retentionErrorCode: null,
    });
    check(operationalFinish?.ok === true && operationalFinish.runId === runId
      && operationalFinish.status === "success", "refresh_operational_finish_failed");
    operationalFinished = true;

    return {
      ok: true,
      mode: "refresh",
      previousSnapshotId,
      newSnapshotId,
      buildReadyOk: true,
      resumedReady: resumeReadySnapshotId !== null,
      readyAuditOk: true,
      ...auditTelemetry(),
      ...(Number.isSafeInteger(audit.effectiveStatementTimeoutMs)
        ? { effectiveStatementTimeoutMs: audit.effectiveStatementTimeoutMs } : {}),
      ...(Number.isSafeInteger(audit.effectiveLockTimeoutMs)
        ? { effectiveLockTimeoutMs: audit.effectiveLockTimeoutMs } : {}),
      activateOk: true,
      activeCount: lifecycle.active_count,
      readyCount: lifecycle.ready_count,
      stableValidBookings,
      stableAssignedBookings,
      stableMissingBookings,
      hotValidBookings,
      stabilityWindowMinutes: STABILITY_WINDOW_MINUTES,
      retentionAttempted,
      retentionDeleted,
      retentionRemaining,
      retentionDurationMs,
      retentionLastDeletedSnapshotId,
      containsPii: false,
      timings,
    };
  } catch (error) {
    if (heartbeat) {
      await heartbeat.stop();
      heartbeat = null;
    }
    if (operationalStarted && !operationalFinished && operationalClient) {
      const errorCode = error instanceof RefreshError
        && /^[a-z][a-z0-9_]{0,79}$/.test(error.code) ? error.code : "refresh_failed";
      const errorPhase = /^[a-z][a-z0-9_-]{0,79}$/.test(phase) ? phase : "refresh";
      const retentionErrorCode = retentionAttempted && phase === "retention"
        ? (errorCode === "refresh_failed" ? "retention_failed" : errorCode) : null;
      try {
        const operationalFinish = await operationalFinishFn({
          client: operationalClient,
          runId,
          success: false,
          errorCode,
          errorPhase,
          retentionAttempted,
          retentionDeleted,
          retentionLastDeletedSnapshotId,
          retentionErrorCode,
        });
        operationalFinished = operationalFinish?.ok === true;
      } catch (finishError) {
        console.error(JSON.stringify({
          ...safeHeartbeatFailure(finishError),
          event: "refresh_operational_finish_failed",
        }));
      }
    }
    if (error && typeof error === "object") {
      errorContext.set(error, {
        phase,
        diagnosticCode,
        newSnapshotId,
        activated,
        committed,
        readyAudit: phase === "ready-audit" ? readyAudit : null,
        postcheckPhaseStarted,
        postcheckPhaseFinished,
        postcheckPhaseDurationMs: phase === "postcheck" && postcheckPhaseStartedAt !== null
          ? Math.max(0, now() - postcheckPhaseStartedAt) : postcheckPhaseDurationMs,
        retentionAttempted,
        retentionDeleted,
        retentionRemaining,
        retentionDurationMs: phase === "retention" && retentionStartedAt !== null
          ? Math.max(0, now() - retentionStartedAt) : retentionDurationMs,
        retentionLastDeletedSnapshotId,
      });
    }
    throw error;
  } finally {
    if (heartbeat) await heartbeat.stop();
    if (operationalClient) {
      try { await operationalClient.end(); } catch { /* Operational telemetry is isolated. */ }
    }
    if (client && lockAcquired) {
      try {
        await client.query("select pg_catalog.pg_advisory_unlock($1::integer, $2::integer)",
          [REFRESH_LOCK_CLASS, REFRESH_LOCK_KEY]);
      } catch { /* Closing the session releases its advisory lock. */ }
    }
    if (client) {
      try { await client.end(); } catch { /* No lifecycle rollback is attempted after cleanup failure. */ }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseRefreshArgs(process.argv.slice(2));
    console.log(JSON.stringify(await runRefresh(options)));
  } catch (error) {
    console.error(JSON.stringify(formatRefreshError(error)));
    process.exitCode = 1;
  }
}
