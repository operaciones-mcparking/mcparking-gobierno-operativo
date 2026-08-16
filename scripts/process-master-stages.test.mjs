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
assert.notEqual(addStart, -1, "addSubprocessToProcess must exist");
assert.notEqual(updateStart, -1, "updateSubprocessDetail must exist");
assert.notEqual(deleteStart, -1, "deleteSubprocess compatibility action must exist");
const addAction = actions.slice(addStart, addEnd);
const updateAction = actions.slice(updateStart, updateEnd);
const deleteAction = actions.slice(deleteStart);

assert.match(editor, /Agregar etapa/, "editor must allow creating stages from the compact final row");
assert.match(editor, /initiallyOpen[\s\S]*addDetailsRef\.current\.open = true/, "stage editor must support opening the compact add form after auto-save");
assert.match(editor, /useLayoutEffect[\s\S]*process-draft-scroll[\s\S]*sessionStorage\.removeItem[\s\S]*requestAnimationFrame[\s\S]*window\.scrollTo/, "stage editor must consume and restore the saved scroll position after the route remount");
assert.match(editPage, /initiallyOpen=\{messages\.addStage === "1"\}/, "edit route must open stage creation after the transparent transition");
assert.doesNotMatch(addAction, /done\(|redirect\(|revalidatePath\(/, "inline stage creation must not redirect or revalidate the current route");
assert.match(editor, /onSubmit=\{handleAddStage\}/, "compact add form must submit without native navigation");
assert.match(editor, /setRows\(\(currentRows\) => \[\.\.\.currentRows, result\.stage\]\)/, "created stage must appear from the returned persisted row");
assert.match(editor, /form\.reset\(\)[\s\S]*addDetailsRef\.current\.open = false/, "successful creation must reset and close the add form");
assert.doesNotMatch(editor, /window\.location|\.reload\(/, "stage creation must never reload the browser");

assert.match(editor, /Actividades clave/, "stage editor must describe stages as key activities");
assert.match(editor, /Nombre de la etapa/, "stage form must expose the activity name");
assert.match(editor, /name="description"/, "stage form must expose the activity description");
assert.match(editor, /name="sort_order" type="hidden"/, "stage order must remain internal");
assert.match(addAction, /\.from\("subprocesses"\)[\s\S]*\.insert\([\s\S]*\.select\("id,name,description,sort_order"\)[\s\S]*\.single\(\)/, "create stage must insert and return the persisted subprocess");
assert.match(addAction, /name: value\(formData, "name"\)/, "create stage must save name");
assert.match(addAction, /description: optionalValue\(formData, "description"\)/, "create stage must save description");
assert.match(addAction, /sort_order: numberValue\(formData, "sort_order"\)/, "create stage must save internal order");
assert.doesNotMatch(addAction, /frequency|criticality|impact_percent|process_roles|process_systems|risks|controls/, "create stage must not mix removed concepts");
assert.doesNotMatch(addAction, /replaceProcessRole|replaceSubprocessSupport/, "create stage must not mutate role or support relations");
assert.doesNotMatch(addAction, /\.from\("processes"\)[\s\S]*\.update\([\s\S]*status/, "create stage must not activate the process");
assert.doesNotMatch(addAction, /documentation_status/, "create stage must not change process documentation status");

assert.match(updateAction, /const name = value\(formData, "name"\)[\s\S]*\.update\(\{[\s\S]*name,/, "edit stage must save name");
assert.match(updateAction, /description: optionalValue\(formData, "description"\)/, "edit stage must save description");
assert.match(updateAction, /sort_order: numberValue\(formData, "sort_order"\)/, "edit stage must preserve order");
assert.doesNotMatch(updateAction, /frequency|criticality|impact_percent|impact_all:|process_roles|process_systems|risks|controls/, "edit stage must not mutate removed concepts");
assert.doesNotMatch(updateAction, /replaceProcessRole|replaceSubprocessSupport/, "edit stage must not mutate role or support relations");
assert.doesNotMatch(updateAction, /done\(|redirect\(|revalidatePath\(/, "inline stage update must not navigate or revalidate the current route");
assert.match(updateAction, /\.select\("id,name,description,sort_order"\)[\s\S]*stage:/, "inline stage update must return the persisted row");
assert.match(editor, /handleUpdateStage[\s\S]*event\.preventDefault\(\)[\s\S]*setRows/, "stage update must preserve the open editor and update local state");

for (const removed of [
  "Frecuencia",
  "Criticidad",
  "Impacto %",
  "Rol dueno",
  "Rol usuario",
  "Rol apoyo",
  "Rol respaldo",
  "Sistemas",
  "Riesgo principal",
  "Control principal",
]) {
  assert.doesNotMatch(editor, new RegExp(removed), `stage editor must not show ${removed}`);
}
for (const removedName of [
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
  assert.doesNotMatch(editor, new RegExp(`name="${removedName}"`), `stage editor must not submit ${removedName}`);
}

const compactSummary = editor.slice(editor.indexOf('<summary className="cursor-pointer list-none px-3 py-2.5'), editor.indexOf('<div className="border-t border-line bg-[#fbfdfe]'));
assert.match(compactSummary, /GripVertical[\s\S]*sort_order \?\? index \+ 1[\s\S]*row\.subprocess_name[\s\S]*ChevronDown/, "collapsed stage row must show only handle, order, name and disclosure");
assert.doesNotMatch(compactSummary, /Persona|Criticidad|Impacto|Sistemas|Riesgo|Control/, "collapsed row must not expose technical details");
assert.ok(editor.indexOf("{rows.map") < editor.lastIndexOf("Agregar etapa"), "add-stage row must appear after existing stages");
assert.match(editor, /<details className="group">[\s\S]*onSubmit=\{handleUpdateStage\}/, "opening a compact row must reveal the inline editor");
assert.match(editor, /Arrastrar etapa/, "editor must keep safe reordering affordance");
assert.match(actions, /export async function reorderSubprocesses/, "reorder action must remain available");
assert.match(deleteAction, /\.update\(\{ status: "archived" \}\)/, "stage removal must archive instead of deleting");
assert.doesNotMatch(deleteAction, /\.from\("subprocesses"\)[\s\S]*\.delete\(\)/, "stage removal must not delete subprocesses");
assert.match(editor, /Archivar etapa/, "UI must say archive stage, not delete stage");
assert.match(validation, /process\.stages\.filter\(\(stage\) => stage\.status === "active"\)/, "activation validation must ignore inactive/archived stages");
assert.doesNotMatch(validation, /stage_owner:|stage_impact:|stage_impact_range:|impact_total|stage_backup:|stage_support:/, "activation must not depend on removed stage fields");
assert.match(mapper, /const activeStages = stages\.filter/, "master mapper must keep active stages as the normal editable set");
assert.match(editPage, /getEditableProcessCatalogItem\(processId\)/, "editor must keep support for inactive draft processes");
assert.match(editPage, /processResult\.data\.status === "archived"/, "archived processes must stay protected");
assert.doesNotMatch(addAction + updateAction, /from\("processes"\)[\s\S]*status: "active"/, "stage actions must not activate draft processes");

console.log("process-master-stages: 45/45 OK");
