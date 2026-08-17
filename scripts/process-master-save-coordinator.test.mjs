import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const coordinator = read("src/app/procesos/process-master/process-master-save-coordinator.tsx");
const wizard = read("src/app/procesos/process-master/process-wizard-shell.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const activationPanel = read("src/app/procesos/[processId]/editar/process-activation-panel.tsx");
const sectionForm = read("src/app/procesos/process-master/process-section-form.tsx");
const roleEditor = read("src/app/procesos/process-master/process-role-profiles-editor.tsx");
const metricEditor = read("src/app/procesos/process-master/process-metrics-editor.tsx");
const riskEditor = read("src/app/procesos/process-master/process-risks-controls-editor.tsx");
const stageEditor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");

assert.match(editPage, /<ProcessMasterSaveCoordinator[^>]*>[\s\S]*<ProcessActivationPanel[\s\S]*<ProcessMasterSheet[\s\S]*<\/ProcessMasterSaveCoordinator>/, "EDIT must wrap activation and the complete sheet in the master save coordinator");
for (const id of ["header", "purpose", "flow"]) {
  assert.match(editPage, new RegExp(`sectionId="${id}"[\\s\\S]*sectionLabel=`), `${id} must register an explicit dirty section`);
}assert.match(coordinator, /dirtyIds\.size > 0[\s\S]*Cambios sin guardar[\s\S]*Ficha guardada/, "master bar must expose saved and dirty states");
assert.match(coordinator, /disabled=\{!hasChanges \|\| isSaving\}/, "master save must be disabled without changes and while saving");
assert.match(coordinator, /Guardando ficha\.\.\.[\s\S]*Guardar ficha/, "master save must expose pending state");
assert.match(coordinator, /fixed inset-0 z-\[100\][\s\S]*role="status"/, "saving must render an accessible full-viewport overlay");
assert.match(coordinator, /LoaderCircle[\s\S]*animate-spin[\s\S]*Guardando ficha\.\.\.[\s\S]*Por favor espera, no cierres esta página\./, "saving overlay must provide visible progress and wait guidance");
assert.match(coordinator, /saveInFlightRef\.current[\s\S]*finally \{[\s\S]*saveInFlightRef\.current = false;[\s\S]*setIsSaving\(false\)/, "master save must reject duplicate submissions and always clear saving state");
assert.match(coordinator, /pointer-events-none[\s\S]*inert=\{overlayState !== 'idle'\}/, "saving and saved-ready must block interaction with the editor below the overlay");
assert.match(wizard, /pending \|\| isNavigating \|\| Boolean\(saveState\?\.isSaving\)/, "wizard navigation must remain blocked throughout master saving");
assert.match(coordinator, /type SaveOverlayState = 'idle' \| 'saving' \| 'saved-ready'/, "overlay lifecycle must keep saving and saved-ready as distinct states");
assert.match(coordinator, /showSavedReady = canOfferActivation[\s\S]*failures\.length === 0[\s\S]*!hasConcurrentChanges[\s\S]*evaluateProcessActivationReadiness\(readinessSnapshot\)\.isValid/, "saved-ready must require an inactive candidate, a complete save and shared readiness");
assert.match(coordinator, /overlayState === 'saving'[\s\S]*LoaderCircle[\s\S]*Ficha guardada correctamente[\s\S]*Activar proceso[\s\S]*Activar después/, "successful ready saves must replace the spinner with activation choices");
assert.match(coordinator, /onClick=\{\(\) => setOverlayState\('idle'\)\}[\s\S]*Activar después/, "activating later must only dismiss the success overlay");
assert.match(coordinator, /setOverlayState\('idle'\);[\s\S]*activationPromptRef\.current\?\.\(\)/, "activation choice must delegate to the registered confirmation flow");
assert.match(activationPanel, /useProcessMasterActivationPrompt[\s\S]*registerActivationPrompt\(\(\) => setConfirmOpen\(true\)\)/, "the overlay must open the existing activation confirmation modal");
assert.match(editPage, /canOfferActivation=\{process\.status === "inactive"\}/, "active processes must never receive the post-save activation offer");
assert.match(coordinator, /catch \{[\s\S]*No se pudo guardar la ficha[\s\S]*finally \{[\s\S]*setOverlayState\(showSavedReady \? 'saved-ready' : 'idle'\)/, "errors must clear saving without showing a false success state");
assert.match(coordinator, /sticky top-3[\s\S]*sm:flex-row/, "master action bar must be sticky and responsive");
assert.match(coordinator, /for \(const id of dirtyIds\)[\s\S]*section\.save\(\)/, "master save must call only dirty registered sections");
assert.match(coordinator, /versionAtStart[\s\S]*versionsRef\.current\.get\(id\)[\s\S]*next\.delete\(id\)/, "successful saves must clear dirty only when no newer edit exists");
assert.match(coordinator, /failures\.push\(section\.label\)[\s\S]*Se guard\\u00f3 parcialmente\. Revisa:/, "failed sections must remain dirty and be named in partial feedback");
assert.match(coordinator, /\\u2713 Ficha guardada/, "a complete master save must expose concise success feedback");
assert.doesNotMatch(coordinator, /router\.|redirect\(|revalidatePath\(|window\.location|location\.reload|scrollTo/, "master save must not navigate, refresh or move scroll");

assert.match(sectionForm, /onChange=\{\(event\) => \{[\s\S]*markDirty\(\)/, "header and sections 1-2 must mark dirty explicitly");
assert.match(sectionForm, /action\(new FormData\(formRef\.current\)\)/, "document forms must reuse their real inline Server Action");
assert.match(sectionForm, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/, "document forms must prevent native submission");
assert.doesNotMatch(sectionForm, /<button|Guardar cabecera|Guardar prop|Guardar entradas/, "document forms must not expose individual save buttons");

for (const [id, source, addLabel] of [["roles", roleEditor, "Agregar rol"], ["metrics", metricEditor, "Agregar indicador"], ["risks", riskEditor, "Agregar riesgo \\/ oportunidad"]]) {
  assert.match(source, new RegExp(`id: '${id}'[\\s\\S]*markDirty\\(\\)`), `${id} must register and mark dirty explicitly`);
  assert.match(source, new RegExp(`rows\\.length \\? <div[\\s\\S]*${addLabel}`), `${id} must hide its empty table header and lead with + Add`);
  assert.doesNotMatch(source, /import \{[^}]*\bSave\b|Guardando\.\.\.|Guardar (?:roles|indicadores|riesgos)/, `${id} must not expose an individual save button`);
}
assert.match(metricEditor, /result\.data\?\.\[index\]\?\.id/, "metrics must keep real persisted ids after master save");
assert.match(riskEditor, /controlId: result\.data\?\.\[index\]\?\.controlId[\s\S]*riskId: result\.data\?\.\[index\]\?\.riskId/, "risks and controls must keep real persisted ids after master save");
assert.doesNotMatch(stageEditor, /useProcessMasterSaveSection/, "StageEditor must remain outside master persistence");
assert.match(stageEditor, /useProcessMasterReadinessUpdater[\s\S]*activeStageCount: rows\.length/, "StageEditor may publish only its active count to readiness");
assert.match(stageEditor, /Guardar etapa/, "StageEditor must retain its internal save");

console.log("process-master-save-coordinator: OK");