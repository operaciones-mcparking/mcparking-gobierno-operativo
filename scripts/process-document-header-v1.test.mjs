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
const detailPage = read("src/app/procesos/[processId]/page.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const mapper = read("src/app/procesos/process-master/process-master-mapper.ts");
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const types = read("src/app/procesos/process-master/process-master-types.ts");

const orderPattern = /DocumentaryField label="Dueno del proceso"[\s\S]*DocumentaryField label="Codigo"[\s\S]*DocumentaryField label="Ultima edicion"/;
assert.match(sheet, orderPattern, "readonly header must keep the final V1 order");
assert.match(createForm, /Field label="Proceso"[\s\S]*Field label="Empresa"[\s\S]*Field label="Tipo de proceso"[\s\S]*Field label="Dueno del proceso"[\s\S]*Field label="Tipo de operación"/, "create header must keep the compact editable order");
assert.match(editPage, /Field label="Proceso"[\s\S]*StatePill label="Empresa"[\s\S]*Field label="Tipo de proceso"[\s\S]*Field label="Dueno del proceso"[\s\S]*Field label="Tipo de operación"/, "edit header must mirror the compact editable order");

assert.doesNotMatch(createForm + editPage, /name="effective_date"|type="date"/, "last edited must not expose a date picker");
assert.match(createForm, /name="company_id"/, "create header must submit the selected company");
assert.match(createForm + editPage, /name="area_id"/, "operation type must submit the existing area UUID");
assert.doesNotMatch(editPage, /name="company_id"/, "edit must keep company read-only until context reconciliation is supported");
assert.doesNotMatch(sheet, /Estado operativo|Estado documental|Criticidad/, "readonly header must not duplicate technical states or criticality");
assert.match(createForm, /<Field label="Empresa">/, "create header must show the company selector");
assert.match(createForm, /<Field label="Tipo de operación">[\s\S]*<select[\s\S]*name="area_id"/, "create header must expose operation type as a select");
assert.match(editPage, /<StatePill label="Empresa"/, "edit header must show current company read-only");
assert.match(editPage, /<Field label="Tipo de operación">[\s\S]*<select[\s\S]*name="area_id"[\s\S]*defaultValue=\{process\.area_id \?\? ""\}/, "edit header must load the current operation type");

assert.match(types, /masterUpdatedAt: string \| null;[\s\S]*createdAt: string \| null;/, "DTO must carry primary and historical date sources");
assert.match(data, /master_updated_at,created_at,effective_date/, "read model must carry created_at beside master_updated_at");
assert.match(mapper, /masterUpdatedAt: process\.master_updated_at[\s\S]*createdAt: process\.created_at/, "mapper must preserve both date sources");
assert.match(sheet, /documentaryDate\(process\.process\.masterUpdatedAt \?\? process\.process\.createdAt\)/, "readonly date must prefer master_updated_at and fall back to created_at");
assert.match(editPage, /lastEditedAt = process\.master_updated_at \?\? process\.created_at/, "edit date must use the same fallback");
assert.match(sheet + editPage, /Intl\.DateTimeFormat\("es-CL"[\s\S]*timeZone: "America\/Santiago"[\s\S]*replaceAll\("\/", "-"\)/, "date must be presented as a simple local value");

assert.match(createPage, /getActiveProcessCompanyOptions\(\)/, "create page must load active companies from a secure server-side directory");
assert.match(companyOptions, /processCompanyPriority[\s\S]*normalized === "mcparking"[\s\S]*normalized === "el alba"/, "company options must place McParking first and El Alba second");
assert.match(actions, /validateSelectedProcessCompany[\s\S]*\.from\("companies"\)[\s\S]*\.eq\("id", companyId\)[\s\S]*\.eq\("status", "active"\)/, "write path must independently validate the selected active company");
assert.doesNotMatch(createPage + createForm + actions, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, "company resolution must not hardcode a UUID");

assert.match(createPage + editPage, /getRoleDictionary/, "owner options must use the official role dictionary");
assert.match(createPage, /name: role\.role_name/, "create owner label must use the clean role name");
assert.match(editPage, /\{role\.role_name\}<\/option>/, "edit owner label must use the clean role name");
assert.doesNotMatch(createPage + createForm + editPage, /role_name\} - \{role\.company_name|replace\([^\n]*McParking/, "owner labels must not concatenate or strip company text");
assert.match(createForm + editPage, /name="owner_role_id"/, "owner selector must continue submitting the official role UUID");
assert.match(sheet + editPage, /Persona actual:/, "current person must remain secondary to the owner role");

assert.match(sheet, /status === "active"[\s\S]*"Vigente"[\s\S]*status === "archived"[\s\S]*"Archivado"[\s\S]*"Borrador"/, "readonly status must expose one understandable lifecycle state");
assert.match(editPage, /process\.status === "active" \? "Vigente" : "Borrador"/, "edit status must use the same derivation");
assert.match(createForm, /name="process_type" required/, "create type must remain editable");
assert.match(editPage, /name="process_type"/, "edit type must remain editable");
assert.match(sheet, /processTypeLabels\[process\.process\.process_type\]/, "readonly type must use the existing classification");
assert.doesNotMatch(createForm + editPage, /name="process_code"|name="version"/, "code and version must remain read-only");
assert.doesNotMatch(detailPage, /title=\{processResult\.data\.process_name\}/, "detail shell must not repeat the process name as a second large heading");
assert.match(detailPage, /title="Ficha de proceso"/, "detail shell must use a generic non-duplicated title");
assert.match(sheet, /rounded-lg border border-\[#dbe4eb\][\s\S]*process\.process\.name/, "readonly must retain the compact documentary header");
assert.doesNotMatch(sheet, /rounded-xl border border-line border-t-4 border-t-clay/, "the outer process sheet must not duplicate the inner yellow header accent");

console.log("process-document-header-v1: 34/34 OK");