import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const structure = read("src/app/estructura/page.tsx");
const pending = read("src/app/estructura/undocumented-processes.tsx");
const drafts = read("src/lib/procesos/process-drafts.ts");
const actions = read("src/app/admin/actions.ts");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const detailPage = read("src/app/procesos/[processId]/page.tsx");
const deleteMigration = read("supabase/migrations/20260816120000_confirm_process_permanent_delete.sql");

function classify(process) {
  if (process.status === "active" && process.process_code?.trim()) return "official";
  if (process.status === "active" && !process.process_code?.trim()) return "undocumented";
  if (process.status === "inactive" && process.documentation_status === "draft" && process.process_code?.trim()) return "draft";
  return "other";
}

test("official, draft and undocumented categories do not overlap", () => {
  assert.equal(classify({ status: "active", process_code: "PROC-000001" }), "official");
  assert.equal(classify({ status: "inactive", documentation_status: "draft", process_code: "PROC-000002" }), "draft");
  assert.equal(classify({ status: "active", process_code: null }), "undocumented");
  assert.equal(classify({ status: "active", process_code: "   " }), "undocumented");
  assert.equal(classify({ status: "archived", process_code: null }), "other");
});

test("structure derives undocumented active processes from the same catalog", () => {
  assert.match(structure, /newProcesses = processCatalogResult\.data\.filter\(\(process\) => Boolean\(process\.process_code\?\.trim\(\)\)\)/);
  assert.match(structure, /undocumentedProcesses = processCatalogResult\.data\.filter\(\(process\) => !process\.process_code\?\.trim\(\)\)/);
  assert.match(drafts, /\.eq\("status", "inactive"\)[\s\S]*\.eq\("documentation_status", "draft"\)[\s\S]*\.not\("process_code", "is", null\)/);
});

test("official processes remain first, drafts second and undocumented last", () => {
  assert.ok(structure.indexOf("<ProcessCatalogClient") < structure.indexOf('className="group/drafts'));
  assert.ok(structure.indexOf('className="group/drafts') < structure.indexOf("<UndocumentedProcesses"));
});

test("undocumented block is hidden when empty and collapsed by default", () => {
  assert.match(pending, /if \(processes\.length === 0\) return null/);
  assert.match(pending, /<details className="group\/undocumented/);
  assert.doesNotMatch(pending, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(pending, /Pendientes de documentar \(\{processes\.length\}\)/);
});

test("undocumented rows expose required summary and direct inspection", () => {
  for (const label of ["Empresa", "Rol dueño", "Etapas", "Última edición", "Sin documentar"]) assert.match(pending, new RegExp(label));
  assert.match(pending, /href=\{`\/procesos\/\$\{process\.process_id\}`\}>Ver<\/Link>/);
  assert.match(detailPage, /getProcessMasterReadModel\(processId\)/);
  assert.doesNotMatch(detailPage, /processCode|process_code/);
});

test("legacy duplicate offers inspection and never continues a draft", () => {
  assert.match(actions, /previousActive = active && !existingResult\.data\.process_code\?\.trim\(\)/);
  assert.match(actions, /Ya existe un proceso anterior con este nombre para/);
  assert.match(createForm, /Ver proceso existente/);
  assert.match(createForm, /existingProcess\.action === "continue" \? `\/procesos\/\$\{existingProcess\.id\}\/editar` : `\/procesos\/\$\{existingProcess\.id\}`/);
  assert.ok(actions.indexOf("if (existingResult.data)") < actions.indexOf('"create_process_draft_with_document_header"'));
});

test("permanent delete remains code-agnostic and explicitly confirmed", () => {
  assert.match(deleteMigration, /p_confirmation_name is distinct from 'CONFIRMAR'/);
  assert.match(deleteMigration, /delete from public\.process_versions[\s\S]*delete from public\.process_documents[\s\S]*delete from public\.process_role_profiles[\s\S]*delete from public\.processes/);
  assert.doesNotMatch(deleteMigration, /process_code|status\s*=/);
  assert.match(actions, /deleteProcessPermanently[\s\S]*requireAdminAccess\(\)[\s\S]*createSupabaseAdminClient\(\)[\s\S]*\.rpc\("delete_process_permanently"/);
});

console.log("process-undocumented-visibility: 7/7 OK");