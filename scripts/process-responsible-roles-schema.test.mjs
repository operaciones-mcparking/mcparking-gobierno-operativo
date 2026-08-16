import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(rootDir, "supabase/migrations/20260814120000_add_metric_control_responsible_roles.sql"),
  "utf8",
);

assert.match(migration, /begin;[\s\S]*commit;/, "migration must run in one transaction");
assert.match(migration, /create table public\.metric_responsible_roles/, "metric responsible-role table must exist");
assert.match(migration, /metric_id uuid not null references public\.metrics\(id\) on delete cascade/, "metric assignments must cascade from metrics");
assert.match(migration, /role_id uuid not null references public\.roles\(id\) on delete restrict/, "metric assignments must restrict role deletion");
assert.match(migration, /primary key \(metric_id, role_id\)/, "metric-role pairs must be unique");
assert.match(migration, /idx_metric_responsible_roles_role_id[\s\S]*metric_responsible_roles\(role_id\)/, "metric role lookups must be indexed");
assert.match(migration, /create table public\.control_responsible_roles/, "control responsible-role table must exist");
assert.match(migration, /control_id uuid not null references public\.controls\(id\) on delete cascade/, "control assignments must cascade from controls");
assert.match(migration, /control_id uuid[\s\S]*role_id uuid not null references public\.roles\(id\) on delete restrict/, "control assignments must restrict role deletion");
assert.match(migration, /primary key \(control_id, role_id\)/, "control-role pairs must be unique");
assert.match(migration, /idx_control_responsible_roles_role_id[\s\S]*control_responsible_roles\(role_id\)/, "control role lookups must be indexed");
assert.equal((migration.match(/sort_order integer not null default 0/g) ?? []).length, 2, "both assignment tables must preserve role order");
assert.equal((migration.match(/created_at timestamptz not null default now\(\)/g) ?? []).length, 2, "both assignment tables must record creation time");
assert.match(migration, /alter table public\.metric_responsible_roles enable row level security/, "metric assignments must enable RLS");
assert.match(migration, /alter table public\.control_responsible_roles enable row level security/, "control assignments must enable RLS");
assert.match(migration, /revoke all on table public\.metric_responsible_roles from (public|anon|authenticated)/, "metric assignments must not be browser-readable by default");
assert.match(migration, /revoke all on table public\.control_responsible_roles from (public|anon|authenticated)/, "control assignments must not be browser-readable by default");
assert.match(migration, /grant select, insert, update, delete on table public\.metric_responsible_roles to service_role/, "metric assignments must stay server-only");
assert.match(migration, /grant select, insert, update, delete on table public\.control_responsible_roles to service_role/, "control assignments must stay server-only");
assert.match(migration, /from public\.metrics as metrics[\s\S]*owner_role_id is not null[\s\S]*on conflict \(metric_id, role_id\) do nothing/, "metric legacy backfill must be idempotent");
assert.match(migration, /from public\.controls as controls[\s\S]*owner_role_id is not null[\s\S]*on conflict \(control_id, role_id\) do nothing/, "control legacy backfill must be idempotent");
assert.doesNotMatch(migration, /drop column|alter column|drop table|delete from|truncate/, "legacy fields and data must remain untouched");
assert.doesNotMatch(migration, /risk_responsible_roles|unique\s*\(risk_id\)|unique index[^;]*risk_id/i, "risk-control must remain one-to-many without a risk-role table");

assert.match(migration, /POSTCHECK SQL READ-ONLY:[\s\S]*created_tables[\s\S]*pg_get_constraintdef/, "postcheck must expose created tables and constraints");
assert.match(migration, /duplicate_pairs[\s\S]*owner_role_id[\s\S]*controls_risk_id_unique_indexes/, "postcheck must verify duplicates, legacy fields and risk-control cardinality");
assert.match(migration, /role_table_grants/, "postcheck must expose effective table privileges");
console.log("process-responsible-roles-schema: 26/26 OK");
