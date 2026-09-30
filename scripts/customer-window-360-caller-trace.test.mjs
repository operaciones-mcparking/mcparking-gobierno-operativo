import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  traceCustomer360RpcCall,
  traceCustomer360RpcOutcome,
} from "../src/lib/customer-window/customer-360-caller-trace.ts";

const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const routes = Object.fromEntries(
  ["analytics", "bookings", "contacts", "identity", "overview"].map((route) => [
    route,
    readFileSync(`src/app/api/orquestador/customer-window/360/${route}/route.ts`, "utf8"),
  ]),
);

const environmentKeys = [
  "CUSTOMER360_CALLER_TRACE",
  "CUSTOMER360_DB_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_GIT_COMMIT_SHA",
];

async function withTraceEnvironment(values, callback) {
  const original = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const originalInfo = console.info;
  const messages = [];
  console.info = (message) => messages.push(message);
  try {
    for (const key of environmentKeys) delete process.env[key];
    Object.assign(process.env, values);
    await callback(messages);
  } finally {
    console.info = originalInfo;
    for (const key of environmentKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("trace off preserves current behavior and emits nothing", async () => {
  await withTraceEnvironment({ CUSTOMER360_CALLER_TRACE: "0" }, (messages) => {
    assert.equal(traceCustomer360RpcCall("overview"), null);
    traceCustomer360RpcOutcome(null, "customer_window_360_v1_get_overview", 12, "ok", "confirmed");
    assert.deepEqual(messages, []);
  });
});

test("trace emits only the final allowlisted outcome", async () => {
  await withTraceEnvironment({
    CUSTOMER360_CALLER_TRACE: "1",
    CUSTOMER360_DB_PASSWORD: "must-not-appear",
    SUPABASE_SERVICE_ROLE_KEY: "also-must-not-appear",
    VERCEL_GIT_COMMIT_SHA: "abcdef1234567890abcdef1234567890abcdef12",
  }, (messages) => {
    const trace = traceCustomer360RpcCall("analytics");
    assert.ok(trace);
    assert.equal(trace.build, "abcdef123456");
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(messages, []);

    traceCustomer360RpcOutcome(
      trace,
      "customer_window_360_v1_get_boleta_analytics",
      19.9,
      "ok",
      "confirmed",
    );
    assert.equal(messages.length, 1);
    const payload = JSON.parse(messages[0]);
    assert.deepEqual(Object.keys(payload).sort(), [
      "build",
      "durationMs",
      "outcome",
      "phase",
      "requestId",
      "route",
      "rpc",
    ]);
    assert.deepEqual(payload, {
      build: "abcdef123456",
      durationMs: 19,
      outcome: "ok",
      phase: "confirmed",
      requestId: trace.requestId,
      route: "analytics",
      rpc: "customer_window_360_v1_get_boleta_analytics",
    });
    assert.doesNotMatch(messages[0], /must-not-appear|representationKey|profileId|groupId|locator|password|token/i);
  });
});

test("unsafe build metadata is discarded", async () => {
  await withTraceEnvironment({
    CUSTOMER360_CALLER_TRACE: "1",
    VERCEL_GIT_COMMIT_SHA: "not-a-commit-token=secret",
  }, (messages) => {
    const trace = traceCustomer360RpcCall("bookings");
    assert.ok(trace);
    assert.equal(trace.build, "unknown");
    traceCustomer360RpcOutcome(trace, "customer_window_360_v1_list_bookings", 1, "timeout", "all");
    assert.equal(JSON.parse(messages[0]).build, "unknown");
    assert.doesNotMatch(messages[0], /token=secret|not-a-commit/);
  });
});

test("all Customer 360 routes guard phases and pass trace context to dedicated reads", () => {
  for (const route of ["overview", "bookings", "contacts", "analytics", "identity"]) {
    assert.match(routes[route], new RegExp(`traceCustomer360RpcCall\\(\"${route}\"\\)`));
    assert.match(routes[route], /isCustomer360RepresentationEnabled/);
    assert.match(routes[route], /representation_authority_unavailable/);
    assert.doesNotMatch(routes[route], /representationKey.*console|locator.*console|request\.headers/);
  }
  const customer360Section = admin.slice(admin.indexOf("const customer360ErrorCodes"));
  assert.match(customer360Section, /executeCustomer360Rpc/g);
  assert.doesNotMatch(customer360Section, /createOrquestadorSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
});
