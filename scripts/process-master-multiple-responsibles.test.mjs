import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const actions = read("src/app/admin/actions.ts");
const selector = read("src/app/procesos/process-master/process-multi-role-selector.tsx");
const loader = read("src/lib/procesos/process-master-relations.ts");
const types = read("src/app/procesos/process-master/process-master-types.ts");
const sheet = read("src/app/procesos/process-master/process-master-sheet.tsx");

assert.match(types, /ProcessMasterResponsibleRole[\s\S]*role_id: string[\s\S]*role_name: string[\s\S]*sort_order: number/, "safe DTO must expose only role identity, name and order");
assert.equal((types.match(/responsible_roles: ProcessMasterResponsibleRole\[\]/g) ?? []).length, 2, "metrics and controls must both expose multiple responsible roles");
assert.match(selector, /selectedRoleIds: string\[\][\s\S]*availableOptions/, "selector must keep multiple role UUIDs and hide selected options");
assert.match(selector, /selectedRoleIds\.includes\(roleId\)/, "selector must prevent duplicate local assignments");
assert.match(selector, /Quitar responsable[\s\S]*Agregar responsable/, "multiple role choices must be removable and addable");
assert.doesNotMatch(selector, /person|Persona|input type="text"/, "responsibles must be roles, never typed persons");
assert.match(actions, /v_role_dictionary[\s\S]*role_status', 'active'[\s\S]*role\.company_id === process\.company_id/, "server must authorize each role against the process company");
assert.match(actions, /validRoleIds\.size === roleIds\.length/, "unknown or cross-company role IDs must fail validation");
assert.match(actions, /new Set\(row\.responsibleRoleIds\)\.size !== row\.responsibleRoleIds\.length/g, "both saves must reject duplicate role IDs");
assert.match(actions, /function syncResponsibleRoles[\s\S]*sort_order: sortOrder[\s\S]*onConflict: `\$\{parentColumn\},role_id`[\s\S]*removedRoleIds/, "bridge synchronization must preserve order, upsert and remove missing assignments");
assert.match(loader, /role_status", "active"[\s\S]*company_id", companyId/, "read DTOs must also filter official active company roles");
assert.match(sheet, /join\(" \\u00b7 "\)/, "readonly role names must use the requested middle-dot separator");
assert.doesNotMatch(sheet.slice(sheet.indexOf("function MetricsTable"), sheet.indexOf("export function ProcessMasterSheet")), /Persona actual:/, "sections 4 and 5 readonly must not display people");
assert.doesNotMatch(actions.slice(actions.indexOf("export async function saveProcessMetrics"), actions.indexOf("export async function updateProcessBasics")), /revalidatePath\(|redirect\(/, "block saves must not navigate or refresh the page");

console.log("process-master-multiple-responsibles: OK");