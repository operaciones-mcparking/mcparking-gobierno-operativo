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
const editModal = read("src/app/procesos/process-edit-modal.tsx");
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
assert.doesNotMatch(processCatalogV2Type, /:\s*any\b/, "V2 catalog type must not use any");

assert.match(page, /getProcessCatalogV2/, "process list must use V2 catalog helper");
assert.match(page, /getProcessMatrixV2/, "process list must use V2 matrix helper");
assert.match(page, /Diccionario de procesos/, "dictionary heading must be clean");
assert.doesNotMatch(page, /Diccionario de procesos oficiales/, "dictionary heading must not use old wording");
assert.doesNotMatch(page, /Listado principal V2|Catalogo V2/, "visible process heading copy must not mention V2");
assert.doesNotMatch(page, /<AccordionPanel/, "main dictionary must not be globally collapsible");
assert.ok(["Tipo", "Proceso", "Rol due", "Persona actual", "Etapas", "Roles de apoyo", "Acci"].every((label) => page.includes(label)), "desktop columns must match V2 target");
assert.ok(page.includes('const processListGridColumns = "xl:grid-cols-[88px_minmax(260px,1fr)_144px_132px_86px_160px_154px]"'), "desktop process grid must keep a compact visible action column at 1366px");
assert.doesNotMatch(page, /xl:grid-cols-\[120px_minmax\(300px,1fr\)_180px_180px_110px_220px_150px\]/, "desktop process grid must not use the clipped pre-action layout");
assert.match(page, /hidden gap-3[\s\S]*xl:grid \$\{processListGridColumns\}/, "desktop header must use the shared grid gap and column definition");
assert.match(page, /grid grid-cols-\[minmax\(0,1fr\)_auto\] gap-3 xl:items-center \$\{processListGridColumns\}/, "desktop rows must use the same shared grid definition as the header");
assert.match(page, /<span className="text-right">Acci/, "desktop action header must render as the final column");
assert.match(page, /process\.active_stage_count/, "process list must render active stage count");
assert.match(page, /current_person_names\.length === 0/, "process list must show persona fallback state");
assert.match(page, /function SupportRoleSummary/, "support roles must render through compact chip summary");
assert.match(page, /<ValueBadge tone="neutral">\{uniqueValues\[0\]\}<\/ValueBadge>[\s\S]*<ValueBadge tone="info">\+/, "support +N must be a separate chip");
assert.doesNotMatch(page, /overflow-x-auto/, "mobile list must not force horizontal table scrolling");
assert.ok(page.includes("aria-label={`Expandir o contraer"), "+/- process control must remain accessible");
assert.match(page, /import \{ ProcessEditModal \} from "\.\/process-edit-modal"/, "process list must reuse existing edit modal");
assert.doesNotMatch(page, /triggerLabel="Editar"/, "process row edit action must not show visible Editar text");
assert.match(page, /triggerLabel=""/, "process row edit action must be icon-only");
assert.ok(page.includes("ariaLabel={`Editar proceso ${process.process_name}`}"), "edit action must include accessible label per process");
assert.match(page, /hidden h-9 w-9[\s\S]*xl:inline-flex/, "desktop edit action must be a compact icon-only control in the action column");
assert.match(page, /mb-4 flex flex-col gap-2 sm:flex-row xl:hidden[\s\S]*triggerLabel=""/, "mobile expanded panel must include icon-only Editar");
assert.match(page, /<ProcessDetailModal/, "Ver ficha action must remain available");
assert.doesNotMatch(page, /group-open\/process:hidden[\s\S]*group-open\/process:inline/, "desktop action column must not render the visual +/- control");
assert.match(page, /aria-label={`Expandir o contraer/, "native summary must keep the row expandable after removing +/-");
assert.match(detailModal, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*setOpen\(true\);/, "Ver ficha must not toggle the summary while opening the detail modal");
assert.match(editModal, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*setOpen\(true\);/, "Editar must not toggle the summary while opening the edit modal");
assert.match(editModal, /title="Editar proceso"/, "icon-only edit control must keep a tooltip title");
assert.match(page, /generalQuery[\s\S]*matchesText\(process\.process_name, generalQuery\)[\s\S]*subprocess_name, generalQuery/, "general search must match process or active stage name");

for (const param of ["process_type", "search", "owner_role", "person", "support_role", "empresa", "tipo"]) {
  assert.match(filters + page, new RegExp(param), `filter ${param} must exist`);
}

assert.match(filters, /Buscar proceso o etapa\.\.\./, "general search input must exist");
assert.match(filters, /SlidersHorizontal/, "filters button must use a clear control icon");
assert.match(filters, /aria-expanded=\{filtersOpen\}/, "filters button must expose expanded state");
assert.match(filters, /aria-controls=\{filtersPanelId\}/, "filters button must be associated to advanced panel");
assert.match(filters, /setFiltersOpen\(\(current\) => !current\)/, "filters button must toggle the panel");
assert.ok(filters.includes("advancedFilterCount > 0") && filters.includes("Filtros"), "filters button must show active advanced count");
assert.match(filters, /hasFilters \? \([\s\S]*Limpiar/, "clear button must be conditional");
assert.match(filters, /id=\{filtersPanelId\}/, "advanced filter panel must exist");
assert.match(filters, /owner_role/, "owner role filter must be visible inside advanced panel");
assert.match(filters, /Roles de apoyo/, "support roles filter must be visible inside advanced panel");
assert.match(filters, /Persona/, "person filter must be visible inside advanced panel");
assert.match(filters, /router\.push/, "filters must remain query-string driven");
assert.doesNotMatch(filters, />\s*Proceso\s*<input/i, "process and stage must not remain as separate primary inputs");
assert.doesNotMatch(filters, />\s*Etapa\s*<input/i, "stage must not remain as a separate primary input");
assert.match(filters, /sm:grid-cols-2 xl:grid-cols-4/, "advanced filters must wrap responsively");

assert.match(detailModal, /Entradas y proveedores/, "detail modal must show inputs/providers");
assert.match(detailModal, /Salidas y clientes/, "detail modal must show outputs/clients");
assert.match(detailModal, /KPI basico/, "detail modal must show basic KPI");
assert.match(detailModal, /Roles de apoyo/, "detail modal must show support roles");
assert.match(detailModal, /Etapas \/ subprocesos activos/, "detail modal must label active stages");
assert.doesNotMatch(detailModal, /Ficha V2 de proceso/, "detail modal must not show V2 to users");
assert.match(detailPage, /getProcessCatalogV2Item/, "process detail page must use V2 catalog helper");
assert.match(detailPage, /getProcessMatrixV2/, "process detail page must use V2 stage helper");
assert.doesNotMatch(page + filters + detailModal, /api\/procesos|fetch\(/, "edit UI must not create a new endpoint or fetch flow");

console.log("processes-v2-ui: 66/66 OK");
