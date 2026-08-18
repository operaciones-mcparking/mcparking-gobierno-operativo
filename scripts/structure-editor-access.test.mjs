import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260818120000_add_structure_editor_access.sql", "utf8");
const access = readFileSync("src/lib/auth/access.ts", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const structurePage = readFileSync("src/app/estructura/page.tsx", "utf8");
const explorer = readFileSync("src/app/estructura/structure-explorer.tsx", "utf8");
const catalog = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");
const actions = readFileSync("src/app/admin/actions.ts", "utf8");
const excelRoute = readFileSync("src/app/api/procesos/export/route.ts", "utf8");
const pdfRoute = readFileSync("src/app/api/procesos/[processId]/pdf/route.ts", "utf8");
const shell = readFileSync("src/components/dashboard/shell.tsx", "utf8");

const permissionCodes = [
  "structure.view",
  "structure.matrix.edit",
  "structure.export.excel",
  "structure.export.pdf",
];

assert.match(migration, /^begin;/);
assert.match(migration, /commit;\s*$/);
for (const code of permissionCodes) {
  assert.match(migration, new RegExp("\\('" + code.replaceAll(".", "\\.") + "'|'" + code.replaceAll(".", "\\.") + "'"));
  assert.match(access, new RegExp('"' + code.replaceAll(".", "\\.") + '"'));
}
assert.match(migration, /'STRUCTURE_EDITOR'/);
assert.match(migration, /on conflict \(code\) do update/);
assert.match(migration, /on conflict \(role_code\) do update/);
assert.match(migration, /on conflict \(access_role_id, permission_id\) do update/);
assert.match(migration, /delete from public\.access_role_permissions relation[\s\S]*role\.role_code = 'STRUCTURE_EDITOR'[\s\S]*permission\.code not in/);
assert.match(migration, /create or replace function public\.current_user_has_permission\(p_permission_code text\)/);
assert.match(migration, /create or replace function public\.current_user_has_access_role\(p_role_code text\)/);
assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 2, "both SECURITY DEFINER helpers must use an empty search_path");
assert.match(migration, /revoke all on function public\.current_user_has_permission\(text\) from public, anon/);
assert.match(migration, /grant execute on function public\.current_user_has_permission\(text\) to authenticated, service_role/);
assert.match(migration, /drop policy if exists "mvp_role_governance_processes_write"/);
assert.match(migration, /with check \(public\.current_user_has_permission\('structure\.matrix\.edit'\)\)/);
assert.match(migration, /revoke insert, update, delete on public\.role_governance_processes from public, anon/);
assert.doesNotMatch(migration, /grant .*delete.*role_governance_processes.*authenticated/i);
assert.doesNotMatch(migration, /@[a-z0-9.-]+/i);

assert.match(access, /supabase\.rpc\("current_user_has_permission", \{ p_permission_code: structurePermissions\.view \}\)/);
assert.match(access, /supabase\.rpc\("current_user_has_permission", \{ p_permission_code: structurePermissions\.editMatrix \}\)/);
assert.match(access, /supabase\.rpc\("current_user_has_permission", \{ p_permission_code: structurePermissions\.exportExcel \}\)/);
assert.match(access, /supabase\.rpc\("current_user_has_permission", \{ p_permission_code: structurePermissions\.exportPdf \}\)/);
assert.match(access, /canEditMatrix: isAdmin \|\| editResult\.data === true/);
assert.match(access, /canExportExcel: isAdmin \|\| !isStructureRestricted \|\| excelResult\.data === true/);
assert.match(access, /canExportPdf: isAdmin \|\| !isStructureRestricted \|\| pdfResult\.data === true/);
assert.match(access, /canNavigateProcesses: !isStructureRestricted/);

assert.match(middleware, /pathname === "\/api\/procesos\/export"[\s\S]*"structure\.export\.excel"/);
assert.match(middleware, /pdfPath\.test\(pathname\)[\s\S]*"structure\.export\.pdf"/);
assert.match(middleware, /if \(!requiredPermission\) return denied\(request\)/);
assert.match(middleware, /requiredPermission === "structure\.view" \? loginDenied\(request\) : denied\(request\)/);
assert.doesNotMatch(middleware, /requiredPermission.*processes/i);
assert.match(shell, /access\?\.isStructureRestricted \? item\.href === "\/estructura"/);

assert.match(excelRoute, /canUseStructurePermission\(structurePermissions\.exportExcel\)/);
assert.match(excelRoute, /return jsonError\("No autorizado\.", 403\)/);
assert.match(pdfRoute, /canUseStructurePermission\(structurePermissions\.exportPdf\)/);
assert.match(pdfRoute, /return jsonError\("No autorizado\.", 403\)/);
assert.doesNotMatch(excelRoute + pdfRoute, /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE/);

assert.match(actions, /getStructurePermissionClient\(structurePermissions\.editMatrix\)/);
assert.match(explorer, /if \(!canEdit \|\| !matrixEditingEnabled \|\| !item\.id\) return/);
assert.match(structurePage, /canEdit=\{structureAccess\.canEditMatrix\}/);
assert.match(structurePage, /structureAccess\.canExportExcel \? <ProcessExcelDownloadButton \/>/);
assert.match(structurePage, /canExportPdf=\{structureAccess\.canExportPdf\}/);
assert.match(structurePage, /canViewProcessDetails=\{structureAccess\.canNavigateProcesses\}/);
assert.match(structurePage, /structureAccess\.canNavigateProcesses[\s\S]*\? getProcessDrafts\(context\)/);
assert.match(catalog, /canViewProcessDetails \? <ProcessDetailModal/);
assert.match(catalog, /canExportPdf \? <a/);
assert.doesNotMatch(access + middleware + structurePage + migration, /[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i);

console.log("structure-editor-access: 48/48 OK");
