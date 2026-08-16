import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const action = readFileSync("src/app/admin/actions.ts", "utf8");
const panel = readFileSync("src/app/procesos/[processId]/editar/archive-process-panel.tsx", "utf8");
const baseMigration = readFileSync("supabase/migrations/20260815120000_delete_process_permanently.sql", "utf8");
const confirmationMigration = readFileSync("supabase/migrations/20260816120000_confirm_process_permanent_delete.sql", "utf8");
const initialSchema = readFileSync("supabase/migrations/20260622120000_initial_schema.sql", "utf8");
const serviceStructure = readFileSync("supabase/migrations/20260623100000_company_service_structure.sql", "utf8");
const responsibleRoles = readFileSync("supabase/migrations/20260814120000_add_metric_control_responsible_roles.sql", "utf8");

assert.match(baseMigration, /begin;[\s\S]*commit;/i);
assert.match(confirmationMigration, /create or replace function public\.delete_process_permanently\([\s\S]*security definer[\s\S]*set search_path = public, pg_temp/i);
assert.match(confirmationMigration, /p_confirmation_name is distinct from 'CONFIRMAR'/);
assert.match(confirmationMigration, /pg_advisory_xact_lock[\s\S]*from public\.processes[\s\S]*for update/);
assert.match(confirmationMigration, /delete from public\.process_versions[\s\S]*delete from public\.process_documents[\s\S]*delete from public\.process_role_profiles[\s\S]*delete from public\.processes/i);
assert.match(
  confirmationMigration,
  /delete from public\.processes[\s\S]*if found then[\s\S]*return query select p_process_id, v_process_name;[\s\S]*return;[\s\S]*end if;[\s\S]*raise exception 'Process could not be deleted'/i,
  "The successful delete path must return before the failure exception",
);
assert.doesNotMatch(confirmationMigration, /delete from public\.(roles|people|companies|areas|systems)\b/i);
assert.match(confirmationMigration, /revoke all[\s\S]*anon[\s\S]*authenticated[\s\S]*grant execute[\s\S]*service_role/i);

assert.match(action, /export async function deleteProcessPermanently[\s\S]*confirmationText !== "CONFIRMAR"/);
assert.match(action, /await requireAdminAccess\(\)[\s\S]*createSupabaseAdminClient\(\)[\s\S]*\.rpc\("delete_process_permanently"/);
assert.match(action, /const rpcPayload = \{[\s\S]*p_confirmation_name: confirmationText[\s\S]*p_process_id: processId/);
assert.doesNotMatch(action, /RPC request|RPC response|payload: rpcPayload/);
assert.match(action, /Array\.isArray\(data\)[\s\S]*row\.process_id === processId[\s\S]*row\.process_name === process\.name/);
assert.match(action, /console\.error\("\[deleteProcessPermanently\] RPC failed"[\s\S]*return \{ error: "No se pudo eliminar definitivamente el proceso\." \}/);
assert.doesNotMatch(action.match(/export async function deleteProcessPermanently[\s\S]*?\n}\n/)?.[0] ?? "", /redirect\(|\.delete\(/);
assert.match(action, /revalidatePath\("\/procesos"\)[\s\S]*revalidatePath\("\/estructura"\)[\s\S]*return \{ error: null \}/);

assert.match(panel, /role="dialog"[\s\S]*Eliminar proceso definitivamente/);
assert.match(panel, /PERMANENT_DELETE_CONFIRMATION = "CONFIRMAR"/);
assert.match(panel, /Proceso:[\s\S]*\{processName\}/);
assert.match(panel, /confirmationText === PERMANENT_DELETE_CONFIRMATION/);
assert.doesNotMatch(panel, /window\.confirm|confirm\(/);
assert.match(panel, /deleteInFlightRef\.current/);
assert.match(panel, /disabled=\{!enabled \|\| pending\}/);

for (const table of ["subprocesses", "process_roles", "process_systems", "risks", "controls", "metrics"]) {
  assert.match(initialSchema, new RegExp(`create table public\\.${table} \\([\\s\\S]*references public\\.processes\\(id\\) on delete cascade`));
}
assert.match(serviceStructure, /create table if not exists public\.process_clients \([\s\S]*references public\.processes\(id\) on delete cascade/);
assert.match(responsibleRoles, /metric_id uuid not null references public\.metrics\(id\) on delete cascade/);
assert.match(responsibleRoles, /control_id uuid not null references public\.controls\(id\) on delete cascade/);

console.log("process-permanent-delete: OK");