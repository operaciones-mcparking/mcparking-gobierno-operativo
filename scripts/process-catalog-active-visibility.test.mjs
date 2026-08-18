import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = readFileSync("src/lib/dashboard/data.ts", "utf8");
const page = readFileSync("src/app/procesos/page.tsx", "utf8");
const client = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");
const schema = readFileSync("supabase/migrations/20260812120000_extend_process_master_sheet.sql", "utf8");

assert.match(data, /export async function getProcessCatalogV2[\s\S]*?noStore\(\);[\s\S]*?\.from\("v_process_catalog_v2"\)/);
assert.doesNotMatch(page, /19 procesos organizados/i);
assert.match(page, /activeProcesses=\{activeProcesses\}/);
assert.match(client, /activeProcesses\.(filter|map)/);
assert.doesNotMatch(`${page}\n${client}`, /7b717f00-234f-4761-99eb-b6366d36a3f7|\.slice\(0,\s*19\)|\.limit\(19\)/);

assert.match(data, /\.from\("processes"\)[\s\S]*\.select\("id,process_code,owner_role_id,master_updated_at,updated_at,created_at"\)[\s\S]*processMetadataById/);
assert.match(client, /newProcesses = useMemo\(\(\) => filteredProcesses\.filter\(\(process\) => Boolean\(process\.process_code\)\), \[filteredProcesses\]\)/);
assert.match(client, /historicalProcesses = useMemo\(\(\) => filteredProcesses\.filter\(\(process\) => !process\.process_code\), \[filteredProcesses\]\)/);
assert.match(client, /"Procesos nuevos"[\s\S]*"Procesos históricos \/ por documentar"/);
assert.match(client, /processes\.length[\s\S]*No hay procesos en este grupo/);
assert.match(schema, /process_code is null or btrim\(process_code\) <> ''[\s\S]*idx_processes_process_code_unique_ci/);
assert.doesNotMatch(client, /process_name\s*===|process_id\s*===\s*["']/);

console.log("process-catalog-active-visibility: 12/12 OK");