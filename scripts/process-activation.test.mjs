import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const actions = read("src/app/admin/actions.ts");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const activationPanel = read("src/app/procesos/[processId]/editar/process-activation-panel.tsx");
const validation = read("src/app/procesos/process-master/process-master-validation.ts");

const actionStart = actions.indexOf("export async function activateProcess");
const actionEnd = actions.indexOf("export async function updateSubprocessBasics", actionStart);
assert.notEqual(actionStart, -1, "activateProcess server action must exist");
assert.notEqual(actionEnd, -1, "activateProcess must be isolated before stage actions");
const activateAction = actions.slice(actionStart, actionEnd);

assert.match(editPage, /process\.status === "inactive" \? \(/, "activation panel must render only for inactive drafts");
assert.match(editPage, /<ProcessActivationPanel/, "edit page must show activation completeness panel");
assert.match(editPage, /action=\{activateProcess\}/, "activation panel must use activateProcess action");
assert.match(editPage, /Activo\. Este proceso ya forma parte/, "active processes must show active state instead of activation button");
assert.doesNotMatch(editPage, /name="status"/, "editor must not expose direct status editing");
assert.doesNotMatch(editPage, /name="documentation_status"/, "editor must not expose direct documentation status editing");
assert.match(activationPanel, /Activar proceso/, "activation button copy must be visible");
assert.match(activationPanel, /disabled=\{!isReady\}/, "activation button must be disabled when blocking requirements exist");
assert.match(activationPanel, /window\.confirm/, "activation must ask for confirmation before submit");
assert.match(activationPanel, /validation\.warnings\.map/, "confirmation must include warnings when present");
assert.match(activationPanel, /Falta:/, "blocking requirements must be visible");
assert.match(activationPanel, /Advertencias:/, "warnings must be visible");

assert.match(actions, /buildProcessMasterForActivation/, "server action must rebuild activation read model");
assert.match(actions, /getEditableProcessCatalogItem\(processId\)/, "server action must reload process before activation");
assert.match(actions, /\.from\("subprocesses"\)[\s\S]*\.eq\("status", "active"\)/, "activation must consider only active stages");
assert.match(actions, /\.from\("process_roles"\)[\s\S]*"owner"[\s\S]*"backup"/, "activation must load stage roles server-side");
assert.match(actions, /getRoleDictionary\(\)/, "activation must use official role dictionary");
assert.match(actions, /role\.role_status === "active"/, "activation must accept only active official roles");
assert.match(actions, /officialRoles\.has\(role\.role_id\)/, "non official or archived roles must be ignored before validation");
assert.match(activateAction, /readModel\.status === "archived"/, "archived process activation must be rejected");
assert.match(activateAction, /readModel\.status === "active"/, "active process activation must be idempotent");
assert.match(activateAction, /readModel\.status !== "inactive"/, "only inactive drafts can be activated");
assert.match(activateAction, /validateProcessForActivation\(readModel\.process\)/, "server action must run activation validation server-side");
assert.match(activateAction, /if \(!validation\.isValid\)/, "server action must block when validation fails");
assert.match(activateAction, /validation\.missingFields\.map/, "server action must return missing fields on failure");
assert.match(activateAction, /\.from\("processes"\)[\s\S]*\.update\(\{[\s\S]*documentation_status: "documented",[\s\S]*status: "active",[\s\S]*updated_at: new Date\(\)\.toISOString\(\),[\s\S]*\}\)/, "activation update must only set status, documentation and updated_at");
assert.match(activateAction, /\.eq\("status", "inactive"\)/, "activation update must guard inactive status at write time");
assert.doesNotMatch(activateAction, /owner_role_id|person_id|subprocesses|process_roles/, "activation must not modify owners, people, stages or process roles");
assert.match(activateAction, /revalidatePath\("\/procesos"\)/, "activation must revalidate process list");
assert.match(activateAction, /revalidatePath\(`\/procesos\/\$\{processId\}`\)/, "activation must revalidate detail page");
assert.match(activateAction, /revalidatePath\(`\/procesos\/\$\{processId\}\/editar`\)/, "activation must revalidate edit page");
assert.match(activateAction, /redirect\(withMessage\(`\/procesos\/\$\{processId\}`/, "activation must redirect to process detail");

assert.match(validation, /key: `stage_owner:/, "missing stage owner must be blocking");
assert.match(validation, /key: `stage_impact:/, "null stage impact must be blocking");
assert.match(validation, /key: `stage_impact_range:/, "out-of-range impact must be blocking");
assert.match(validation, /key: "impact_total"[\s\S]*severity: "blocking"/, "impact total different from 100 must be blocking");
assert.match(validation, /export function getProcessActivationCompleteness/, "completion helper must be centralized");

console.log("process-activation: 34/34 OK");
