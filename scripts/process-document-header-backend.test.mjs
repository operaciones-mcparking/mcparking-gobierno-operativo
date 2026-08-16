import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const actions = read("src/app/admin/actions.ts");
const adminPage = read("src/app/admin/page.tsx");
const adminClient = read("src/lib/supabase/admin.ts");
const createForm = read("src/app/procesos/nuevo/create-process-draft-form.tsx");
const data = read("src/lib/dashboard/data.ts");
const createModal = read("src/app/procesos/create-process-modal.tsx");
const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const mapper = read("src/app/procesos/process-master/process-master-mapper.ts");
const migration = read("supabase/migrations/20260813143000_create_process_draft_with_document_header.sql");
const types = read("src/app/procesos/process-master/process-master-types.ts");

const createStart = actions.indexOf("async function persistProcessDraft");
const createEnd = actions.indexOf("export async function addProcess", createStart);
const updateStart = actions.indexOf("async function persistProcessBasics");
const updateEnd = actions.indexOf("export async function activateProcess", updateStart);
const legacyCreateStart = actions.indexOf("export async function addProcess", createEnd);
const legacyCreateEnd = actions.indexOf("export async function addSubprocess", legacyCreateStart);
assert.notEqual(createStart, -1);
assert.notEqual(createEnd, -1);
assert.notEqual(updateStart, -1);
assert.notEqual(updateEnd, -1);
assert.notEqual(legacyCreateStart, -1);
assert.notEqual(legacyCreateEnd, -1);
const createAction = actions.slice(createStart, createEnd);
const legacyCreateAction = actions.slice(legacyCreateStart, legacyCreateEnd);
const updateAction = actions.slice(updateStart, updateEnd);

assert.match(adminClient, /^import "server-only";/);
assert.match(adminClient, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
assert.match(actions, /createSupabaseAdminClient/);
assert.doesNotMatch(createForm, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient|reserve_process_code|\.rpc\(/);

assert.match(actions, /validateOfficialProcessOwner\(processAdmin, ownerRoleId, companyId\)/);
assert.match(actions, /from\("v_role_dictionary"\)[\s\S]*select\("role_id,role_status,company_id"\)[\s\S]*data\.role_status !== "active"/);
assert.match(actions, /const ownerRoleId = optionalValue\(formData, "owner_role_id"\)/);
assert.match(createForm, /name="owner_role_id"/);
assert.match(createForm, /<option value="">Sin rol dueno<\/option>/);
assert.doesNotMatch(createAction + updateAction, /owner_person_id\s*:/);

assert.match(createAction, /\.rpc\([\s\S]*"create_process_draft_with_document_header"/);
assert.doesNotMatch(createAction, /\.from\("processes"\)[\s\S]*\.insert\(/);
assert.match(adminPage, /action=\{addProcess\}/);
assert.match(createModal, /action=\{addProcess\}/);
assert.match(legacyCreateAction, /return createProcessDraft\(formData\)/);
assert.match(legacyCreateAction, /formData\.set\("return_to", "\/admin"\)/);
assert.doesNotMatch(legacyCreateAction, /\.from\("processes"\)|\.insert\(|\.upsert\(/);
assert.doesNotMatch(actions, /\.from\("processes"\)\s*\.\s*(?:insert|upsert)\(/);
assert.doesNotMatch(createForm + createModal, /@\/lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|\.rpc\(/);
assert.match(actions, /function processWriteErrorMessage[\s\S]*return fallback;/);
assert.doesNotMatch(actions, /return `\$\{fallback\} \$\{error\.message\}`/);
assert.match(createAction, /optionalValue\(formData, "process_code"\) \|\| optionalValue\(formData, "version"\)/);
assert.doesNotMatch(createAction, /p_process:[\s\S]*process_code\s*:/);
assert.doesNotMatch(createAction, /p_process:[\s\S]*version\s*:/);
assert.doesNotMatch(createAction, /max\s*\(|count\s*\(/i);

assert.match(migration, /^--[\s\S]*\nbegin;/);
assert.match(migration, /create function public\.create_process_draft_with_document_header\([\s\S]*p_process jsonb[\s\S]*p_owner_role_id uuid default null/);
assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
assert.match(migration, /v_process_code := public\.reserve_process_code\(\);[\s\S]*insert into public\.processes/);
assert.match(migration, /process_code,[\s\S]*v_process_code/);
assert.match(migration, /from public\.v_role_dictionary[\s\S]*role_id = p_owner_role_id[\s\S]*role_status = 'active'/);
assert.doesNotMatch(migration, /owner_person_id/i);
assert.doesNotMatch(migration, /insert into public\.process_versions/i);
assert.doesNotMatch(migration, /update public\.processes[\s\S]*where process_code is null/i);
assert.doesNotMatch(migration, /max\s*\([^)]*process_code|count\s*\(/i);
assert.match(migration, /revoke all on function public\.create_process_draft_with_document_header\(jsonb, uuid\) from public/);
assert.match(migration, /revoke execute on function public\.create_process_draft_with_document_header\(jsonb, uuid\) from anon/);
assert.match(migration, /revoke execute on function public\.create_process_draft_with_document_header\(jsonb, uuid\) from authenticated/);
assert.match(migration, /grant execute on function public\.create_process_draft_with_document_header\(jsonb, uuid\) to service_role/);
assert.match(migration, /commit;\s*$/);

assert.doesNotMatch(updateAction, /process_code\s*:/);
assert.doesNotMatch(updateAction, /version\s*:/);
assert.doesNotMatch(updateAction, /process_versions/);
assert.match(updateAction, /const editableError = await assertEditableProcess\(supabase, processId\)/);
assert.match(updateAction, /formData\.has\("owner_role_id"\)/);
assert.match(updateAction, /validationClient = createSupabaseAdminClient\(\)[\s\S]*validateOfficialProcessOwner\(validationClient, ownerRoleId\)/);
assert.match(updateAction, /updates\.owner_role_id = ownerRoleId/);
assert.match(editPage, /process\.process_code \?\? "Sin codigo"/);
assert.match(editPage, /process\.version \?\? "Sin publicar"/);
assert.doesNotMatch(editPage, /name="process_code"|name="version"/);
assert.match(editPage, /name="owner_role_id"/);

assert.match(data, /owner_role_id,master_updated_at/);
assert.match(data, /from\("v_role_dictionary"\)[\s\S]*role_name,current_person_id,current_person_name/);
assert.match(types, /masterUpdatedAt: string \| null/);
assert.match(mapper, /masterUpdatedAt: process\.master_updated_at/);
assert.match(mapper, /process\.owner_role_id \?\?/);
assert.match(mapper, /process\.owner_person_name \?\?/);

console.log("process-document-header-backend: OK");
