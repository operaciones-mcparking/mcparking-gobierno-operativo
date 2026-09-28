import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CALCULATION_VERSION, MIN_NEXT_REFRESH_BUDGET_MS, clientTlsIsAuthorized, parseArguments, runRunner, safeError,
} from "./customer-window-360-boleta-analytics-v1-runner.mjs";

const caFixture = encodeURIComponent(fileURLToPath(import.meta.url));
const url = `postgresql://customer_360_boleta_analytics_runner_login.gyejtqetzumphtatifkl:secret@db.example.test:5432/postgres?sslmode=verify-full&sslrootcert=${caFixture}`;

function fakeFsEnv() {
  return { BOLETA_ANALYTICS_DATABASE_URL: url };
}

class FakeClient {
  static instances = [];
  constructor(config) {
    this.config = config;
    this.calls = [];
    this.iteration = 0;
    const parsed = new URL(config.connectionString);
    this.connectionParameters = { host: parsed.hostname, ssl: config.ssl };
    this.connection = { stream: {
      encrypted: true, authorized: true, authorizationError: null, servername: parsed.hostname,
    } };
    FakeClient.instances.push(this);
  }
  async connect() { this.connected = true; }
  async end() { this.ended = true; }
  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql.startsWith("set ")) return { rows: [] };
    if (sql.includes("current_user as")) return { rows: [{
      current_user_name: "customer_360_boleta_analytics_runner_login",
      session_user_name: "customer_360_boleta_analytics_runner_login",
      capability_ok: true, refresh_ok: true, status_ok: true, calculator_denied: true,
      table_denied: true, create_denied: true, temp_not_explicit: true, temp_via_public: true,
      statement_timeout: "2min", lock_timeout: "30s",
    }] };
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ pg_advisory_unlock: true }] };
    if (sql.includes("refresh_status_m2m")) return { rows: [{ status: {
      calculationVersion: CALCULATION_VERSION, countsIncluded: params[0] === true || sql.includes("(true)"),
    } }] };
    if (sql.includes("refresh_boleta_analytics")) {
      this.iteration += 1;
      return { rows: [{ result: { ok: true, mode: params[2], processedProfiles: 3,
        removedProfiles: 0, hasMore: this.iteration < 2, calculationVersion: CALCULATION_VERSION } }] };
    }
    throw new Error("unexpected query");
  }
}

test("TLS certification uses the authorized client socket, not backend pg_stat_ssl", async () => {
  FakeClient.instances = [];
  const result = await runRunner({ options: parseArguments(["--check-connection"]),
    env: fakeFsEnv(), ClientClass: FakeClient });
  assert.equal(result.tlsValid, true);
  assert.equal(FakeClient.instances[0].calls.some(({ sql }) => sql.includes("pg_stat_ssl")), false);
  assert.equal(clientTlsIsAuthorized(FakeClient.instances[0]), true);
});

test("TLS certification rejects unauthorized certificates, insecure mode, and hostname mismatch", async () => {
  class UnauthorizedClient extends FakeClient {
    constructor(config) { super(config); this.connection.stream.authorized = false; }
  }
  class InsecureClient extends FakeClient {
    constructor(config) { super(config); this.connectionParameters.ssl.rejectUnauthorized = false; }
  }
  class HostnameMismatchClient extends FakeClient {
    constructor(config) { super(config); this.connection.stream.servername = "wrong.example.test"; }
  }

  for (const ClientClass of [UnauthorizedClient, InsecureClient, HostnameMismatchClient]) {
    const result = await runRunner({ options: parseArguments(["--check-connection"]),
      env: fakeFsEnv(), ClientClass });
    assert.equal(result.ok, false);
    assert.equal(result.code, "database_tls_invalid");
    assert.equal(result.phase, "tls");
  }
});

test("a CA or hostname handshake failure remains fail-closed", async () => {
  class HandshakeFailureClient extends FakeClient {
    async connect() {
      throw Object.assign(new Error("certificate rejected"), { code: "CERT_HAS_EXPIRED" });
    }
  }
  const result = await runRunner({ options: parseArguments(["--check-connection"]),
    env: fakeFsEnv(), ClientClass: HandshakeFailureClient });
  assert.equal(result.ok, false);
  assert.equal(result.phase, "connect");
  assert.equal(result.errorType, "Error");
});

