import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const wizard = read("src/app/procesos/process-master/process-wizard-shell.tsx");
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const readonlyPage = read("src/app/procesos/[processId]/page.tsx");
const coordinator = read("src/app/procesos/process-master/process-master-save-coordinator.tsx");
const stageEditor = read("src/app/procesos/[processId]/editar/stage-editor.tsx");
const actions = read("src/app/admin/actions.ts");

for (const token of [
  'label: "Cabecera"',
  'label: "Prop\\u00f3sito y alcance"',
  'label: "Entradas y salidas"',
  'label: "Roles y responsabilidades"',
  'label: "Indicadores y objetivos"',
  'label: "Riesgos y controles"',
]) {
  assert.ok((sheet + createForm).includes(token), `wizard must expose ${token}`);
}assert.equal((sheet.match(/id: "(?:header|purpose|flow|roles|metrics|risks)"/g) ?? []).length, 6, "EDIT must define exactly six wizard steps");
assert.equal((createForm.match(/id: "(?:header|purpose|flow|roles|metrics|risks)"/g) ?? []).length, 6, "NEW must define exactly six wizard steps");

assert.match(wizard, /mode === 'create' && source === 'direct' && target > maxVisitedStep/, "CREATE must block direct future navigation");
assert.match(wizard, /setMaxVisitedStep\(\(current\) => Math\.max\(current, target\)\)/, "CREATE must unlock visited steps sequentially");
assert.match(wizard, /mode === 'create'[\s\S]*number > maxVisitedStep[\s\S]*disabled=\{isLocked \|\| waiting\}/, "future CREATE step buttons must remain disabled");
assert.match(editPage, /wizardMode = messages\.wizard === "create" \? "create" : "edit"/, "EDIT must default to freely navigable edit mode");
assert.match(wizard, /if \(mode === 'create'[\s\S]*source === 'direct'/, "EDIT must not apply the sequential lock");
assert.match(editPage, /process\.status === "active" \? \([\s\S]*href=\{`\/procesos\/\$\{process\.process_id\}`\}[\s\S]*Ver ficha[\s\S]*\) : null/, "EDIT must expose readonly navigation only for active processes");
assert.doesNotMatch(editPage, /Vista previa \/ Ver ficha/, "EDIT must not expose the ambiguous preview label");
assert.match(editPage, /href="\/estructura#procesos"[\s\S]*Procesos/, "EDIT must return to the official process catalog");

assert.match(wizard, /steps\.map[\s\S]*aria-hidden=\{index !== activeIndex\}[\s\S]*className=\{index === activeIndex \? 'block' : 'hidden'\}/, "all step contents must remain mounted and only hide visually");
assert.doesNotMatch(wizard, /steps\[activeIndex\]\.content/, "wizard must not mount only the active editor");
assert.match(coordinator, /dirtyIds[\s\S]*useProcessMasterDirtySections/, "wizard must reuse the master dirty state");
assert.match(wizard, /dirtySections\.has\(step\.id\)[\s\S]*Cambios sin guardar/, "dirty steps must have a restrained visual marker");

assert.match(createForm, /currentStep !== 1 \|\| nextStep !== 2[\s\S]*new FormData\(formRef\.current\)/, "only the first NEW transition must serialize the draft");
assert.match(createForm, /hasName[\s\S]*hasCompany[\s\S]*hasProcessType[\s\S]*Completa Proceso, Empresa y Tipo para continuar/, "NEW must reuse the existing minimum draft fields");
assert.match(createForm, /autoSaveInFlightRef\.current[\s\S]*autoSaveInFlightRef\.current = true/, "NEW must synchronously prevent duplicate drafts");
assert.match(createForm, /autoCreateProcessDraft\(formData, "wizard_next"\)/, "NEW must reuse the atomic draft persistence path");
assert.match(actions, /draftIntent === "wizard_next"[\s\S]*return \{ error: null, processId: created\.process_id \}/, "wizard draft intent must return the real process id inline");
assert.match(createForm, /process-wizard-scroll:\$\{result\.processId\}[\s\S]*window\.scrollY[\s\S]*router\.replace\(`\/procesos\/\$\{result\.processId\}\/editar\?wizard=create&step=2`/, "NEW must preserve scroll and continue as CREATE at step 2");
assert.match(editPage, /wizardMode=\{wizardMode\}[\s\S]*wizardScrollKey=\{wizardMode === "create"/, "draft route must preserve CREATE wizard mode and restore scroll");
assert.doesNotMatch(createForm + wizard, /window\.location|location\.reload|router\.refresh/, "wizard transitions must not reload or refresh");

for (const premature of ["Se asignar", "Se registra al crear", "Sin publicar"]) assert.doesNotMatch(createForm, new RegExp(premature), `NEW header must hide premature metadata: ${premature}`);
for (const field of ["name", "company_id", "owner_role_id", "process_type"]) assert.match(createForm, new RegExp(`name="${field}"`), `NEW header must retain ${field}`);
assert.doesNotMatch(createForm, /name="process_code"|name="version"|name="effective_date"/, "NEW must not submit generated metadata");
assert.match(editPage, /process\.process_code[\s\S]*process\.version[\s\S]*Editado \{documentaryDate\(lastEditedAt\)\}/, "EDIT must show real code, version and edit date as compact metadata");

assert.match(editPage, /<ProcessMasterSaveCoordinator[^>]*>[\s\S]*<ProcessActivationPanel[\s\S]*<ProcessMasterSheet/, "activation and master save must share one global coordinator outside wizard steps");
assert.match(wizard, /saveState\.saveFicha\(\)[\s\S]*Guardando ficha\.\.\.[\s\S]*Ficha guardada[\s\S]*Guardar ficha/, "step 6 must reuse the coordinated master save action and states");
assert.match(coordinator, /!isFinalStep[\s\S]*Guardar ficha/, "the sticky save button must remain on steps 1-5 and hide on step 6");
assert.doesNotMatch(wizard, /Ultimo paso de la ficha/, "step 6 must close with the real master save action");
assert.match(stageEditor, /Guardar etapa[\s\S]*handleAddStage|handleAddStage[\s\S]*Guardar etapa/, "StageEditor must retain its internal persistence exception");
assert.match(wizard, /lg:grid-cols-\[15rem_minmax\(0,1fr\)\][\s\S]*overflow-x-auto[\s\S]*lg:flex-col/, "wizard must use left rail on desktop and horizontal navigation on narrow screens");
assert.match(wizard, /Anterior[\s\S]*'Siguiente'/, "wizard must provide non-persisting previous and next navigation");

assert.match(sheet, /if \(mode === "readonly"\)[\s\S]*DocumentaryField label="Dueno del proceso"[\s\S]*ProcessDocumentSection title=\{"5\./, "READONLY must retain its complete vertical document branch");
assert.match(readonlyPage, /mode="readonly"/, "readonly route must remain in readonly mode");
assert.doesNotMatch(readonlyPage, /wizard=create|wizardInitialStep|ProcessWizardShell/, "readonly route must not opt into the wizard");

console.log("process-master-wizard: OK");