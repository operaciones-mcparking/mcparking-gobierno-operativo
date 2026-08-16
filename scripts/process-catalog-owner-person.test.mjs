import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = readFileSync("src/lib/dashboard/data.ts", "utf8");
const client = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");
const roleView = readFileSync("supabase/migrations/20260625123000_role_person_operational_context.sql", "utf8");

const catalogStart = data.indexOf("export async function getProcessCatalogV2");
const catalogEnd = data.indexOf("export async function getProcessCatalogV2Item", catalogStart);
const catalog = data.slice(catalogStart, catalogEnd);

assert.match(catalog, /\.from\("processes"\)[\s\S]*\.select\("id,process_code,owner_role_id"\)/);
assert.match(catalog, /\.from\("v_role_dictionary"\)[\s\S]*role_id,role_name,current_person_id,current_person_name/);
assert.match(catalog, /canonicalOwnerRoleId[\s\S]*owner_role_ids: canonicalOwnerRoleId[\s\S]*: row\.owner_role_ids/);
assert.match(catalog, /current_person_names: canonicalOwnerRoleId[\s\S]*canonicalOwner\.current_person_name[\s\S]*: row\.current_person_names/);
assert.match(catalog, /owner_role_names: canonicalOwnerRoleId[\s\S]*\[canonicalOwner\.role_name\]/);
assert.match(catalog, /current_person_names: canonicalOwnerRoleId[\s\S]*: \[\][\s\S]*: row\.current_person_names/);
assert.doesNotMatch(catalog, /support_role_(ids|names|types)\s*:/, "support roles must remain owned by the existing catalog view");
assert.match(roleView, /pr\.status = 'active'[\s\S]*pr\.is_primary = true[\s\S]*limit 1/);
assert.match(client, /compactList\(process\.owner_role_names, "Sin rol dueno"\)/);
assert.match(client, /compactList\(process\.current_person_names, "Sin persona asignada"\)/);
assert.match(client, /newProcesses[\s\S]*historicalProcesses/);

console.log("process-catalog-owner-person: 11/11 OK");