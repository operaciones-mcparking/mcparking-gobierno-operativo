import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const migration = read("supabase/migrations/20260811180000_create_process_catalog_v2_views.sql");
const matrixFixMigration = read("supabase/migrations/20260811183000_fix_process_subprocess_matrix_v2.sql");
const data = read("src/lib/dashboard/data.ts");
const page = read("src/app/procesos/page.tsx");
const filters = read("src/components/dashboard/process-filters.tsx");
const detailModal = read("src/app/procesos/process-detail-modal.tsx");
const detailPage = read("src/app/procesos/[processId]/page.tsx");

assert.match(migration, /create or replace view public\.v_process_catalog_v2/i, "must create V2 catalog view");
assert.match(migration, /create or replace view public\.v_process_subprocess_matrix_v2/i, "must create V2 stage view");
assert.match(matrixFixMigration, /create or replace view public\.v_process_subprocess_matrix_v2/i, "matrix fix must replace V2 stage view");
assert.doesNotMatch(matrixFixMigration, /\b(update|insert|delete|truncate)\b/i, "matrix fix migration must not mutate business data");
assert.match(matrixFixMigration, /with active_stage_base as/i, "matrix fix must define one base row per active stage");
assert.match(matrixFixMigration, /stage_owner as/i, "matrix fix must aggregate owner roles before joining");
assert.match(matrixFixMigration, /coalesce\(base\.subprocess_impact_percent, stage_owner\.owner_impact_percent\)::numeric\(5,2\) as impact_percent/, "impact_percent must preserve numeric(5,2) view contract");
assert.match(matrixFixMigration, /stage_user as/i, "matrix fix must aggregate user roles before joining");
assert.match(matrixFixMigration, /stage_support as/i, "matrix fix must aggregate support roles before joining");
assert.match(matrixFixMigration, /stage_backup as/i, "matrix fix must aggregate backup roles before joining");
assert.match(matrixFixMigration, /stage_systems as/i, "matrix fix must aggregate systems before joining");
assert.match(matrixFixMigration, /stage_risks_controls as/i, "matrix fix must aggregate risks and controls before joining");
assert.match(matrixFixMigration, /group by pr\.subprocess_id/g, "role aggregates must group by subprocess_id");
assert.match(matrixFixMigration, /from active_stage_base base[\s\S]*left join stage_owner[\s\S]*left join stage_user[\s\S]*left join stage_support[\s\S]*left join stage_backup[\s\S]*left join stage_systems[\s\S]*left join stage_risks_controls/i, "final matrix view must join aggregated CTEs to base stage rows");
assert.doesNotMatch(migration, /\b(update|insert|delete|truncate)\b/i, "V2 view migration must not mutate business data");
assert.match(migration, /p\.status = 'active'::public\.record_status/i, "catalog view must include active processes only");
assert.match(migration, /sp\.status = 'active'::public\.record_status/i, "stage view must include active stages only");
assert.match(migration, /responsibility_type in \([\s\S]*'consulted'::public\.responsibility_type[\s\S]*'executor'::public\.responsibility_type[\s\S]*'backup'::public\.responsibility_type[\s\S]*'user'::public\.responsibility_type/i, "support role summary must include support responsibility types");
assert.match(migration, /pr\.responsibility_type = 'owner'::public\.responsibility_type/i, "owner summary must use owner responsibilities");
assert.match(migration, /prsn\.status = 'active'::public\.record_status/i, "current people must use active person_roles");
assert.match(migration, /prsn\.end_date is null or prsn\.end_date >= current_date/i, "current people must respect vigente end_date");

assert.match(data, /export type ProcessCatalogV2Item/, "data helper must type V2 catalog rows");
assert.match(data, /export type ProcessStageV2Row/, "data helper must type V2 stage rows");
assert.match(data, /from\("v_process_catalog_v2"\)/, "data helper must query V2 catalog view");
assert.match(data, /from\("v_process_subprocess_matrix_v2"\)/, "data helper must query V2 stage view");
const processCatalogV2Type = data.slice(data.indexOf("export type ProcessCatalogV2Item"), data.indexOf("export type ProcessMatrixRow"));
assert.doesNotMatch(processCatalogV2Type, /:\\s*any\\b/, "V2 catalog type must not use any");

assert.match(page, /getProcessCatalogV2/, "process list must use V2 catalog helper");
assert.match(page, /getProcessMatrixV2/, "process list must use V2 matrix helper");
assert.match(page, /Tipo[\s\S]*Proceso[\s\S]*Rol dueño[\s\S]*Persona actual[\s\S]*Etapas[\s\S]*Roles de apoyo[\s\S]*Accion/, "desktop columns must match V2 target");
assert.match(page, /process\.active_stage_count/, "process list must render active stage count");
assert.match(page, /current_person_names\.length === 0/, "process list must show persona fallback state");
assert.match(page, /support_role_names/, "process list must render support role summary");
assert.doesNotMatch(page, /overflow-x-auto/, "mobile list must not force horizontal table scrolling");

for (const param of ["process_type", "process", "stage", "owner_role", "person", "support_role", "empresa", "tipo"]) {
  assert.match(filters + page, new RegExp(param), `filter ${param} must exist`);
}

assert.match(filters, /Rol dueño/, "owner role filter must be visible");
assert.match(filters, /Roles apoyo/, "support roles filter must be visible");
assert.match(filters, /Persona/, "person filter must be visible");
assert.match(filters, /router\.push/, "filters must remain query-string driven");

assert.match(detailModal, /Entradas y proveedores/, "detail modal must show inputs/providers");
assert.match(detailModal, /Salidas y clientes/, "detail modal must show outputs/clients");
assert.match(detailModal, /KPI basico/, "detail modal must show basic KPI");
assert.match(detailModal, /Roles de apoyo/, "detail modal must show support roles");
assert.match(detailModal, /Etapas \/ subprocesos activos/, "detail modal must label active stages");
assert.match(detailPage, /getProcessCatalogV2Item/, "process detail page must use V2 catalog helper");
assert.match(detailPage, /getProcessMatrixV2/, "process detail page must use V2 stage helper");

console.log("processes-v2-ui: 32/32 OK");