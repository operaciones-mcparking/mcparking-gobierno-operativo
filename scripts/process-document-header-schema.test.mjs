import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const migrationPath = "supabase/migrations/20260813120000_add_process_document_header.sql";
const migration = read(migrationPath);
const doc = read("docs/auditoria_cabecera_ficha_proceso.md");
const schemaSources = [
  read("supabase/migrations/20260622120000_initial_schema.sql"),
  read("supabase/migrations/20260623100000_company_service_structure.sql"),
  read("supabase/migrations/20260625110000_auth_access_foundation.sql"),
  read("supabase/migrations/20260812120000_extend_process_master_sheet.sql"),
].join("\n");

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripFunctionBodies(sql) {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, "$$function_body$$");
}

const executableSql = stripSqlComments(migration);
const executableWithoutFunctionBodies = stripFunctionBodies(executableSql);

assert.match(migration, /^begin;/m, "migration must be transaction-ready");
const reserveFunctionStart = migration.indexOf("create function public.reserve_process_code()");
const reserveFunctionEnd = migration.indexOf("revoke all on function public.reserve_process_code()", reserveFunctionStart);
assert.notEqual(reserveFunctionStart, -1, "reserve_process_code function must exist");
assert.notEqual(reserveFunctionEnd, -1, "reserve_process_code function body must terminate before grants");
const reserveFunction = migration.slice(reserveFunctionStart, reserveFunctionEnd);
assert.match(migration, /^commit;/m, "migration must commit explicitly");
assert.match(migration, /PRECHECK SQL READ-ONLY/, "migration must include a read-only precheck comment");

assert.doesNotMatch(executableWithoutFunctionBodies, /^\s*(delete|truncate|drop)\b/im, "migration must not remove objects or business data");
assert.doesNotMatch(executableWithoutFunctionBodies, /^\s*update\s+public\./im, "migration must not backfill existing business rows");
assert.doesNotMatch(executableWithoutFunctionBodies, /^\s*insert\s+into\s+public\.processes\b/im, "migration must not create process rows");
assert.doesNotMatch(executableWithoutFunctionBodies, /set\s+status\s*=/i, "migration must not change statuses");
assert.doesNotMatch(executableWithoutFunctionBodies, /process_code\s*=/i, "migration must not assign process codes to existing rows");
assert.doesNotMatch(executableWithoutFunctionBodies, /owner_role_id\s*=/i, "migration must not assign owners to existing rows");
assert.doesNotMatch(executableWithoutFunctionBodies, /alter table public\.companies/i, "migration must not add company prefixes in this stage");
assert.doesNotMatch(executableWithoutFunctionBodies, /MCP-PROC|ELA-PROC/i, "migration must not hardcode company process prefixes");

assert.match(migration, /alter table public\.processes[\s\S]*add column owner_role_id uuid null/);
assert.match(migration, /add column master_updated_at timestamptz null/);
assert.doesNotMatch(migration, /owner_person_id/i, "owner person must remain derived, not persisted");
assert.doesNotMatch(migration, /master_updated_at timestamptz[^;]*default/i, "master_updated_at must not backfill through a default");
assert.match(migration, /constraint processes_owner_role_id_fkey[\s\S]*foreign key \(owner_role_id\)[\s\S]*references public\.roles\(id\)[\s\S]*on delete restrict/i);
assert.match(migration, /create index idx_processes_owner_role_id/);
assert.match(migration, /create index idx_processes_master_updated_at/);