test("argument validation separates canary and drain modes", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(parseArguments(["--mode", "canary", "--customer-id", id]).maxIterations, 1);
  assert.throws(() => parseArguments(["--mode", "bootstrap", "--customer-id", id]), /customer_ids_only_allowed/);
  assert.throws(() => parseArguments(["--mode", "canary"]), /canary_customer_ids_required/);
  assert.equal(parseArguments(["--mode", "auto", "--limit", "500"]).limit, 500);
  assert.equal(parseArguments(["--mode", "as_of", "--max-iterations", "400"]).maxIterations, 400);
  assert.throws(() => parseArguments(["--mode", "auto", "--max-iterations", "101"]),
    /max_iterations_not_allowed_for_mode/);
  assert.throws(() => parseArguments(["--mode", "bootstrap", "--max-iterations", "400"]),
    /max_iterations_not_allowed_for_mode/);
  assert.throws(() => parseArguments(["--mode", "as_of", "--max-runtime-ms", "1200001"]),
    /max_runtime_not_allowed_for_as_of/);
  assert.equal(parseArguments(["--check-connection"]).checkConnection, true);
});

test("local runtime certification accepts the direct login only on loopback", async () => {
  FakeClient.instances = [];
  const localUrl = `postgresql://customer_360_boleta_analytics_runner_login:secret@localhost:55432/postgres?sslmode=verify-full&sslrootcert=${caFixture}`;
  const result = await runRunner({ options: parseArguments(["--check-connection"]),
    env: { BOLETA_ANALYTICS_DATABASE_URL: localUrl, BOLETA_ANALYTICS_LOCAL_RUNTIME_TEST: "1" },
    ClientClass: FakeClient });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "database-connection-check");

  const remoteResult = await runRunner({ options: parseArguments(["--check-connection"]),
    env: {
      BOLETA_ANALYTICS_DATABASE_URL: localUrl.replace("localhost", "db.example.test"),
      BOLETA_ANALYTICS_LOCAL_RUNTIME_TEST: "1",
    }, ClientClass: FakeClient });
  assert.equal(remoteResult.code, "database_login_invalid");
  assert.equal(remoteResult.phase, "env");
});

test("auto holds one session lock, checks status around the bounded drain, and cleans up", async () => {
  FakeClient.instances = [];
  const events = [];
  const result = await runRunner({
    options: parseArguments(["--mode", "auto", "--max-iterations", "10", "--pause-ms", "0"]),
    env: fakeFsEnv(), ClientClass: FakeClient, emit: (event) => events.push(event), wait: async () => {},
  });
  assert.equal(result.finalStatus, "success_drained");
  assert.equal(result.iterations, 2);
  assert.equal(result.processedTotal, 6);
  const client = FakeClient.instances[0];
  assert.equal(client.calls.filter(({ sql }) => sql.includes("pg_try_advisory_lock")).length, 1);
  assert.equal(client.calls.filter(({ sql }) => sql.includes("pg_advisory_unlock")).length, 1);
  assert.equal(client.calls.filter(({ sql }) => sql.includes("select public.customer_window_boleta_analytics_v1_refresh_status_m2m")).length, 2);
  assert.equal(client.calls.filter(({ sql }) => sql.includes("refresh_boleta_analytics_v1_m2m($1::uuid")).length, 2);
  assert.equal(client.ended, true);
  assert.deepEqual(events.map(({ event }) => event), ["run_started", "iteration", "iteration", "run_finished"]);
  assert.doesNotMatch(JSON.stringify({ result, events }), /11111111|secret|postgresql:/i);
});

test("canary performs exactly one auto RPC and logs only the id count", async () => {
  FakeClient.instances = [];
  const id = "11111111-1111-4111-8111-111111111111";
  const events = [];
  const result = await runRunner({ options: parseArguments(["--mode", "canary", "--customer-id", id]),
    env: fakeFsEnv(), ClientClass: FakeClient, emit: (event) => events.push(event) });
  assert.equal(result.iterations, 1);
  const call = FakeClient.instances[0].calls.find(({ sql }) => sql.includes("refresh_boleta_analytics_v1_m2m($1::uuid"));
  assert.equal(call.params[2], "auto");
  assert.deepEqual(call.params[0], [id]);
  assert.equal(events[0].canaryCustomerCount, 1);
  assert.doesNotMatch(JSON.stringify(events), new RegExp(id));
});

test("busy lock is a successful no-op", async () => {
  class BusyClient extends FakeClient {
    async query(sql, params) {
      if (sql.includes("pg_try_advisory_lock")) { this.calls.push({ sql, params }); return { rows: [{ acquired: false }] }; }
      return super.query(sql, params);
    }
  }
  const result = await runRunner({ options: parseArguments(["--mode", "as_of"]),
    env: fakeFsEnv(), ClientClass: BusyClient });
  assert.equal(result.finalStatus, "skipped_locked");
  assert.equal(result.ok, true);
});

