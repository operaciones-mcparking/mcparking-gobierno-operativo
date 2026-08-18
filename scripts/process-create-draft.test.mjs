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
const companyOptions = read("src/lib/procesos/process-company-options.ts");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const adminClient = read("src/lib/supabase/admin.ts");
const createMigration = read("supabase/migrations/20260813143000_create_process_draft_with_document_header.sql");
const contractMigration = read("supabase/migrations/20260813160000_complete_process_master_v1_contract.sql");
const persistActionStart = actions.indexOf("async function persistProcessDraft");
const createActionStart = actions.indexOf("export async function createProcessDraft");
const createActionEnd = actions.indexOf("export async function addProcess", createActionStart);
assert.notEqual(createActionStart, -1, "createProcessDraft action must exist");
assert.notEqual(createActionEnd, -1, "createProcessDraft must be separate from addProcess");
const createAction = actions.slice(persistActionStart, createActionEnd);

assert.match(listPage, /href="\/procesos\/nuevo"/, "Nuevo proceso must navigate to the draft page");
assert.doesNotMatch(listPage, /CreateProcessModal/, "list page must not open the legacy create modal");
assert.match(newPage, /<CreateProcessDraftForm/, "new process route must render the draft form");
assert.match(newPage, /getActiveProcessCompanyOptions\(\)/, "new process route must load active companies from the secure server-side directory");
assert.doesNotMatch(newPage, /getAreaDirectory|getProcessCatalogV2/, "new process route must not load visible company or area selectors");
assert.match(draftForm, /Borrador/, "new process page must show draft state visually");
assert.match(draftForm, /<ProcessWizardShell[\s\S]*mode="create"/, "new process must use the sequential wizard");
assert.doesNotMatch(draftForm, /Guardar borrador|type="submit"|useFormStatus/, "wizard must replace the manual draft-submit step");
assert.match(draftForm, /prepareDraftForWizard[\s\S]*new FormData\(formRef\.current\)/, "Siguiente must serialize the current draft values");
assert.match(draftForm, /hasName[\s\S]*hasCompany[\s\S]*hasProcessType[\s\S]*Completa Proceso, Empresa y Tipo para continuar/, "wizard draft creation must require the existing minimum fields");
assert.match(draftForm, /autoCreateProcessDraft\(formData, "wizard_next"\)/, "wizard must reuse the shared inline draft action");
assert.match(draftForm, /isCreatingDraft[\s\S]*pending=\{isCreatingDraft\}/, "pending draft creation must disable wizard navigation");
assert.match(draftForm, /autoSaveInFlightRef\.current[\s\S]*autoSaveInFlightRef\.current = true/, "autosave must synchronously reject a second click");
assert.match(draftForm, /process-wizard-scroll:\$\{result\.processId\}[\s\S]*window\.scrollY[\s\S]*router\.replace/, "wizard transition must preserve scroll with the real process id");
assert.match(draftForm, /wizard=create&step=2[\s\S]*scroll: false/, "wizard must continue as sequential CREATE without resetting scroll");assert.doesNotMatch(draftForm, /window\.location|\.reload\(/, "auto-save must not reload the browser");
assert.match(newPage, /params\.error[\s\S]*\{params\.error\}/, "new process page must show action errors visibly");
assert.match(newPage, /href="\/estructura#procesos"[\s\S]*Volver a procesos/, "new process page must return to the official process catalog");

for (const field of [
  "name",  "process_type",  "purpose",
  "supplier_origin",
  "process_inputs",
  "process_outputs",
  "client_destination",
  "process_start",
  "process_end",
  "scope",
]) {
  assert.match(draftForm, new RegExp(`name="${field}"`), `draft form must include ${field}`);
}

for (const field of ["pdca_plan", "pdca_do", "pdca_check", "pdca_act"]) {
  assert.doesNotMatch(draftForm, new RegExp(`name="${field}"`), `V1 draft form must hide ${field}`);
}

assert.equal(countMatches(draftForm, /Ficha de proceso/gi), 1, "create form must render one Ficha de proceso heading");
assert.doesNotMatch(draftForm, /Nuevo proceso - borrador inicial/, "create form must not repeat the old draft heading");
assert.doesNotMatch(draftForm, /title="General"/, "old General section must not remain duplicated");
assert.match(draftForm, /<Field label="Proceso">[\s\S]*name="name"[\s\S]*placeholder="Nombre del proceso"/, "Proceso must remain the primary editable header field");
assert.match(draftForm, /<Field label="Empresa">[\s\S]*name="company_id"/, "company must remain explicit before draft creation");
assert.match(draftForm, /<Field label="Dueno del proceso">[\s\S]*name="owner_role_id"[\s\S]*persona actual se deriva del rol/i, "global owner must use the official role selector");
assert.match(draftForm, /<Field label="Tipo de proceso">[\s\S]*name="process_type"/, "process type must remain editable before draft creation");
assert.match(draftForm, />Borrador<\/[\s\S]*bg-\[#f8fafc\]/, "draft status may remain as compact secondary metadata");
assert.doesNotMatch(draftForm, /Se asignar|Se registra al crear|Sin publicar/, "NEW must not reserve space for metadata that does not exist yet");
assert.doesNotMatch(draftForm, /name="process_code"|name="version"|name="effective_date"|type="date"/, "generated metadata must not be browser-editable");
assert.match(draftForm, /sm:grid-cols-2/, "simplified header must remain responsive");
assert.doesNotMatch(draftForm, /overflow-x-auto|whitespace-nowrap/, "document header must not force horizontal overflow");
assert.match(draftForm, /name="name"[\s\S]*required/, "name must be required on the draft form");
assert.match(draftForm, /name="company_id"/, "company must be submitted from the explicit selector");
assert.match(draftForm, /<Field label="Tipo de operación">[\s\S]*name="area_id"/, "operation type must use the real area UUID selector");
assert.match(draftForm, /name="process_type" required/, "process type must be required on the draft form");
assert.doesNotMatch(draftForm, /name="criticality"/, "criticality must stay internal and outside the V1 form");
assert.match(draftForm, /<Field label="Empresa">[\s\S]*name="company_id"/, "company must appear in the simplified draft header");
assert.match(draftForm, /Sin tipo de operación/, "operation type must remain optional in the documentary header");
assert.match(newPage, /companies=\{companyResult\.data\}/, "create page must provide the structural company directory");
assert.match(companyOptions, /\.from\("companies"\)[\s\S]*\.select\("id,name"\)[\s\S]*\.eq\("status", "active"\)/, "company options must derive directly from active company rows");
assert.match(companyOptions, /getActiveProcessOperationTypeOptions[\s\S]*\.from\("areas"\)[\s\S]*companies!inner\(status\)[\s\S]*\.eq\("status", "active"\)/, "operation types must derive from active structural areas and active companies");
assert.doesNotMatch(newPage + draftForm + actions, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, "default company resolution must not hardcode a UUID");

assert.doesNotMatch(actions, /function diagnosticValues|company_id recibido|area_id recibido|values recibidos/, "temporary diagnostics must be removed after the root cause is fixed");
assert.match(adminClient, /^import "server-only";[\s\S]*SUPABASE_SERVICE_ROLE_KEY/, "draft validation and creation must use a server-only service role client");
assert.match(createAction, /const areaId = optionalValue\(formData, "area_id"\)/, "draft creation must accept the optional operation type UUID");
assert.match(createAction, /\.rpc\([\s\S]*"create_process_draft_with_document_header"/, "draft action must create through the atomic RPC");
assert.match(contractMigration, /v_process_code := public\.reserve_process_code\(\)[\s\S]*insert into public\.processes/, "V1 RPC must reserve and insert in one transaction");
assert.match(createAction, /if \(!created\?\.process_id\)/, "draft action must handle missing process id as an error");
assert.match(createAction, /draftIntent[\s\S]*wizard_next[\s\S]*add_stage[\s\S]*add_role/, "draft action must expose wizard, stage and role inline intents");
assert.match(createAction, /if \(inlineDraft\)[\s\S]*return \{ error: null, existingProcess: null, processId: created\.process_id \}/, "inline draft creation must return the persisted process id");
assert.equal(countMatches(createAction, /create_process_draft_with_document_header/g), 1, "manual and inline creation must share the same atomic RPC");
assert.match(createAction, /No fue posible crear el proceso\. Intenta nuevamente\./, "missing process id must produce a visible safe error");
assert.match(createAction, /try \{[\s\S]*requestOperationalContext\(\)[\s\S]*companyOperationalContext\(supabase, companyId\)[\s\S]*\} catch \{/, "draft action must convert context lookup failures into visible errors");
assert.match(createAction, /const matchingExplicitSiteId =[\s\S]*explicitContext\.companyId === companyId/, "draft action must only trust explicit site context when it belongs to the selected company");
assert.match(createAction, /\(matchingExplicitSiteId \? explicitContext\.countryId : null\)[\s\S]*companyContext\.countryId[\s\S]*requestContext\.countryId/, "draft action must prefer selected company country before stale request context");
assert.doesNotMatch(createAction, /requestContext\.countryId \?\?[\s\S]*companyContext\.countryId/, "draft action must not let request country override the selected company country");
assert.match(createAction, /defaultSiteId = matchingExplicitSiteId \?\? companyContext\.siteId/, "draft action must fall back to the selected company active site");
assert.doesNotMatch(createAction, /defaultSiteId = explicitSiteId \?\? companyContext\.siteId/, "draft action must not persist stale explicit site ids from the request context");
assert.match(createAction, /No se pudo resolver el contexto operativo del proceso\./, "context failures must use a safe user-facing message");
assert.doesNotMatch(createAction, /error instanceof Error \? error\.message/, "technical context errors must not be exposed to the user");
assert.match(createAction, /processWriteErrorMessage\(error, "No se pudo guardar el borrador\."\)/, "Supabase insert errors must be sanitized through process write helper");
assert.doesNotMatch(createAction, /\.upsert\(/, "draft action must not upsert and overwrite existing processes");
assert.match(contractMigration, /'inactive'::public\.record_status/, "draft RPC must explicitly save inactive status");
assert.match(contractMigration, /'draft'::public\.documentation_status/, "draft RPC must explicitly save draft documentation status");
for (const field of ["supplier_origin", "process_inputs", "process_outputs", "client_destination"]) {
  assert.match(createAction, new RegExp(`${field}: optionalValue\\(formData, "${field}"\\)`), `draft action must persist ${field}`);
}
assert.match(createAction, /purpose: optionalValue\(formData, "purpose"\)/, "draft action must persist purpose");
assert.doesNotMatch(createAction, /p_process:[\s\S]*process_code\s*:/, "draft action must never accept a client process code");
assert.doesNotMatch(createAction, /p_process:[\s\S]*version\s*:/, "draft action must never persist a client version");
assert.doesNotMatch(createAction, /effective_date|optionalDateValue/, "draft action must not accept a manual effective date");
assert.match(createAction, /process_start: optionalValue\(formData, "process_start"\)/, "draft action must persist process start");
assert.match(createAction, /process_end: optionalValue\(formData, "process_end"\)/, "draft action must persist process end");
assert.match(createAction, /scope: optionalValue\(formData, "scope"\)/, "draft action must persist scope");
assert.doesNotMatch(createAction, /pdca_(plan|do|check|act):/, "V1 draft action must not write hidden PDCA fields");
assert.match(createAction, /if \(!name\)/, "draft action must require name");
assert.match(createAction, /const companyId = value\(formData, "company_id"\)[\s\S]*validateSelectedProcessCompany\(processAdmin, companyId\)/, "draft action must validate the selected structural company server-side");
assert.match(createAction, /processType !== "strategic"[\s\S]*processType !== "operational"[\s\S]*processType !== "support"/, "draft action must require a valid type");
assert.match(createAction, /validateSelectedProcessOperationType\(processAdmin, areaId, companyId\)[\s\S]*area_id: areaId/, "draft action must validate and persist the selected operation type server-side");
assert.match(createAction, /redirect\(withMessage\(`\/procesos\/\$\{created\.process_id\}\/editar`/, "draft action must redirect to editor after create");
assert.doesNotMatch(createAction, /validateProcessForActivation/, "draft creation must not run activation validation");
assert.doesNotMatch(createAction, /from\("subprocesses"\)/, "draft creation must not create stages");
assert.doesNotMatch(createAction, /from\("process_roles"\)/, "draft creation must not assign owners or roles");

assert.match(data, /processMasterProcessFieldsSelect/, "detail read model must request direct process master fields without inflating list views");
assert.match(data, /process_code,version,owner_role_id,master_updated_at,created_at,updated_at,effective_date,process_start,process_end,scope,supplier_origin,process_inputs,process_outputs,client_destination/, "detail read model must include all 1:1 process fields");
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

console.log("process-create-draft: 112/112 OK");
