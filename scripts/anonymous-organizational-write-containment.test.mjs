import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261016140000_contain_anonymous_organizational_writes.sql", import.meta.url),
  "utf8",
);
const adminActions = readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");

const tables = [
  "controls",
  "countries",
  "people",
  "person_roles",
  "process_roles",
  "process_systems",
  "processes",
  "risks",
  "roles",
  "sites",
  "subprocesses",
  "systems",
];

test("migration is transactional and scoped to the twelve organizational tables", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  for (const table of tables) assert.match(migration, new RegExp(`'${table}'`));
  assert.doesNotMatch(migration, /alter\s+(table|view)|drop\s+(table|view|function)|create\s+(table|view|function)/i);
});

test("anon keeps SELECT and loses every table privilege before SELECT is restored", () => {
  assert.match(migration, /revoke all privileges on table public\.%I from public, anon/i);
  assert.match(migration, /grant select on table public\.%I to anon/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|truncate|trigger|references|maintain)[^;]*\bto anon\b/i);
});

test("write policies are command-specific, authenticated-only, and admin-gated", () => {
  assert.match(migration, /for insert to authenticated with check \(public\.is_app_admin\(\)\)/i);
  assert.match(migration, /for update to authenticated using \(public\.is_app_admin\(\)\) with check \(public\.is_app_admin\(\)\)/i);
  assert.match(migration, /for delete to authenticated using \(public\.is_app_admin\(\)\)/i);
  assert.match(migration, /p\.roles && array\['public', 'anon'\]::name\[\]/i);
});

test("authenticated and service_role CRUD grants remain explicit", () => {
  assert.match(migration, /grant select, insert, update, delete on table public\.%I to authenticated, service_role/i);
});

test("existing server writes are server actions guarded by admin access", () => {
  assert.match(adminActions, /^"use server";/);
  assert.match(adminActions, /requireAdminAccess\(\)/);
  for (const table of ["controls", "people", "person_roles", "process_roles", "process_systems", "processes", "risks", "roles", "subprocesses", "systems"]) {
    assert.match(adminActions, new RegExp(`\\.from\\(\\"${table}\\"\\)`));
  }
  assert.match(adminActions, /getStructurePermissionClient\(structurePermissions\.editMatrix\)[\s\S]*?\.from\("role_governance_processes"\)/);
});

test("migration fails closed if an anonymous write policy remains", () => {
  assert.match(migration, /p\.cmd in \('ALL', 'INSERT', 'UPDATE', 'DELETE'\)/i);
  assert.match(migration, /p\.roles && array\['public', 'anon'\]::name\[\]/i);
  assert.match(migration, /raise exception 'An anonymous\/public write policy remains on an organizational table'/i);
});
