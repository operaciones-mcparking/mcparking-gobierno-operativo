import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261016150000_harden_initial_security_definer_views.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("../supabase/debug/security_definer_views_initial_group_rollback.sql", import.meta.url),
  "utf8",
);
const postcheck = readFileSync(
  new URL("../supabase/debug/security_definer_views_initial_group_postcheck.sql", import.meta.url),
  "utf8",
);

for (const view of ["v_role_assignments", "organizational_roles"]) {
  test(`${view} becomes an invoker and security-barrier view`, () => {
    assert.match(
      migration,
      new RegExp(`create or replace view public\\.${view}\\s+[\\s\\S]*?security_invoker = true[\\s\\S]*?security_barrier = true`, "i"),
    );
  });
}

test("view access is limited to authenticated and service_role", () => {
  assert.match(migration, /revoke all privileges on table public\.v_role_assignments from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.v_role_assignments to authenticated, service_role/i);
  assert.match(migration, /revoke all privileges on table public\.organizational_roles from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.organizational_roles to authenticated, service_role/i);
});

test("non-admin authenticated callers are filtered while service_role remains supported", () => {
  const guards = migration.match(/where current_user = 'service_role'\s+or coalesce\(public\.is_app_admin\(\), false\)/gi) ?? [];
  assert.equal(guards.length, 2);
});

test("admin reads of areas and companies remain available under invoker RLS", () => {
  assert.match(migration, /create policy admin_areas_select[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(public\.is_app_admin\(\)\)/i);
  assert.match(migration, /create policy admin_companies_select[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(public\.is_app_admin\(\)\)/i);
});

test("migration fails closed when the certified view contract changed", () => {
  assert.match(migration, /View owner, execution mode, or ACL differs from the certified precheck/i);
  assert.match(migration, /public\.v_role_assignments column contract changed/i);
  assert.match(migration, /public\.organizational_roles column contract changed/i);
  assert.match(migration, /Base-table SELECT privileges differ from the certified invoker contract/i);
  assert.match(migration, /service_role must retain BYPASSRLS for the certified service contract/i);
  assert.match(migration, /A planned admin SELECT policy already exists with unverified semantics/i);
});

test("the migration is transactional and performs no data writes", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(migration, /drop\s+(table|view|function)|alter\s+table/i);
});

test("rollback restores definitions, ACLs, options, and added policies", () => {
  assert.match(rollback, /reset \(security_invoker, security_barrier\)/i);
  assert.match(rollback, /grant all privileges on table public\.v_role_assignments to anon, authenticated, service_role/i);
  assert.match(rollback, /grant all privileges on table public\.organizational_roles to anon, authenticated, service_role/i);
  assert.match(rollback, /drop policy if exists admin_areas_select/i);
  assert.match(rollback, /drop policy if exists admin_companies_select/i);
});

test("postcheck certifies options and role-level ACLs without writes", () => {
  assert.match(postcheck, /^\\set ON_ERROR_STOP on/);
  assert.match(postcheck, /begin read only;/i);
  assert.match(postcheck, /all_security_invoker/i);
  assert.match(postcheck, /anon_blocked/i);
  assert.match(postcheck, /rollback;\s*$/i);
  assert.doesNotMatch(postcheck, /\b(insert|update|delete|truncate|create|alter|drop|grant|revoke)\b/i);
});
