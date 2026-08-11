import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const listPage = read("src/app/procesos/page.tsx");
const newPage = read("src/app/procesos/nuevo/page.tsx");
const draftForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const actions = read("src/app/admin/actions.ts");
const data = read("src/lib/dashboard/data.ts");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const createActionStart = actions.indexOf("export async function createProcessDraft");
const createActionEnd = actions.indexOf("export async function addProcess", createActionStart);
assert.notEqual(createActionStart, -1, "createProcessDraft action must exist");
assert.notEqual(createActionEnd, -1, "createProcessDraft must be separate from addProcess");
const createAction = actions.slice(createActionStart, createActionEnd);

assert.match(listPage, /href="\/procesos\/nuevo"/, "Nuevo proceso must navigate to the draft page");
assert.doesNotMatch(listPage, /CreateProcessModal/, "list page must not open the legacy create modal");
assert.match(newPage, /<CreateProcessDraftForm/, "new process route must render the draft form");
assert.match(newPage, /getProcessCatalogV2\(context\)/, "new process route may reuse active catalog for options only");
assert.match(newPage, /getAreaDirectory\(context\)/, "new process route must reuse existing area directory options");
assert.match(draftForm, /Borrador/, "new process page must show draft state visually");
assert.match(draftForm, /Guardar borrador/, "primary action must be Guardar borrador");
assert.doesNotMatch(draftForm, /Crear proceso/, "new process page must not label the action as Crear proceso");
assert.match(draftForm, /href="\/procesos"[\s\S]*Cancelar/, "new process page must provide cancel navigation");

for (const field of [
  "name",
  "company_id",
  "area_id",
  "process_type",
  "criticality",
  "description",
  "objective",
  "expected_result",
  "inputs_providers",
  "outputs_clients",
  "basic_kpi",
]) {
  assert.match(draftForm, new RegExp(`name="${field}"`), `draft form must include ${field}`);
}

assert.match(draftForm, /name="name" required/, "name must be required on the draft form");
assert.match(draftForm, /name="company_id"[\s\S]*required/, "company must be required on the draft form");
assert.match(draftForm, /name="process_type" required/, "process type must be required on the draft form");
assert.match(draftForm, /defaultValue="medium"/, "criticality must have a default");
assert.match(draftForm, /setSelectedAreaId\(""\)/, "changing company must clear inconsistent area selection");

assert.match(createAction, /\.from\("processes"\)[\s\S]*\.insert\(/, "draft action must insert a process");
assert.doesNotMatch(createAction, /\.upsert\(/, "draft action must not upsert and overwrite existing processes");
assert.match(createAction, /status: "inactive"/, "draft action must explicitly save inactive status");
assert.match(createAction, /documentation_status: "draft"/, "draft action must explicitly save draft documentation status");
assert.match(createAction, /inputs_providers: optionalValue\(formData, "inputs_providers"\)/, "draft action must persist inputs/providers");
assert.match(createAction, /outputs_clients: optionalValue\(formData, "outputs_clients"\)/, "draft action must persist outputs/clients");
assert.match(createAction, /basic_kpi: optionalValue\(formData, "basic_kpi"\)/, "draft action must persist basic KPI");
assert.match(createAction, /if \(!name\)/, "draft action must require name");
assert.match(createAction, /if \(!companyId\)/, "draft action must require company");
assert.match(createAction, /processType !== "strategic"[\s\S]*processType !== "operational"[\s\S]*processType !== "support"/, "draft action must require a valid type");
assert.match(createAction, /area\.company_id && area\.company_id !== companyId/, "draft action must block area/company mismatch");
assert.match(createAction, /redirect\(withMessage\(`\/procesos\/\$\{data\.id\}\/editar`/, "draft action must redirect to editor after create");
assert.doesNotMatch(createAction, /validateProcessForActivation/, "draft creation must not run activation validation");
assert.doesNotMatch(createAction, /from\("subprocesses"\)/, "draft creation must not create stages");
assert.doesNotMatch(createAction, /from\("process_roles"\)/, "draft creation must not assign owners or roles");

assert.match(data, /export async function getEditableProcessCatalogItem/, "editable process helper must exist");
assert.match(data, /from\("processes"\)[\s\S]*maybeSingle\(\)/, "editable helper must load from processes table directly");
assert.doesNotMatch(
  data.slice(data.indexOf("export async function getEditableProcessCatalogItem"), data.indexOf("export async function getProcessMatrix")),
  /from\("v_process_catalog_v2"\)/,
  "editable helper must not depend on active-only V2 view",
);
assert.match(editPage, /getEditableProcessCatalogItem\(processId\)/, "edit page must load active and inactive editable processes");
assert.match(editPage, /processResult\.data\.status === "archived"/, "edit page must protect archived processes");
assert.match(data, /p\.status = 'active'::public\.record_status|v_process_catalog_v2/, "official V2 active-only view contract must remain outside draft creation");

console.log("process-create-draft: 34/34 OK");
