import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { traceCustomer360RpcCall } from "../src/lib/customer-window/customer-360-caller-trace.ts";

const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const routes = Object.fromEntries(
  ["analytics", "bookings", "overview"].map((route) => [
    route,
    readFileSync(`src/app/api/orquestador/customer-window/360/${route}/route.ts`, "utf8"),
  ]),
);

const environmentKeys = [
  "CUSTOMER360_CALLER_TRACE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_URL",
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
    assert.deepEqual(messages, []);
  });
});

test("trace on emits one allowlisted record and a bounded x-client-info marker", async () => {
  await withTraceEnvironment({
    CUSTOMER360_CALLER_TRACE: "1",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-appear",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: "abcdef1234567890abcdef1234567890abcdef12",
    VERCEL_URL: "red-roles.example.vercel.app",
  }, (messages) => {
    const trace = traceCustomer360RpcCall("analytics");
    assert.ok(trace);
    assert.equal(trace.clientInfo, "mcparking-cw360/analytics/production/abcdef123456");
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(messages.length, 1);

    const payload = JSON.parse(messages[0]);
    assert.deepEqual(Object.keys(payload).sort(), [
      "build",
      "deploymentHost",
      "environment",
      "event",
      "requestId",
      "route",
      "timestamp",
    ]);
    assert.equal(payload.event, "customer360_rpc_call");
    assert.equal(payload.route, "analytics");
    assert.equal(payload.environment, "production");
    assert.equal(payload.build, "abcdef123456");
    assert.equal(payload.deploymentHost, "red-roles.example.vercel.app");
    assert.doesNotMatch(messages[0], /must-not-appear|representationKey|profileId|groupId|locator/i);
  });
});

test("unsafe deployment metadata is discarded instead of logged", async () => {
  await withTraceEnvironment({
    CUSTOMER360_CALLER_TRACE: "1",
    VERCEL_ENV: "secret-environment",
    VERCEL_GIT_COMMIT_SHA: "not-a-commit",
    VERCEL_URL: "https://host.invalid/path?token=secret",
  }, (messages) => {
    const trace = traceCustomer360RpcCall("bookings");
    assert.ok(trace);
    assert.equal(trace.clientInfo, "mcparking-cw360/bookings/unknown/unknown");
    const payload = JSON.parse(messages[0]);
    assert.equal(payload.environment, "unknown");
    assert.equal(payload.build, "unknown");
    assert.equal(payload.deploymentHost, "unknown");
    assert.doesNotMatch(messages[0], /token=secret|secret-environment|not-a-commit/);
  });
});

test("only the three Customer 360 routes pass their trace marker to the existing reads", () => {
  for (const route of ["overview", "bookings", "analytics"]) {
    assert.match(routes[route], new RegExp(`traceCustomer360RpcCall\\(\"${route}\"\\)`));
    assert.match(routes[route], /trace\?\.clientInfo/);
    assert.doesNotMatch(routes[route], /representationKey.*console|locator.*console|request\.headers/);
  }
  assert.match(admin, /"X-Client-Info": clientInfo/);
  assert.match(admin, /createOrquestadorSupabaseAdminClient\(clientInfo\)/g);
  assert.doesNotMatch(admin, /CUSTOMER360_CALLER_TRACE|console\.info/);
});
