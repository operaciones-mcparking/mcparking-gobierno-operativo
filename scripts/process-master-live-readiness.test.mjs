import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const validation = read("src/app/procesos/process-master/process-master-validation.ts");
const coordinator = read("src/app/procesos/process-master/process-master-save-coordinator.tsx");
const sectionForm = read("src/app/procesos/process-master/process-section-form.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const activationPanel = read("src/app/procesos/[processId]/editar/process-activation-panel.tsx");
const stageEditor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");
const actions = read("src/app/admin/actions.ts");
const archiveStart = actions.indexOf("export async function deleteSubprocess");
const archiveEnd = actions.indexOf("export async function ", archiveStart + 10);
const archiveAction = actions.slice(archiveStart, archiveEnd < 0 ? actions.length : archiveEnd);

assert.match(validation, /export function evaluateProcessActivationReadiness\(snapshot:/, "readiness rules must be a shared pure evaluator");
assert.match(validation, /validateProcessForActivation[\s\S]*evaluateProcessActivationReadiness\(createProcessActivationSnapshot\(process\)\)/, "server validation must reuse the same readiness rules");
for (const field of ["objective", "supplierOrigin", "processInputs", "processOutputs", "clientDestination", "activeStageCount"]) {
  assert.match(validation, new RegExp(`snapshot\\.${field}`), `${field} must be evaluated from the current snapshot`);
}
assert.match(coordinator, /readinessSnapshot[\s\S]*evaluateProcessActivationReadiness\(context\.readinessSnapshot\)[\s\S]*getProcessActivationCompleteness\(validation\)/, "missing fields and percentage must use one snapshot");
assert.match(sectionForm, /onChange=[\s\S]*new FormData\(event\.currentTarget\)[\s\S]*updateReadinessSnapshot\(patch\)/, "document forms must publish local values without reading the DOM");
for (const mapping of [
  'readinessFields={{ purpose: "objective" }}',
  'supplier_origin: "supplierOrigin"',
  'process_inputs: "processInputs"',
  'process_outputs: "processOutputs"',
  'client_destination: "clientDestination"',
]) {
  assert.ok(editPage.includes(mapping), `edit page must map ${mapping} to live readiness`);
}
assert.ok(editPage.includes('readinessFields={{ area_id: "areaId", name: "name", process_type: "processType" }}'), "operation type changes must update live readiness from the header");
assert.match(validation, /if \(!hasText\(snapshot\.areaId\)\)[\s\S]*key: "area_id"[\s\S]*label: "Tipo de operación no asignado"/, "the optional operation type warning must use business terminology and current local state");
assert.match(stageEditor, /activeStageCount: rows\.length[\s\S]*setRows\(\(currentRows\) => \[\.\.\.currentRows, result\.stage\]\)/, "adding a stage must update the active-stage requirement from local rows");
assert.match(stageEditor, /activeStageCount: rows\.length[\s\S]*handleArchiveStage[\s\S]*setRows\(\(currentRows\) => currentRows\.filter/, "archiving a stage must update readiness without refresh");
assert.match(activationPanel, /useProcessMasterReadiness\(\)[\s\S]*disabled=\{!isReady \|\| hasChanges \|\| isSaving\}/, "live readiness must never activate while local changes are dirty");
assert.match(actions, /activateProcess[\s\S]*validateProcessForActivation\(readModel\.process\)/, "the server must remain activation authority");
assert.match(archiveAction, /Promise<\{ error: string \| null \}>[\s\S]*return \{ error: error\?\.message \?\? null \}/, "stage archive must return an inline result");
assert.doesNotMatch(archiveAction, /redirect\(|revalidatePath\(|done\(|fail\(/, "stage archive must update local readiness without navigation");
assert.doesNotMatch(coordinator + sectionForm + activationPanel + stageEditor, /router\.refresh|redirect\(|window\.location|location\.reload|querySelector/, "readiness recalculation must not navigate, reload or query the DOM");

console.log("process-master-live-readiness: OK");