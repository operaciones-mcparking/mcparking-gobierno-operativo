import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260815130000_allow_duplicate_process_role_profiles.sql");
const actions = read("src/app/admin/actions.ts");
const editor = read("src/app/procesos/process-master/process-role-profiles-editor.tsx");
const loader = read("src/lib/procesos/process-role-profiles.ts");
const readonly = read("src/app/procesos/process-master/process-role-profiles-table.tsx");
const pdf = read("src/lib/procesos/process-pdf.ts");
const types = read("src/app/procesos/process-master/process-master-types.ts");
const action = actions.slice(actions.indexOf("export async function saveProcessRoleProfiles"), actions.indexOf("const processMetricFrequencies"));

assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
assert.match(migration, /drop constraint process_role_profiles_process_id_role_id_key/);
assert.match(migration, /values \('id'\), \('process_id'\), \('role_id'\), \('created_at'\)/);
assert.match(migration, /process_role_profiles_pkey[\s\S]*process_role_profiles_process_id_fkey[\s\S]*process_role_profiles_role_id_fkey/);
assert.match(migration, /where sort_order is null or sort_order < 0[\s\S]*Invalid process_role_profiles\.sort_order after backfill/);
assert.match(migration, /add column sort_order integer/);
assert.match(migration, /row_number\(\) over \([\s\S]*partition by process_id[\s\S]*order by created_at, id[\s\S]*\) - 1/);
assert.match(migration, /alter column sort_order set not null/);
assert.match(migration, /check \(sort_order >= 0\)/);
assert.match(migration, /idx_process_role_profiles_process_sort_order[\s\S]*\(process_id, sort_order\)/);
assert.doesNotMatch(migration, /delete from|truncate|drop table/i);

assert.doesNotMatch(editor, /occupiedByOtherRow|Un rol no puede aparecer más de una vez/);
assert.match(editor, /roleOptions\.map\(\(role\) => <option key=\{role\.id\}/);
assert.match(editor, /profileId: row\.id/);
assert.match(editor, /profileId: null/);
assert.match(editor, /clientId: row\.localId[\s\S]*sortOrder/);
assert.match(editor, /savedByClientId[\s\S]*localId: `saved:\$\{profileId\}`/);

assert.doesNotMatch(action, /onConflict: 'process_id,role_id'|Un rol no puede aparecer más de una vez/);
assert.match(action, /uniqueRoleIds = \[\.\.\.new Set\(normalizedRows\.map\(\(row\) => row\.roleId\)\)\]/);
assert.match(action, /submittedProfileIds[\s\S]*existingProfileIds[\s\S]*no pertenece al proceso indicado/);
assert.match(action, /\.update\(values\)[\s\S]*\.eq\('id', row\.profileId\)[\s\S]*\.eq\('process_id', processId\)/);
assert.match(action, /\.insert\(\{ \.\.\.values, process_id: processId \}\)[\s\S]*\.select\('id'\)[\s\S]*\.single\(\)/);
assert.match(action, /\.delete\(\)[\s\S]*\.eq\('process_id', processId\)[\s\S]*\.in\('id', removedProfileIds\)/);
assert.match(action, /savedProfiles\.push\(\{ clientId: row\.clientId, id:/);
assert.match(action, /sort_order: row\.sortOrder/);
assert.match(action, /v_role_dictionary[\s\S]*role_status[\s\S]*process\.company_id/);

assert.match(loader, /select\('id,role_id,responsibility_description,authority_description,accountability_description,sort_order'\)/);
assert.match(loader, /order\('sort_order'[\s\S]*order\('created_at'[\s\S]*order\('id'/);
assert.match(types, /ProcessMasterRoleProfile[\s\S]*id: string[\s\S]*sort_order: number/);
assert.match(readonly, /key=\{row\.id\}/);
assert.doesNotMatch(readonly, /key=\{row\.role_id\}/);
assert.match(pdf, /process\.roleProfiles\.map\(\(profile\) =>/);
assert.doesNotMatch(pdf, /new Set\(process\.roleProfiles|groupBy|dedup/i);

console.log("process-role-profile-duplicates: 33/33 OK");
