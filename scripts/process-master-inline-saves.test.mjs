import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const actions = read("src/app/admin/actions.ts");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const sectionForm = read("src/app/procesos/process-master/process-section-form.tsx");
const roleEditor = read("src/app/procesos/process-master/process-role-profiles-editor.tsx");
const metricEditor = read("src/app/procesos/process-master/process-metrics-editor.tsx");
const riskEditor = read("src/app/procesos/process-master/process-risks-controls-editor.tsx");
const coordinator = read("src/app/procesos/process-master/process-master-save-coordinator.tsx");
const stageEditor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");

const slice = (startToken, endToken) => {
  const start = actions.indexOf(startToken);
  const end = actions.indexOf(endToken, start);
  assert.notEqual(start, -1, `${startToken} must exist`);
  assert.notEqual(end, -1, `${endToken} must exist after ${startToken}`);
  return actions.slice(start, end);
};
const inlineBasics = slice("async function persistProcessBasics", "export async function updateProcessBasics");
const roleSave = slice("export async function saveProcessRoleProfiles", "const processMetricFrequencies");
const metricSave = slice("export async function saveProcessMetrics", "export async function saveProcessRisksAndControls");
const riskSave = slice("export async function saveProcessRisksAndControls", "async function persistProcessBasics");
const stageUpdate = slice("export async function updateSubprocessDetail", "export async function deleteSubprocess");
const reorder = slice("export async function reorderSubprocesses", "export async function updateSubprocessImpacts");

assert.equal((editPage.match(/<ProcessSectionForm action=\{saveProcessBasicsInline\}/g) ?? []).length, 3, "header, section 1 and section 2 must use inline client forms");
for (const id of ["header", "purpose", "flow"]) assert.match(editPage, new RegExp(`sectionId="${id}"`), `${id} must register with the master save coordinator`);
assert.doesNotMatch(editPage, /<form action=\{updateProcessBasics\}/, "the edit sheet must not use native process-basic Server Action forms");
assert.match(sectionForm, /^'use client';[\s\S]*useProcessMasterSaveSection[\s\S]*new FormData\(formRef\.current\)[\s\S]*event\.preventDefault\(\)/, "inline section forms must register their real Server Action without navigation");
assert.match(coordinator, /Guardando ficha\.\.\./, "the master coordinator must expose pending feedback");
assert.match(coordinator, /\\u2713 Ficha guardada/, "the master coordinator must expose success feedback");
assert.match(sectionForm, /aria-live="polite"[\s\S]*\{message\}/, "inline forms must expose local error feedback");
assert.doesNotMatch(sectionForm, /router\.|window\.location|location\.reload|window\.scroll|redirect|revalidatePath/, "inline section forms must not navigate, reload or manipulate scroll");

assert.match(inlineBasics, /from\("processes"\)\.update\(updates\)\.eq\("id", processId\)/, "inline basics must persist real process fields");
assert.match(inlineBasics, /saveProcessBasicsInline[\s\S]*return persistProcessBasics\(formData\)/, "inline basics must return a structured result");
assert.doesNotMatch(inlineBasics, /redirect\(|revalidatePath\(|done\(|fail\(/, "inline basics must not redirect or revalidate");
assert.match(editPage, /<ProcessMasterSaveCoordinator[^>]*>[\s\S]*<ProcessMasterSheet/, "the edit sheet must expose one coordinated save boundary");



for (const [name, source] of [["section 3", roleSave], ["section 4", metricSave], ["section 5", riskSave]]) {
  assert.doesNotMatch(source, /redirect\(|revalidatePath\(|router\./, `${name} save must not navigate or revalidate`);
}
assert.match(roleEditor, /useProcessMasterSaveSection[\s\S]*action\(processId[\s\S]*setMessage/, "section 3 must preserve local rows and register its block save");
assert.match(metricSave, /savedRows\.push\(\{ \.\.\.row, id: metricId \}\)[\s\S]*data: savedRows/, "section 4 must return real persisted metric ids");
assert.match(metricEditor, /setRows[\s\S]*result\.data\?\.\[index\]\?\.id/, "section 4 must synchronize returned ids locally");
assert.match(riskSave, /savedRows\.push\(\{ \.\.\.row, controlId, riskId \}\)[\s\S]*data: savedRows/, "section 5 must return real persisted risk and control ids");
assert.match(riskEditor, /controlId: result\.data\?\.\[index\]\?\.controlId[\s\S]*riskId: result\.data\?\.\[index\]\?\.riskId/, "section 5 must synchronize returned ids locally");

assert.doesNotMatch(stageUpdate, /redirect\(|revalidatePath\(|done\(|fail\(/, "Guardar etapa must return without navigation");
assert.match(stageUpdate, /\.select\("id,name,description,sort_order"\)[\s\S]*stage:/, "Guardar etapa must return its persisted row");
assert.match(stageEditor, /handleUpdateStage[\s\S]*event\.preventDefault\(\)[\s\S]*setRows/, "Guardar etapa must update the existing local row");
assert.match(stageEditor, /handleAddStage[\s\S]*event\.preventDefault\(\)[\s\S]*result\.stage[\s\S]*setRows/, "Agregar etapa must keep its approved inline flow");
assert.doesNotMatch(reorder, /revalidatePath\(|redirect\(/, "stage reordering must not remount the sheet");
assert.doesNotMatch(editPage + sectionForm + roleEditor + metricEditor + riskEditor + stageEditor, /router\.refresh\(|window\.location|location\.reload/, "no ficha save may refresh or reload the browser");

console.log("process-master-inline-saves: OK");