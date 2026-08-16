import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const actions = read("src/app/admin/actions.ts");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const createPage = read("src/app/procesos/nuevo/page.tsx");
const data = read("src/lib/dashboard/data.ts");
const companyOptions = read("src/lib/procesos/process-company-options.ts");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const companyDirectory = companyOptions.slice(
  companyOptions.indexOf("export async function getActiveProcessCompanyOptions"),
  companyOptions.indexOf("export type ProcessOperationTypeOption"),
);
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const createAction = actions.slice(
  actions.indexOf("async function persistProcessDraft"),
  actions.indexOf("export async function addProcess"),
);

assert.match(createPage, /getActiveProcessCompanyOptions\(\)/, "new process must load active companies server-side");
assert.match(companyOptions, /^import "server-only";[\s\S]*createSupabaseAdminClient/, "company options must use the secure server-side client");
assert.match(companyOptions, /\.from\("companies"\)[\s\S]*\.select\("id,name"\)[\s\S]*\.eq\("status", "active"\)/, "companies must come directly from active company rows");
assert.doesNotMatch(companyDirectory, /\.from\("areas"\)|companies!inner/, "company existence must not depend on areas");
assert.match(companyOptions, /id: String\(company\.id\), name: String\(company\.name\)/, "options must expose real company ids and names");
assert.match(companyOptions, /normalized === "mcparking"\) return 0;[\s\S]*normalized === "el alba"\) return 1;/, "McParking and El Alba must have the requested display order");
assert.match(createForm, /name="company_id"/, "company must be an explicit browser selection");
assert.match(createForm, /companies\.find\(\(company\) => company\.name\.trim\(\)\.toLocaleLowerCase\("es"\) === "mcparking"\)\?\.id \?\? ""/, "default must use the real McParking option id");
assert.match(createForm, /companies\.map\(\(company\) => <option key=\{company\.id\} value=\{company\.id\}>\{company\.name\}<\/option>\)/, "options must submit their real UUIDs");
assert.match(createForm, /roles\.filter\(\(role\) => role\.companyId === selectedCompanyId\)/, "owner roles must be filtered by selected company");
assert.match(createForm, /setSelectedCompanyId\(event\.target\.value\);[\s\S]*setSelectedOwnerRoleId\(""\);/, "changing company must clear a stale owner");
assert.match(createPage, /companyId: role\.company_id[\s\S]*name: role\.role_name/, "role options must carry company UUID and clean role name");
assert.match(createAction, /const companyId = value\(formData, "company_id"\)/, "backend must receive selected company_id");
assert.match(actions, /validateSelectedProcessCompany[\s\S]*\.from\("companies"\)[\s\S]*\.eq\("id", companyId\)[\s\S]*\.eq\("status", "active"\)/, "backend must independently validate the selected active company");
assert.match(actions, /validateOfficialProcessOwner[\s\S]*company_id[\s\S]*data\.company_id !== companyId/, "backend must reject an owner from another company");
assert.match(createAction, /company_id: companyId/, "draft RPC must receive the selected real company id");
assert.doesNotMatch(data + companyOptions + actions, /resolveDefaultProcessCompanyFromRoles|resolveDefaultProcessCompany\(/, "role-root and role-frequency company heuristics must be removed");
assert.doesNotMatch(createPage + createForm + companyOptions + actions, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, "company selection must not hardcode a UUID");
assert.match(createForm + createAction, /name="area_id"[\s\S]*formData, "area_id"/, "operation type must use the optional existing area relationship");
assert.match(editPage, /role\.company_id === process\.company_id/, "edit owner options must stay inside the current company");
assert.match(editPage + sheet, /label="Empresa"/, "edit and readonly headers must show company");

console.log("process-default-company-resolution: 20/20 OK");
