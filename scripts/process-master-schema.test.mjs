import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const migrationPath = "supabase/migrations/20260812120000_extend_process_master_sheet.sql";
const migration = read(migrationPath);
const doc = read("docs/auditoria_ficha_proceso_maestra.md");
const types = read("src/app/procesos/process-master/process-master-types.ts");

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const executableSql = stripSqlComments(migration);

assert.match(migration, /^begin;/m, "migration must be transaction-ready");
assert.match(migration, /^commit;/m, "migration must commit explicitly");
assert.doesNotMatch(executableSql, /^\s*(delete|truncate|drop|insert)\b/im, "migration must not mutate or remove business data");
assert.doesNotMatch(executableSql, /^\s*update\s+public\./im, "migration must not backfill existing business rows");
assert.doesNotMatch(executableSql, /set\s+status\s*=/i, "migration must not change statuses");
assert.doesNotMatch(executableSql, /owner_role_id\s*=/i, "migration must not change owners");
assert.doesNotMatch(executableSql, /owner_company_id\s*=/i, "migration must not change owners");
assert.doesNotMatch(executableSql, /operating_company_id\s*=/i, "migration must not change owners");
assert.doesNotMatch(executableSql, /alter table public\.subprocesses/i, "migration must not change subprocesses");

assert.match(migration, /Expected 19 active processes before extending process master sheet schema/);
assert.match(migration, /Expected 94 active subprocesses before extending process master sheet schema/);
assert.match(migration, /Unexpected process master sheet columns already exist in public\.processes/);
assert.match(migration, /Unexpected table public\.process_role_profiles already exists/);
assert.match(migration, /Unexpected table public\.process_documents already exists/);

assert.match(migration, /alter table public\.processes[\s\S]*add column process_code text/);
assert.match(migration, /add column version text/);
assert.match(migration, /add column effective_date date/);
assert.match(migration, /add column process_start text/);
assert.match(migration, /add column process_end text/);
assert.match(migration, /add column scope text/);
assert.match(migration, /add column pdca_plan text/);
assert.match(migration, /add column pdca_do text/);
assert.match(migration, /add column pdca_check text/);
assert.match(migration, /add column pdca_act text/);
assert.match(migration, /constraint processes_process_code_not_blank[\s\S]*process_code is null or btrim\(process_code\) <> ''/);
assert.match(
  migration,
  /create unique index idx_processes_process_code_unique_ci[\s\S]*lower\(process_code\)[\s\S]*where process_code is not null and btrim\(process_code\) <> ''/i,
  "process_code must be nullable and unique only when present",
);

assert.match(migration, /alter table public\.metrics[\s\S]*add column formula text/);
assert.match(migration, /alter table public\.metrics[\s\S]*add column target text/);
assert.match(migration, /alter table public\.metrics[\s\S]*add column sort_order integer/);
assert.match(migration, /idx_metrics_process_sort_order/);

assert.match(migration, /alter table public\.risks[\s\S]*add column risk_type text/);
assert.match(migration, /risk_type is null or risk_type in \('risk', 'opportunity'\)/);
assert.match(migration, /alter table public\.controls[\s\S]*add column evidence text/);

assert.match(migration, /create table public\.process_role_profiles/);
assert.match(migration, /process_id uuid not null references public\.processes\(id\) on delete restrict/);
assert.match(migration, /role_id uuid not null references public\.roles\(id\) on delete restrict/);
assert.match(migration, /responsibility_description text/);
assert.match(migration, /authority_description text/);
assert.match(migration, /accountability_description text/);
assert.match(migration, /unique \(process_id, role_id\)/);
assert.doesNotMatch(migration, /process_role_profiles[\s\S]*subprocess_id/, "role profiles must not be per-stage");

const processDocumentsTable = migration.slice(migration.indexOf("create table public.process_documents"), migration.indexOf("create index idx_process_documents_process_id"));
assert.ok(processDocumentsTable.includes("create table public.process_documents"));
assert.match(processDocumentsTable, /process_id uuid not null references public\.processes\(id\) on delete restrict/);
assert.match(processDocumentsTable, /document_type text not null default 'other'/);
assert.match(processDocumentsTable, /usage text/);
assert.doesNotMatch(processDocumentsTable, /description text/, "documents must use usage, not generic description");
assert.match(processDocumentsTable, /document_url text/);
assert.match(migration, /check \(document_type in \('procedure', 'record', 'policy', 'instruction', 'evidence', 'other'\)\)/);
assert.match(migration, /alter table public\.process_role_profiles enable row level security/);
assert.match(migration, /alter table public\.process_documents enable row level security/);
assert.doesNotMatch(migration, /create policy/i, "RLS policies are intentionally pending");

assert.match(doc, /processCode: string \| null/);
assert.match(doc, /effectiveDate: string \| null/);
assert.match(doc, /pdca: \{/);
assert.match(doc, /roleProfiles: Array/);
assert.match(doc, /metrics: Array/);
assert.match(doc, /risks: Array/);
assert.match(doc, /controls: Array/);
assert.match(doc, /documents: Array/);
assert.match(doc, /usage: string \| null/);
assert.match(doc, /getProcessMasterById\(processId\)/);
assert.match(doc, /PDF no debe hacer consultas propias/);
assert.match(doc, /version documental vigente, no historial/i);
assert.match(doc, /No inflar `v_process_catalog_v2` con tablas 1:N/);
assert.match(doc, /No incluye `subprocess_id`; representa rol dentro del proceso/);
assert.match(doc, /RLS habilitado y sin policies abiertas/);

assert.match(types, /export type ProcessMasterDto/, "current master DTO must remain available");
assert.match(types, /inputs_providers: string \| null/, "current DTO must preserve inputs/providers");
assert.match(types, /outputs_clients: string \| null/, "current DTO must preserve outputs/clients");
assert.match(types, /basic_kpi: string \| null/, "current DTO must preserve legacy KPI summary");

console.log("process-master-schema: OK");
