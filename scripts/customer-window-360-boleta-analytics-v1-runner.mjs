import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const CALCULATION_VERSION = "CUSTOMER_360_BOLETA_ANALYTICS_V1";
export const EXPECTED_LOGIN = "customer_360_boleta_analytics_runner_login";
export const EXPECTED_DATABASE_USER = `${EXPECTED_LOGIN}.gyejtqetzumphtatifkl`;
export const CAPABILITY_ROLE = "customer_360_boleta_analytics_runner";
export const LOCK_KEY = "customer_window_boleta_analytics_v1_refresh";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,79}$/;

export class RunnerError extends Error {
  constructor(code, phase, fields = {}) {
    super(code);
    this.name = "RunnerError";
    this.code = code;
    this.phase = phase;
    this.safeFields = fields;
  }
}

function integer(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new RunnerError("invalid_arguments", "arguments", { argument: name });
  }
  return parsed;
}

export function parseArguments(argv) {
  const options = {
    mode: null, customerIds: [], limit: 500, maxIterations: 10,
    maxRuntimeMs: 1_200_000, pauseMs: 2_000, includeCounts: false,
    checkConnection: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new RunnerError("invalid_arguments", "arguments");
      return argv[index];
    };
    if (token === "--mode") options.mode = next();
    else if (token === "--customer-id") options.customerIds.push(next());
    else if (token === "--limit") options.limit = integer(next(), "limit", 1, 500);
    else if (token === "--max-iterations") options.maxIterations = integer(next(), "maxIterations", 1, 100);
    else if (token === "--max-runtime-ms") options.maxRuntimeMs = integer(next(), "maxRuntimeMs", 1_000, 7_200_000);
    else if (token === "--pause-ms") options.pauseMs = integer(next(), "pauseMs", 0, 60_000);
    else if (token === "--include-counts") options.includeCounts = true;
    else if (token === "--check-connection") options.checkConnection = true;
    else throw new RunnerError("invalid_arguments", "arguments", { argument: "unknown" });
  }
  if (options.checkConnection) {
    if (options.mode || options.customerIds.length || options.includeCounts) {
      throw new RunnerError("incompatible_arguments", "arguments");
    }
    return options;
  }
  if (!["canary", "auto", "bootstrap", "as_of"].includes(options.mode)) {
    throw new RunnerError("invalid_mode", "arguments");
  }
  if (options.customerIds.some((id) => !UUID.test(id))) {
    throw new RunnerError("invalid_customer_id", "arguments");
  }
  if (options.mode === "canary") {
    if (!options.customerIds.length || options.customerIds.length > 500) {
      throw new RunnerError("canary_customer_ids_required", "arguments");
    }
    options.maxIterations = 1;
  } else if (options.customerIds.length) {
    throw new RunnerError("customer_ids_only_allowed_for_canary", "arguments");
  }
  return options;
}

export function safeError(error, fallbackPhase = "runner") {
  const result = {
    ok: false,
    code: error instanceof RunnerError && SAFE_CODE.test(error.code) ? error.code : "runner_failed",
    phase: SAFE_CODE.test(error?.phase ?? "") ? error.phase : fallbackPhase,
  };
  if (error instanceof RunnerError) Object.assign(result, error.safeFields);
  if (typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code)) result.dbCode = error.code;
  for (const key of ["constraint", "table", "column"]) {
    if (typeof error?.[key] === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(error[key])) {
      result[`db${key[0].toUpperCase()}${key.slice(1)}`] = error[key];
    }
  }
  if (!result.dbCode && !(error instanceof RunnerError) && typeof error?.name === "string") {
    result.errorType = /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(error.name) ? error.name : "Error";
  }
  return result;
}

function loadConnection(env) {
  const raw = env.BOLETA_ANALYTICS_DATABASE_URL;
  if (!raw) throw new RunnerError("database_url_missing", "env");
  let url;
  try { url = new URL(raw); } catch { throw new RunnerError("database_url_invalid", "env"); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new RunnerError("database_url_invalid", "env");
  }
  const localRuntimeTest = env.BOLETA_ANALYTICS_LOCAL_RUNTIME_TEST === "1";
  const loopbackHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const expectedDatabaseUser = localRuntimeTest && loopbackHost ? EXPECTED_LOGIN : EXPECTED_DATABASE_USER;
  if (decodeURIComponent(url.username) !== expectedDatabaseUser) {
    throw new RunnerError("database_login_invalid", "env");
  }
  if (localRuntimeTest && !loopbackHost) {
    throw new RunnerError("local_runtime_test_host_invalid", "env");
  }
  if (url.searchParams.get("sslmode") !== "verify-full") {
    throw new RunnerError("database_tls_invalid", "env");
  }
  const caPath = url.searchParams.get("sslrootcert");
  if (!caPath) throw new RunnerError("database_ca_missing", "env");
  let ca;
  try { ca = readFileSync(caPath, "utf8"); } catch { throw new RunnerError("database_ca_invalid", "env"); }
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true }, query_timeout: 130_000 };
}

