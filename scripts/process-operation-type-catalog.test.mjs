import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const actions = read("src/app/admin/actions.ts");
const catalogClient = read("src/app/procesos/process-catalog-client.tsx");
const catalogPage = read("src/app/procesos/page.tsx");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const createPage = read("src/app/procesos/nuevo/page.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const filters = read("src/components/dashboard/process-filters.tsx");
const options = read("src/lib/procesos/process-company-options.ts");

assert.match(options, /export async function getActiveProcessOperationTypeOptions\(\)/, "one shared operation type catalog helper must exist");
assert.match(options, /\.from\("areas"\)[\s\S]*\.select\("id,name,company_id,companies!inner\(status\)"\)[\s\S]*\.eq\("status", "active"\)[\s\S]*\.eq\("companies.status", "active"\)/, "catalog must contain active areas from active structural companies");
assert.match(options, /companyId: String\(area\.company_id\)[\s\S]*id: String\(area\.id\)[\s\S]*name: String\(area\.name\)/, "catalog options must expose real company and area UUIDs with names");
assert.doesNotMatch(options, /Administraci[oó]n|Comercial|Finanzas|Operaciones|Tecnolog[ií]a|Revenue/, "catalog must not hardcode business categories");

for (const source of [createPage, editPage, catalogPage]) {
  assert.match(source, /getActiveProcessOperationTypeOptions\(\)/, "create, edit and catalog must consume the same helper");
}
assert.match(createPage, /operationTypes=\{operationTypeResult\.data\}/, "create must receive the canonical options");
assert.match(editPage, /operationTypeResult\.data\.filter\(\(operationType\) => operationType\.companyId === process\.company_id\)/, "edit must constrain canonical options to the process company");
assert.match(createForm, /operationTypes\.filter\(\(operationType\) => operationType\.companyId === selectedCompanyId\)/, "create must constrain canonical options to the selected company");
assert.match(createForm, /setSelectedCompanyId\(event\.target\.value\);[\s\S]*setSelectedOperationTypeId\(""\);/, "changing company must clear an incompatible operation type");
assert.match(createForm + editPage, /name="area_id"/, "browser forms must submit the existing area_id relationship");
assert.match(actions, /validateSelectedProcessOperationType[\s\S]*\.from\("areas"\)[\s\S]*data\.company_id === companyId/, "server must validate the selected active area against the process company");
assert.match(actions, /area_id: areaId[\s\S]*updates\.area_id = areaId/, "create and edit must continue persisting processes.area_id");

assert.match(catalogPage, /typeOptions=\{operationTypeResult\.data\}/, "matrix filter must receive the complete canonical catalog, including areas with zero processes");
assert.doesNotMatch(catalogPage, /new Set\(activeProcesses\.map\(\(process\) => process\.area_name/, "matrix options must not be derived from process rows");
assert.match(catalogClient, /typeOptions: ProcessOperationTypeOption\[\]/, "matrix client must preserve operation type ids");
assert.match(filters, /typeOptions: FilterOption\[\][\s\S]*<option key=\{type\.id\} value=\{type\.id\}>[\s\S]*\{type\.name\}/, "filter must show the official name and submit the official area id");
assert.match(catalogClient, /filters\.type === "todos" \|\| process\.area_id === filters\.type/, "matrix rows must filter by area_id rather than area_name");
assert.doesNotMatch(catalogClient, /operationType === filters\.type|process\.area_name === filters\.type/, "matrix filtering must not compare display strings");
assert.match(catalogClient, /processes\.length === 0[\s\S]*No hay procesos en este grupo para los filtros seleccionados/, "an official area with zero processes must produce a normal empty result");
assert.match(catalogClient, /filters\.type === "todos" \|\| process\.area_id === filters\.type/, "historical rows remain visible unless an active operation type filter is selected");

assert.match(editPage, /currentOperationTypeIsInactive[\s\S]*option disabled value=\{process\.area_id \?\? ""\}[\s\S]*\(inactivo\)/, "edit must display a historical inactive assignment without offering it for new selection");
assert.match(actions, /\.select\("company_id,area_id"\)[\s\S]*if \(areaId !== processContext\.area_id\)[\s\S]*validateSelectedProcessOperationType/, "saving other header fields must preserve an unchanged inactive historical area");

console.log("process-operation-type-catalog: 23/23 OK");