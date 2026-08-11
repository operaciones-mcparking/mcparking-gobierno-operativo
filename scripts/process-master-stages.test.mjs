import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const actions = read("src/app/admin/actions.ts");
const editor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const validation = read("src/app/procesos/process-master/process-master-validation.ts");
const mapper = read("src/app/procesos/process-master/process-master-mapper.ts");

const addStart = actions.indexOf("export async function addSubprocessToProcess");
const addEnd = actions.indexOf("export async function addRole", addStart);
const updateStart = actions.indexOf("export async function updateSubprocessDetail");
const updateEnd = actions.indexOf("export async function deleteSubprocess", updateStart);
const deleteStart = actions.indexOf("export async function deleteSubprocess");
const replaceStart = actions.indexOf("async function replaceProcessRole");
const replaceEnd = actions.indexOf("async function replaceSubprocessSupport", replaceStart);
assert.notEqual(addStart, -1, "addSubprocessToProcess must exist");
assert.notEqual(updateStart, -1, "updateSubprocessDetail must exist");
assert.notEqual(deleteStart, -1, "deleteSubprocess compatibility action must exist");
assert.notEqual(replaceStart, -1, "replaceProcessRole must exist");
const addAction = actions.slice(addStart, addEnd);
const updateAction = actions.slice(updateStart, updateEnd);
const deleteAction = actions.slice(deleteStart);
const replaceRole = actions.slice(replaceStart, replaceEnd);

assert.match(editor, /Agregar nueva etapa/, "editor must allow creating stages");
assert.match(addAction, /\.from\("subprocesses"\)[\s\S]*\.insert\(/, "create stage must insert a subprocess");
assert.match(addAction, /name: value\(formData, "name"\)/, "create stage must save name");
assert.match(addAction, /description: optionalValue\(formData, "description"\)/, "create stage must save description");
assert.match(addAction, /criticality/, "create stage must save criticality");
assert.match(addAction, /impact_percent: impactPercent/, "create stage must save subprocess impact_percent");
assert.doesNotMatch(addAction, /\.from\("processes"\)[\s\S]*\.update\([\s\S]*status/, "create stage must not activate the process");
assert.doesNotMatch(addAction, /documentation_status/, "create stage must not change process documentation status");

assert.match(updateAction, /name: value\(formData, "name"\)/, "edit stage must save name");
assert.match(updateAction, /description: optionalValue\(formData, "description"\)/, "edit stage must save description");
assert.match(updateAction, /impact_percent: impactPercent/, "edit stage must use subprocesses.impact_percent as source");
assert.match(updateAction, /\.in\("responsibility_type", \["owner", "user"\]\)/, "legacy process_roles impact sync must remain for owner/user compatibility");
assert.match(editor, /Impacto total actual: \{impactTotal\}%/, "editor must show current impact total");
assert.match(editor, /La suma de impactos es distinta de 100%/, "editor must warn without blocking when impact total differs from 100");
assert.match(editor, /value=\{row\.impact_percent \?\? ""\}/, "editor must allow null impact while drafting");

assert.match(editor, /uniqueRoleOptions\(roleDictionary\)/, "role selectors must derive options from the official dictionary");
assert.match(editor, /role\.role_status !== "active"/, "role options must reject inactive or archived roles client-side");
assert.match(actions, /from\("v_role_dictionary"\)/, "server role validation must use the official role dictionary");
assert.match(actions, /dictionaryRole\.role_status !== "active"/, "server must reject archived or inactive roles");
assert.match(replaceRole, /assertEditableProcess\(supabase, processId, subprocessId\)/, "role change must validate process and subprocess before writing");
assert.match(replaceRole, /\.delete\(\)[\s\S]*\.eq\("responsibility_type", responsibilityType\)/, "changing owner/user/support/backup must replace previous relation of the same type");
assert.match(replaceRole, /role_company_id: roleResolution\.roleCompanyId/, "role assignment must preserve role company context");
assert.match(replaceRole, /responsibility_type: responsibilityType/, "role assignment must keep existing responsibility_type nomenclature");
assert.match(updateAction, /responsibilityType: "owner"[\s\S]*responsibilityType: "user"[\s\S]*responsibilityType: "consulted"[\s\S]*responsibilityType: "backup"/, "stage edit must keep owner/user/consulted/backup mapping");

assert.match(editor, /Persona actual:/, "editor must show derived current person");
assert.match(editor, /currentPersonName/, "role options must carry derived current person");
assert.doesNotMatch(editor, /name="person_id"|current_person_id/, "person must not be manually editable from stage editor");
assert.match(editor, /Rol usuario/, "editor must expose user role when supported by current model");
assert.match(editor, /Rol apoyo/, "editor must expose support role when supported by current model");
assert.match(editor, /Rol respaldo/, "editor must expose backup role when supported by current model");
assert.doesNotMatch(editor, /responsibilityType: "support"/, "editor must not invent a support responsibility_type");

assert.match(editor, /Arrastrar etapa/, "editor must keep safe reordering affordance");
assert.match(actions, /export async function reorderSubprocesses/, "reorder action must remain available");
assert.match(deleteAction, /\.update\(\{ status: "archived" \}\)/, "stage removal must archive instead of deleting");
assert.doesNotMatch(deleteAction, /\.from\("subprocesses"\)[\s\S]*\.delete\(\)/, "stage removal must not delete subprocesses");
assert.match(editor, /Archivar etapa/, "UI must say archive stage, not delete stage");
assert.match(validation, /process\.stages\.filter\(\(stage\) => stage\.status === "active"\)/, "activation validation must ignore inactive/archived stages");
assert.match(mapper, /const activeStages = stages\.filter/, "master mapper must keep active stages as the normal editable set");
assert.match(editPage, /getEditableProcessCatalogItem\(processId\)/, "editor must keep support for inactive draft processes");
assert.match(editPage, /processResult\.data\.status === "archived"/, "archived processes must stay protected");
assert.doesNotMatch(addAction + updateAction + replaceRole, /from\("processes"\)[\s\S]*status: "active"/, "stage actions must not activate draft processes");

console.log("process-master-stages: 39/39 OK");
