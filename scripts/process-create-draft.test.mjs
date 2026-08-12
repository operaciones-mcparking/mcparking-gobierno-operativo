import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");
const countMatches = (text, pattern) => [...text.matchAll(pattern)].length;

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
assert.match(draftForm, /<form action=\{createProcessDraft\}/, "draft form submit must call createProcessDraft");
assert.match(draftForm, /type="submit"/, "Guardar borrador button must submit the form");
assert.match(draftForm, /useFormStatus\(\)/, "draft form must use form pending state");
assert.match(draftForm, /disabled=\{disabled \|\| pending\}/, "pending state must disable the submit button");
assert.match(draftForm, /pending \? "Guardando\.\.\." : "Guardar borrador"/, "pending state must show Guardando copy");
assert.match(newPage, /params\.error[\s\S]*\{params\.error\}/, "new process page must show action errors visibly");
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
assert.match(draftForm, /onChange=\{\(event\) => \{[\s\S]*setSelectedCompanyId\(event\.target\.value\);[\s\S]*setSelectedAreaId\(""\);[\s\S]*\}\}/, "changing company must clear area immediately in the same event");
assert.match(draftForm, /visibleAreas = useMemo\([\s\S]*area\.company_id === selectedCompanyId/, "area options must be filtered by selected company");
assert.match(draftForm, /const safeSelectedAreaId = visibleAreas\.some\(\(area\) => area\.id === selectedAreaId\)/, "area value must be sanitized against visible options");
assert.match(draftForm, /if \(selectedAreaId !== safeSelectedAreaId\)[\s\S]*setSelectedAreaId\(safeSelectedAreaId\)/, "stale area state must be reconciled after option changes");
assert.match(draftForm, /<input name="area_id" type="hidden" value=\{safeSelectedAreaId\} \/>/, "hidden area_id must submit only the sanitized area value");
assert.match(draftForm, /<select[\s\S]*key=\{selectedCompanyId\}[\s\S]*value=\{safeSelectedAreaId\}/, "area select must be controlled and remounted by selected company");
assert.equal(countMatches(draftForm, /name="area_id"/g), 1, "draft form must submit exactly one area_id field");
assert.equal(countMatches(draftForm, /name="company_id"/g), 1, "draft form must submit exactly one company_id field");
assert.doesNotMatch(draftForm, /<select[^>]*name="area_id"/, "area select must not submit a browser-restored value directly");
assert.doesNotMatch(draftForm, /defaultValue=\{selectedAreaId\}|defaultValue="[^"]+"[\s\S]*name="area_id"/, "area select must not be uncontrolled by defaultValue");
assert.match(draftForm, /<option value="">Sin area<\/option>/, "Sin area must submit an empty area_id value");
assert.doesNotMatch(draftForm, /value="null"|value="undefined"/, "Sin area must not use unsupported sentinel values");

assert.doesNotMatch(actions, /function diagnosticValues|company_id recibido|area_id recibido|values recibidos/, "temporary diagnostics must be removed after the root cause is fixed");
assert.match(actions, /function createProcessDraftValidationClient\(\)[\s\S]*SUPABASE_SERVICE_ROLE_KEY/, "draft area validation must use a server-only service role client");
assert.match(createAction, /const areaId = optionalValue\(formData, "area_id"\)/, "server must normalize empty area_id to null");
assert.match(createAction, /\.from\("processes"\)[\s\S]*\.insert\(/, "draft action must insert a process");
assert.match(createAction, /\.select\("id"\)[\s\S]*\.single\(\)/, "draft action must request the generated process id");
assert.match(createAction, /if \(!data\?\.id\)/, "draft action must handle missing process id as an error");
assert.match(createAction, /Supabase no devolvio el ID del proceso creado/, "missing process id must produce a visible safe error");
assert.match(createAction, /try \{[\s\S]*requestOperationalContext\(\)[\s\S]*companyOperationalContext\(supabase, companyId\)[\s\S]*\} catch \(error\)/, "draft action must convert context lookup failures into visible errors");
assert.match(createAction, /const matchingExplicitSiteId =[\s\S]*explicitContext\.companyId === companyId/, "draft action must only trust explicit site context when it belongs to the selected company");
assert.match(createAction, /\(matchingExplicitSiteId \? explicitContext\.countryId : null\)[\s\S]*companyContext\.countryId[\s\S]*requestContext\.countryId/, "draft action must prefer selected company country before stale request context");
assert.doesNotMatch(createAction, /requestContext\.countryId \?\?[\s\S]*companyContext\.countryId/, "draft action must not let request country override the selected company country");
assert.match(createAction, /defaultSiteId = matchingExplicitSiteId \?\? companyContext\.siteId/, "draft action must fall back to the selected company active site");
assert.doesNotMatch(createAction, /defaultSiteId = explicitSiteId \?\? companyContext\.siteId/, "draft action must not persist stale explicit site ids from the request context");
assert.match(createAction, /No se pudo guardar el borrador\. \$\{error instanceof Error \? error\.message/, "context errors must be surfaced safely");
assert.match(createAction, /No se pudo guardar el borrador\. \$\{error\.message\}/, "Supabase insert errors must include safe detail");
assert.doesNotMatch(createAction, /\.upsert\(/, "draft action must not upsert and overwrite existing processes");
assert.match(createAction, /status: "inactive"/, "draft action must explicitly save inactive status");
assert.match(createAction, /documentation_status: "draft"/, "draft action must explicitly save draft documentation status");
assert.match(createAction, /inputs_providers: optionalValue\(formData, "inputs_providers"\)/, "draft action must persist inputs/providers");
assert.match(createAction, /outputs_clients: optionalValue\(formData, "outputs_clients"\)/, "draft action must persist outputs/clients");
assert.match(createAction, /basic_kpi: optionalValue\(formData, "basic_kpi"\)/, "draft action must persist basic KPI");
assert.match(createAction, /if \(!name\)/, "draft action must require name");
assert.match(createAction, /if \(!companyId\)/, "draft action must require company");
assert.match(createAction, /processType !== "strategic"[\s\S]*processType !== "operational"[\s\S]*processType !== "support"/, "draft action must require a valid type");
assert.match(createAction, /\.select\("company_id,status"\)/, "draft action must load area company and status for validation");
assert.match(createAction, /area\.status !== "active" \|\| area\.company_id !== companyId/, "draft action must reject inactive or mismatched areas");
assert.match(createAction, /fail\("El area seleccionada no corresponde a la empresa\."/, "area mismatch must return the normal non-diagnostic error");
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

console.log("process-create-draft: 70/70 OK");