assert.match(migration, /create table public\.process_code_sequences/);
assert.match(migration, /sequence_key text primary key/);
assert.match(migration, /code_prefix text not null/);
assert.match(migration, /last_value bigint not null default 0/);
assert.match(migration, /alter table public\.process_code_sequences enable row level security/);
assert.match(migration, /create function public\.reserve_process_code\(\)/);
assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('process_code_sequence_process', 0\)\)/);
assert.match(migration, /insert into public\.process_code_sequences[\s\S]*on conflict \(sequence_key\) do update[\s\S]*last_value = public\.process_code_sequences\.last_value \+ 1[\s\S]*returning last_value, code_prefix/i);
assert.match(migration, /values \('process', 'PROC', 1\)/);
assert.match(migration, /v_next_value > 999999[\s\S]*sequence exhausted at PROC-999999/);
assert.match(migration, /return v_code_prefix \|\| '-' \|\| lpad\(v_next_value::text, 6, '0'\)/);
assert.match(migration, /revoke all on function public\.reserve_process_code\(\) from public/);
assert.match(migration, /revoke execute on function public\.reserve_process_code\(\) from anon/);
assert.match(migration, /revoke execute on function public\.reserve_process_code\(\) from authenticated/);
assert.match(migration, /grant execute on function public\.reserve_process_code\(\) to service_role/);
for (const role of ["public", "anon", "authenticated"]) {
  assert.match(migration, new RegExp(`revoke all on table public\\.process_code_sequences from ${role}`));
  assert.match(migration, new RegExp(`revoke all on table public\\.process_versions from ${role}`));
}
assert.match(migration, /grant all on table public\.process_code_sequences to service_role/);
assert.match(migration, /grant all on table public\.process_versions to service_role/);
assert.doesNotMatch(migration, /max\s*\([^)]*process_code/i, "code generation must not use max(process_code)+1");
assert.doesNotMatch(reserveFunction, /select\s+max|count\s*\(|from\s+public\.processes/i, "code generation must not derive values from process rows");

const formatConceptualCode = (value) => `PROC-${String(value).padStart(6, "0")}`;
assert.equal(formatConceptualCode(1), "PROC-000001");
assert.equal(formatConceptualCode(2), "PROC-000002");
assert.equal(formatConceptualCode(42), "PROC-000042");
assert.equal(formatConceptualCode(999999), "PROC-999999");

assert.match(migration, /create table public\.process_versions/);
assert.match(migration, /process_id uuid not null[\s\S]*constraint process_versions_process_id_fkey[\s\S]*references public\.processes\(id\) on delete restrict/);
assert.match(migration, /version text not null/);
assert.match(migration, /snapshot jsonb not null/);
assert.match(migration, /snapshot_schema_version integer not null default 1/);
assert.match(migration, /published_at timestamptz not null default now\(\)/);
assert.match(migration, /published_by uuid null[\s\S]*constraint process_versions_published_by_fkey[\s\S]*references public\.user_profiles\(user_id\) on delete set null/);
assert.match(schemaSources, /create table if not exists public\.user_profiles[\s\S]*user_id uuid primary key references auth\.users\(id\) on delete cascade/);
assert.match(migration, /change_summary text/);
assert.match(migration, /constraint process_versions_process_version_key unique \(process_id, version\)/);
assert.match(migration, /jsonb_typeof\(snapshot\) = 'object'/);
assert.match(migration, /snapshot_schema_version > 0/);
assert.match(migration, /alter table public\.process_versions enable row level security/);
assert.doesNotMatch(migration, /create policy/i, "new RLS tables must not open policies yet");
assert.doesNotMatch(executableWithoutFunctionBodies, /insert into public\.process_versions/i, "migration must not create snapshots");

assert.match(migration, /create function public\.touch_process_master_updated_at\(\)/);
assert.match(migration, /set search_path = public, pg_temp/);
assert.match(migration, /to_jsonb\(new\) - 'updated_at' - 'master_updated_at'/);
assert.match(migration, /create trigger set_processes_master_updated_at[\s\S]*before insert or update on public\.processes/);
assert.doesNotMatch(migration, /after insert or update[\s\S]*on public\.processes/i, "process parent trigger must not recurse through an after-update parent write");
assert.match(migration, /tg_op in \('UPDATE', 'DELETE'\)[\s\S]*v_old_process_id := old\.process_id/);
assert.match(migration, /tg_op in \('INSERT', 'UPDATE'\)[\s\S]*v_new_process_id := new\.process_id/);
assert.match(migration, /where id in \(v_old_process_id, v_new_process_id\)/, "reassignment must touch both old and new processes");

const childTables = [
  "subprocesses",
  "process_roles",
  "process_role_profiles",
  "metrics",
  "risks",
  "controls",
  "process_documents",
  "process_systems",
  "process_clients",
];
for (const tableName of childTables) {
  assert.match(
    migration,
    new RegExp(`create trigger touch_processes_master_updated_at_from_${tableName}[\\s\\S]*after insert or update or delete on public\\.${tableName}`),
    `master_updated_at must be touched from ${tableName}`,
  );
  assert.match(
    schemaSources,
    new RegExp(`create table(?: if not exists)? public\\.${tableName} \\([\\s\\S]{0,2500}?process_id uuid`, "i"),
    `${tableName} must expose process_id directly in source schema`,
  );
}
assert.match(migration, /revoke all on function public\.touch_process_master_updated_at\(\) from public/);
assert.match(migration, /revoke execute on function public\.touch_process_master_updated_at\(\) from anon/);
assert.match(migration, /revoke execute on function public\.touch_process_master_updated_at\(\) from authenticated/);
assert.match(migration, /grant execute on function public\.touch_process_master_updated_at\(\) to service_role/);


assert.match(doc, /Decision final: usar codigo global `PROC-000001`/);
assert.match(doc, /No existe un prefijo corporativo estable en `companies`/);
assert.match(doc, /public\.processes\.owner_role_id uuid null/);
assert.match(doc, /validacion de rol oficial activo debe quedar en Server Action/);
assert.match(doc, /No se agrega `owner_person_id`/);
assert.match(doc, /public\.processes\.master_updated_at timestamptz null/);
assert.match(doc, /public\.process_versions/);
assert.match(doc, /snapshot_schema_version integer not null default 1/);
assert.match(doc, /RLS/);
assert.match(doc, /No se hace backfill/);
assert.match(doc, /No se inicializa con `updated_at`/);

for (const uiPath of [
  "src/app/procesos/process-master/process-master-sheet.tsx",
  "src/app/procesos/nuevo/page.tsx",
  "src/app/procesos/[processId]/editar/page.tsx",
]) {
  const content = read(uiPath);
  assert.ok(content.length > 0, `${uiPath} must remain readable`);
}

console.log("process-document-header-schema: OK");