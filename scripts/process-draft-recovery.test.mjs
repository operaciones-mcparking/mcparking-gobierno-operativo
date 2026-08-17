import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const actions = read("src/app/admin/actions.ts");
const form = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const drafts = read("src/lib/procesos/process-drafts.ts");
const structure = read("src/app/estructura/page.tsx");

test("new names keep the existing atomic draft creation", () => {
  assert.match(actions, /create_process_draft_with_document_header/);
});

test("same company and name are resolved before insert", () => {
  assert.match(actions, /\.from\("processes"\)[\s\S]*\.eq\("company_id", companyId\)[\s\S]*\.eq\("name", name\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(actions, /if \(existingResult\.data\)/);
});

test("draft conflict returns its real identity without creating another row", () => {
  assert.match(actions, /editable \? "continue"/);
  assert.match(actions, /return \{ error: null, existingProcess, processId: null \}/);
  assert.ok(actions.indexOf("if (existingResult.data)") < actions.indexOf('"create_process_draft_with_document_header"'));
});

test("create UI offers continue for draft and view for active", () => {
  assert.match(form, /Continuar borrador/);
  assert.match(form, /Ver proceso/);
  assert.match(form, /`\/procesos\/\$\{existingProcess\.id\}\/editar`/);
  assert.match(form, /`\/procesos\/\$\{existingProcess\.id\}`/);
});

test("same name in another company is not treated as conflict", () => {
  assert.match(actions, /\.eq\("company_id", companyId\)/);
});

test("structure lists only new-model drafts and keeps legacy catalog separate", () => {
  assert.match(drafts, /\.eq\("status", "inactive"\)/);
  assert.match(drafts, /\.eq\("documentation_status", "draft"\)/);
  assert.match(drafts, /\.not\("process_code", "is", null\)/);
  assert.match(structure, /Borradores \(\{processDraftsResult\.data\.length\}\)/);
  assert.match(structure, /href=\{`\/procesos\/\$\{draft\.id\}\/editar`\}/);
  assert.match(structure, /catalogMode="new-only"/);
});


test("official catalog precedes a draft list collapsed by default", () => {
  assert.ok(structure.indexOf("<ProcessCatalogClient") < structure.indexOf('className="group/drafts'));
  assert.match(structure, /<details className="group\/drafts/);
  assert.doesNotMatch(structure, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(structure, /Borradores \(\{processDraftsResult\.data\.length\}\)/);
  assert.match(structure, /group-open\/drafts:hidden">Ver borradores/);
  assert.match(structure, /hidden group-open\/drafts:inline">Ocultar/);
  assert.match(structure, /processDraftsResult\.data\.length > 0/);
});test("draft lookup stays server-only and admin-authorized", () => {
  assert.match(drafts, /import "server-only"/);
  assert.match(drafts, /profile\.app_role !== "admin"/);
  assert.match(drafts, /createSupabaseAdminClient/);
});