export function clientTlsIsAuthorized(client) {
  const ssl = client?.connectionParameters?.ssl;
  const host = client?.connectionParameters?.host;
  const stream = client?.connection?.stream;
  return Boolean(
    ssl && typeof ssl === "object" && ssl.rejectUnauthorized === true &&
    stream?.encrypted === true && stream?.authorized === true &&
    !stream?.authorizationError && typeof host === "string" && host.length > 0 &&
    stream?.servername === host
  );
}

function validateRefresh(payload, expectedMode) {
  if (!payload || payload.ok !== true || payload.mode !== expectedMode ||
      payload.calculationVersion !== CALCULATION_VERSION ||
      !Number.isInteger(payload.processedProfiles) || payload.processedProfiles < 0 ||
      !Number.isInteger(payload.removedProfiles) || payload.removedProfiles < 0 ||
      typeof payload.hasMore !== "boolean") {
    throw new RunnerError("refresh_contract_invalid", "refresh");
  }
  return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runRunner({ options, env = process.env, ClientClass = pg.Client,
  emit = () => {}, now = () => Date.now(), wait = sleep } = {}) {
  let client;
  let lockHeld = false;
  let phase = "env";
  const started = now();
  const runId = crypto.randomUUID();
  const effectiveMode = options.mode === "canary" ? "auto" : options.mode;
  let iterations = 0;
  let processedTotal = 0;
  let removedTotal = 0;
  let hasMore = false;
  let statusBefore = null;
  let statusAfter = null;
  const event = (type, fields = {}) => emit({ event: type, runId, mode: options.mode ?? "connection_check", ...fields });
  try {
    client = new ClientClass(loadConnection(env));
    phase = "connect";
    await client.connect();
    phase = "tls";
    if (!clientTlsIsAuthorized(client)) {
      throw new RunnerError("database_tls_invalid", phase);
    }
    phase = "session_settings";
    await client.query("set statement_timeout = '120s'");
    await client.query("set lock_timeout = '30s'");
    phase = "preflight";
    const preflight = (await client.query(`
      select current_user as current_user_name, session_user as session_user_name,
        pg_catalog.pg_has_role(current_user, '${CAPABILITY_ROLE}', 'USAGE') as capability_ok,
        pg_catalog.has_function_privilege(current_user,
          'public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)', 'EXECUTE') as refresh_ok,
        pg_catalog.has_function_privilege(current_user,
          'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE') as status_ok,
        not pg_catalog.has_function_privilege(current_user,
          'public.customer_window_calculate_boleta_analytics_v1(uuid[])', 'EXECUTE') as calculator_denied,
        not pg_catalog.has_table_privilege(current_user,
          'public.customer_profile_boleta_analytics', 'SELECT,INSERT,UPDATE,DELETE') as table_denied,
        not pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') as create_denied,
        not exists (
          select 1
          from pg_catalog.pg_database database
          cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
            pg_catalog.acldefault('d', database.datdba))) acl
          where database.datname = pg_catalog.current_database()
            and acl.privilege_type = 'TEMPORARY'
            and acl.grantee in (
              (select role.oid from pg_catalog.pg_roles role where role.rolname = current_user),
              (select role.oid from pg_catalog.pg_roles role where role.rolname = '${CAPABILITY_ROLE}')
            )
        ) as temp_not_explicit,
        exists (
          select 1
          from pg_catalog.pg_database database
          cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
            pg_catalog.acldefault('d', database.datdba))) acl
          where database.datname = pg_catalog.current_database()
            and acl.grantee = 0 and acl.privilege_type = 'TEMPORARY'
        ) as temp_via_public,
        pg_catalog.current_setting('statement_timeout') as statement_timeout,
        pg_catalog.current_setting('lock_timeout') as lock_timeout
    `)).rows[0];
    if (preflight?.current_user_name !== EXPECTED_LOGIN || preflight?.session_user_name !== EXPECTED_LOGIN ||
        !preflight.capability_ok || !preflight.refresh_ok || !preflight.status_ok ||
        !preflight.calculator_denied || !preflight.table_denied || !preflight.create_denied || !preflight.temp_not_explicit ||
        preflight.statement_timeout !== "2min" || preflight.lock_timeout !== "30s") {
      throw new RunnerError("runner_privilege_contract_failed", phase);
    }
    if (options.checkConnection) {
      return { ok: true, mode: "database-connection-check", databaseConnected: true,
        loginValid: true, capabilityValid: true, tlsValid: true, privilegeContractValid: true,
        temporaryPrivilegeSource: preflight.temp_via_public ? "public_database_acl" : "none",
        containsSecrets: false };
    }
    phase = "lock";
    lockHeld = (await client.query(
      "select pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended($1, 0)) as acquired", [LOCK_KEY]
    )).rows[0]?.acquired === true;
    if (!lockHeld) {
      return { ok: true, mode: options.mode, finalStatus: "skipped_locked", iterations: 0,
        processedTotal: 0, removedTotal: 0, hasMore: null, durationMs: now() - started };
    }
    phase = "status_before";
    statusBefore = (await client.query(
      "select public.customer_window_boleta_analytics_v1_refresh_status_m2m($1) as status",
      [false],
    )).rows[0]?.status;
    if (statusBefore?.calculationVersion !== CALCULATION_VERSION) {
      throw new RunnerError("status_contract_invalid", phase);
    }
    event("run_started", { startedAt: new Date(started).toISOString(), pLimit: options.limit,
      canaryCustomerCount: options.mode === "canary" ? options.customerIds.length : undefined });
    do {
      if (now() - started >= options.maxRuntimeMs) break;
      phase = "refresh";
      const payload = validateRefresh((await client.query(
        "select public.customer_window_refresh_boleta_analytics_v1_m2m($1::uuid[], $2::integer, $3::text) as result",
        [options.mode === "canary" ? options.customerIds : null, options.limit, effectiveMode],
      )).rows[0]?.result, effectiveMode);
      iterations += 1;
      processedTotal += payload.processedProfiles;
      removedTotal += payload.removedProfiles;
      hasMore = payload.hasMore;
      event("iteration", { iteration: iterations, pLimit: options.limit,
        processedProfiles: payload.processedProfiles, removedProfiles: payload.removedProfiles,
        hasMore, calculationVersion: payload.calculationVersion });
      if (!hasMore || options.mode === "canary" || iterations >= options.maxIterations) break;
      if (now() - started + options.pauseMs >= options.maxRuntimeMs) break;
      await wait(options.pauseMs);
    } while (true);
    phase = "status_after";
    statusAfter = (await client.query(
      "select public.customer_window_boleta_analytics_v1_refresh_status_m2m($1) as status",
      [false],
    )).rows[0]?.status;
    if (statusAfter?.calculationVersion !== CALCULATION_VERSION) {
      throw new RunnerError("status_contract_invalid", phase);
    }
    if (options.includeCounts) {
      phase = "status_counts";
      const countedStatus = (await client.query(
        "select public.customer_window_boleta_analytics_v1_refresh_status_m2m(true) as status"
      )).rows[0]?.status;
      if (countedStatus?.calculationVersion !== CALCULATION_VERSION || countedStatus?.countsIncluded !== true) {
        throw new RunnerError("status_contract_invalid", phase);
      }
    }
    const finalStatus = hasMore ? "success_partial" : "success_drained";
    const result = { ok: true, mode: options.mode, finalStatus, iterations,
      processedTotal, removedTotal, hasMore, calculationVersion: CALCULATION_VERSION,
      durationMs: now() - started };
    event("run_finished", result);
    return result;
  } catch (error) {
    const safe = safeError(error, phase);
    event("run_finished", { ...safe, finalStatus: "error", durationMs: now() - started });
    if (client && !["connect", "env"].includes(phase)) {
      try {
        const status = await client.query(
          "select public.customer_window_boleta_analytics_v1_refresh_status_m2m(false) as status");
        if (status.rows[0]?.status?.calculationVersion === CALCULATION_VERSION) statusAfter = status.rows[0].status;
      } catch { /* The database remains the checkpoint; status recovery is best effort. */ }
    }
    return { ...safe, finalStatus: "error", iterations, processedTotal, removedTotal,
      hasMore: iterations ? hasMore : null, durationMs: now() - started };
  } finally {
    if (client && lockHeld) {
      try { await client.query(
        "select pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended($1, 0))", [LOCK_KEY]);
      } catch { /* Disconnect also releases a session advisory lock. */ }
    }
    if (client) {
      try { await client.end(); } catch { /* No local cleanup can replace the database checkpoint. */ }
    }
    statusBefore = null;
    statusAfter = null;
  }
}

async function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) {
    process.stdout.write(`${JSON.stringify(safeError(error, "arguments"))}\n`);
    process.exitCode = 2;
    return;
  }
  const result = await runRunner({ options, emit: (record) => process.stderr.write(`${JSON.stringify(record)}\n`) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
