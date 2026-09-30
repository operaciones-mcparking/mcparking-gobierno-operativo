import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const db = readFileSync("src/lib/customer-window/customer-360-db.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260930120000_add_customer_window_360_reader_capability.sql",
  "utf8",
);
const provisioning = readFileSync(
  "supabase/debug/customer_window_360_reader_login_create.sql",
  "utf8",
);

const expectedRpcs = [
  "customer_window_360_v1_get_overview",
  "customer_window_360_v1_list_bookings",
  "customer_window_360_v1_list_observed_contacts",
  "customer_window_360_v1_get_boleta_analytics",
  "customer_window_360_v1_get_related_group_analytics",
  "customer_window_360_v1_get_global_review_overview",
  "customer_window_360_v1_list_global_review_bookings",
  "customer_window_360_v1_list_global_review_contacts",
  "customer_window_360_v1_get_global_review_analytics",
  "customer_window_360_v1_get_global_review_identity",
];

test("dedicated transport has the exact ten-RPC static allowlist", () => {
  const list = db.slice(
    db.indexOf("export const CUSTOMER360_RPC_NAMES"),
    db.indexOf("] as const;", db.indexOf("export const CUSTOMER360_RPC_NAMES")),
  );
  const actual = [...list.matchAll(/"(customer_window_360_v1_[a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actual, expectedRpcs);
  assert.match(db, /Object\.prototype\.hasOwnProperty\.call\(CUSTOMER360_RPC_ALLOWLIST, rpc\)/);
  assert.match(db, /outcome: Customer360TraceOutcome[\s\S]*"rpc_rejected"/);
});

test("all RPC SQL is static and parameters are bound", () => {
  for (const rpc of expectedRpcs) {
    assert.match(db, new RegExp(`sql: \"select public\\.${rpc}\\(\\$1`));
  }
  assert.match(db, /text: definition\.sql,[\s\S]*values: definition\.values\(input\)/);
  assert.doesNotMatch(db, /`select public\.\$\{|select public\." \+|\.rpc\(/);
});

test("phase rollout is explicit and fail closed", () => {
  assert.match(db, /"off" \| "confirmed" \| "confirmed_related" \| "all"/);
  assert.match(db, /if \(!phase \|\| phase === "off"\) return false/);
  assert.match(db, /representationType === "confirmed_customer"\) return true/);
  assert.match(db, /representationType === "related_review"\) return phase === "confirmed_related" \|\| phase === "all"/);
  assert.match(db, /return phase === "all"/);
  assert.match(db, /representation_authority_unavailable/);
});

test("pool and transaction enforce bounded read-only access", () => {
  for (const environmentName of [
    "CUSTOMER360_DEDICATED_DB_PHASE",
    "CUSTOMER360_DB_HOST",
    "CUSTOMER360_DB_PORT",
    "CUSTOMER360_DB_NAME",
    "CUSTOMER360_DB_USER",
    "CUSTOMER360_DB_PASSWORD",
    "CUSTOMER360_DB_CA_PEM",
    "CUSTOMER360_DB_CA_SHA256",
    "CUSTOMER360_DB_APPLICATION_NAME",
  ]) {
    assert.match(db, new RegExp(environmentName));
  }
  assert.match(db, /max: 2/);
  assert.match(db, /connectionTimeoutMillis: 3_000/);
  assert.match(db, /query_timeout: 10_000/g);
  assert.match(db, /application_name: applicationName/);
  assert.match(db, /port !== 6543/);
  assert.match(db, /rejectUnauthorized: true/);
  assert.match(db, /createHash\("sha256"\)/);
  assert.match(db, /begin transaction read only/);
  assert.match(db, /set local statement_timeout = '8s'/);
  assert.match(db, /set local lock_timeout = '2s'/);
  assert.doesNotMatch(db, /retry|setTimeout|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/i);
});

test("Customer 360 reads no longer use the service-role transport", () => {
  const customer360Section = admin.slice(admin.indexOf("const customer360ErrorCodes"));
  assert.match(customer360Section, /executeCustomer360Rpc/g);
  assert.doesNotMatch(customer360Section, /createOrquestadorSupabaseAdminClient|\.rpc\(/);
});

test("capability migration grants only the ten RPCs and stores no login secret", () => {
  assert.match(
    migration,
    /create role customer_window_360_reader[\s\S]*nologin[\s\S]*nosuperuser[\s\S]*inherit[\s\S]*nocreatedb[\s\S]*nocreaterole[\s\S]*noreplication[\s\S]*nobypassrls/i,
  );
  assert.doesNotMatch(migration, /alter\s+role/i);
  assert.match(migration, /grant connect on database postgres to customer_window_360_reader/i);
  assert.match(migration, /grant usage on schema public to customer_window_360_reader/i);
  assert.match(migration, /revoke execute on all functions in schema public from customer_window_360_reader/i);
  const grants = [...migration.matchAll(/grant execute on function public\.(customer_window_360_v1_[a-z_]+)\([^;]+?to customer_window_360_reader;/gsi)]
    .map((match) => match[1]);
  assert.deepEqual(grants, expectedRpcs);
  assert.doesNotMatch(migration, /service_role|password|customer_window_360_reader_login/i);
});

test("login provisioning template is secret-free and single-purpose", () => {
  assert.match(
    provisioning,
    /create role customer_window_360_reader_login[\s\S]*login[\s\S]*password null[\s\S]*nosuperuser[\s\S]*inherit[\s\S]*nocreatedb[\s\S]*nocreaterole[\s\S]*noreplication[\s\S]*nobypassrls[\s\S]*connection limit 20/i,
  );
  assert.match(
    provisioning,
    /grant customer_window_360_reader[\s\S]*to customer_window_360_reader_login[\s\S]*with inherit true, set false, admin false/i,
  );
  assert.match(provisioning, /set default_transaction_read_only = 'on'/i);
  assert.match(provisioning, /set statement_timeout = '8s'/i);
  assert.match(provisioning, /set lock_timeout = '2s'/i);
  assert.match(provisioning, /set idle_in_transaction_session_timeout = '10s'/i);
  assert.match(provisioning, /pg_catalog\.pg_db_role_setting/);
  assert.doesNotMatch(provisioning, /<GENERATED_STRONG_PASSWORD>|password\s+'(?!')/i);
  assert.equal((provisioning.match(/grant\s+[a-z0-9_]+\s+to customer_window_360_reader_login/gi) ?? []).length, 1);
  assert.doesNotMatch(provisioning, /service_role|supabase_service_role_key|gyejtqetzumphtatifkl/i);
});