test("auto can recover on its next run after an earlier skipped lock", async () => {
  class RecoveringLockClient extends FakeClient {
    static lockAttempts = 0;
    async query(sql, params = []) {
      if (sql.includes("pg_try_advisory_lock")) {
        this.calls.push({ sql, params });
        RecoveringLockClient.lockAttempts += 1;
        return { rows: [{ acquired: RecoveringLockClient.lockAttempts > 1 }] };
      }
      return super.query(sql, params);
    }
  }
  RecoveringLockClient.lockAttempts = 0;
  const options = parseArguments(["--mode", "auto", "--pause-ms", "0"]);
  const skipped = await runRunner({ options, env: fakeFsEnv(), ClientClass: RecoveringLockClient });
  const recovered = await runRunner({ options, env: fakeFsEnv(), ClientClass: RecoveringLockClient,
    wait: async () => {} });
  assert.equal(skipped.finalStatus, "skipped_locked");
  assert.equal(recovered.finalStatus, "success_drained");
  assert.equal(recovered.iterations, 2);
});

test("as_of stops partial before an unsafe next RPC and a later run resumes to drain", async () => {
  let clock = 0;
  let remainingBatches = 12;
  class PersistentBacklogClient extends FakeClient {
    async query(sql, params = []) {
      if (sql.includes("select public.customer_window_refresh_boleta_analytics_v1_m2m")) {
        this.calls.push({ sql, params });
        clock += 15_500;
        remainingBatches -= 1;
        return { rows: [{ result: { ok: true, mode: "as_of", processedProfiles: 500,
          removedProfiles: 0, hasMore: remainingBatches > 0, calculationVersion: CALCULATION_VERSION } }] };
      }
      return super.query(sql, params);
    }
  }
  const first = await runRunner({
    options: parseArguments(["--mode", "as_of", "--max-iterations", "400",
      "--max-runtime-ms", "60000", "--pause-ms", "2000"]),
    env: fakeFsEnv(), ClientClass: PersistentBacklogClient, now: () => clock,
    wait: async (ms) => { clock += ms; },
  });
  assert.equal(MIN_NEXT_REFRESH_BUDGET_MS, 30_000);
  assert.equal(first.finalStatus, "success_partial");
  assert.equal(first.iterations, 2);
  assert.equal(first.hasMore, true);
  assert.equal(remainingBatches, 10);

  clock = 0;
  const resumed = await runRunner({
    options: parseArguments(["--mode", "as_of", "--max-iterations", "400",
      "--max-runtime-ms", "1200000", "--pause-ms", "0"]),
    env: fakeFsEnv(), ClientClass: PersistentBacklogClient, now: () => clock,
    wait: async () => {},
  });
  assert.equal(resumed.finalStatus, "success_drained");
  assert.equal(resumed.iterations, 10);
  assert.equal(remainingBatches, 0);
});

test("as_of without backlog is a successful drained no-op", async () => {
  class NoBacklogClient extends FakeClient {
    async query(sql, params = []) {
      if (sql.includes("select public.customer_window_refresh_boleta_analytics_v1_m2m")) {
        this.calls.push({ sql, params });
        this.iteration += 1;
        return { rows: [{ result: { ok: true, mode: "as_of", processedProfiles: 0,
          removedProfiles: 0, hasMore: false, calculationVersion: CALCULATION_VERSION } }] };
      }
      return super.query(sql, params);
    }
  }
  const result = await runRunner({ options: parseArguments([
    "--mode", "as_of", "--limit", "60", "--max-iterations", "1",
  ]), env: fakeFsEnv(), ClientClass: NoBacklogClient });
  assert.equal(result.ok, true);
  assert.equal(result.finalStatus, "success_drained");
  assert.equal(result.processedTotal, 0);
  assert.equal(result.removedTotal, 0);
  assert.equal(result.hasMore, false);
  assert.equal(result.iterations, 1);
});

test("counted status is an explicit additional post-run audit", async () => {
  FakeClient.instances = [];
  const options = parseArguments(["--mode", "auto", "--include-counts", "--pause-ms", "0"]);
  const result = await runRunner({ options, env: fakeFsEnv(), ClientClass: FakeClient, wait: async () => {} });
  assert.equal(result.ok, true);
  const calls = FakeClient.instances[0].calls.filter(({ sql }) => sql.includes("select public.customer_window_boleta_analytics_v1_refresh_status_m2m"));
  assert.deepEqual(calls.map(({ params }) => params[0]), [false, false, undefined]);
  assert.match(calls[2].sql, /\(true\)/);
});

test("errors are fail-closed and expose only safe metadata", () => {
  const error = Object.assign(new Error("password=secret and row data"), { code: "57014", constraint: "safe_name" });
  const safe = safeError(error, "refresh");
  assert.deepEqual(safe, { ok: false, code: "runner_failed", phase: "refresh",
    dbCode: "57014", dbConstraint: "safe_name" });
  assert.doesNotMatch(JSON.stringify(safe), /password|secret|row data|stack/i);
});
