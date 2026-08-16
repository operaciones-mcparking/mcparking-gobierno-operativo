import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const actions = read("src/app/admin/actions.ts");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const editor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const validation = read("src/app/procesos/process-master/process-master-validation.ts");
const schema = read("supabase/migrations/20260812120000_extend_process_master_sheet.sql");

for (const section of [
  "1. PROP\\u00d3SITO Y ALCANCE",
  "2. ENTRADAS, ACTIVIDADES Y SALIDAS",
  "3. ROLES, RESPONSABILIDADES Y AUTORIDAD",
  "4. INDICADORES Y OBJETIVOS",
  "5. RIESGOS, CONTROLES Y OPORTUNIDADES",
]) {
  assert.ok(sheet.includes(section), "V1 sheet must show " + section);
}
assert.doesNotMatch(sheet, /6\. Documentos y registros asociados/, "V1 sheet must hide documents");
assert.doesNotMatch(sheet, /7\. Ciclo de mejora/, "V1 sheet must hide PDCA");
assert.doesNotMatch(createForm + editPage, /name="pdca_(plan|do|check|act)"/, "V1 editors must hide PDCA");

for (const field of ["name", "description"]) {
  assert.match(editor, new RegExp(`name="${field}"`), `stage editor must expose ${field}`);
}
for (const field of [
  "frequency",
  "criticality",
  "impact_percent",
  "owner_role_id",
  "user_role_id",
  "support_role_id",
  "backup_role_id",
  "system_ids",
  "risk_name",
  "control_name",
]) {
  assert.doesNotMatch(editor, new RegExp(`name="${field}"`), `stage editor must hide ${field}`);
}

const addStart = actions.indexOf("export async function addSubprocessToProcess");
const addEnd = actions.indexOf("export async function addRole", addStart);
const updateStart = actions.indexOf("export async function updateSubprocessDetail");
const updateEnd = actions.indexOf("export async function deleteSubprocess", updateStart);
const stageActions = actions.slice(addStart, addEnd) + actions.slice(updateStart, updateEnd);
assert.match(stageActions, /name: value\(formData, "name"\)/, "stage actions must save names");
assert.match(stageActions, /description: optionalValue\(formData, "description"\)/, "stage actions must save descriptions");
assert.match(stageActions, /sort_order: numberValue\(formData, "sort_order"\)/, "stage actions must retain technical order");
assert.doesNotMatch(stageActions, /replaceProcessRole|replaceSubprocessSupport|process_roles|process_systems|risks|controls/, "stage actions must stay separated from roles and support");
assert.doesNotMatch(validation, /stage_owner:|stage_impact:|impact_total|stage_backup:|stage_support:/, "activation must not require removed stage concepts");

assert.match(sheet, /process\.processCode/, "process code must remain readable");
assert.doesNotMatch(sheet, /process\.process\.version|DocumentaryField label="Version"/, "version must stay hidden until formal versioning exists");
assert.doesNotMatch(createForm + editPage, /name="process_code"|name="version"/, "process code and version must stay read-only");
assert.match(sheet, /text\(process\.process\.processCode, "Sin codigo"\)/, "historical null code must use a safe fallback");
assert.match(read("src/app/procesos/process-master/process-master-types.ts"), /version: string \| null/, "the version field must remain in the DTO contract");

assert.match(schema, /create table public\.process_role_profiles/, "existing schema supports centralized role profiles");
assert.match(schema, /responsibility_description text[\s\S]*authority_description text[\s\S]*accountability_description text/, "role schema supports V1 responsibility fields");
assert.match(schema, /alter table public\.metrics[\s\S]*add column formula text[\s\S]*add column target text/, "metric schema supports formula and target");
assert.match(schema, /add column risk_type text/, "risk schema supports risk and opportunity classification");
assert.match(schema, /add column evidence text/, "control schema supports evidence");
assert.doesNotMatch(editor, /process_role_profiles|metrics|risk_type|evidence/, "stage editor must not absorb centralized sections");

console.log("process-master-v1: 41/41 OK");
