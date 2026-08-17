import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");

assert.match(client, /newProcessListGridColumns = "xl:grid-cols-\[88px_minmax\(340px,1fr\)_148px_140px_78px_146px\]"/);
assert.match(client, /legacyProcessListGridColumns = "xl:grid-cols-\[88px_minmax\(260px,1fr\)_136px_126px_78px_144px_146px\]"/);
assert.match(client, /\{newModel \? null : <span>Roles de apoyo<\/span>\}/);
assert.match(client, /newModel \? null : \([\s\S]*<SupportRoleSummary values=\{process\.support_role_names\}/);
assert.match(client, /newModel \? \([\s\S]*row\.subprocess_name[\s\S]*row\.subprocess_description\?\.trim\(\) \|\| "Sin descripcion"/);
assert.match(client, /\) : \([\s\S]*Responsable funcional[\s\S]*Impacto/);
assert.match(client, /sortedNewProcesses,[\s\S]*false,[\s\S]*true,/);
assert.match(client, /historicalProcesses,[\s\S]*true,/);
assert.match(client, /aria-disabled=\{newModel && rows\.length === 0\}[\s\S]*event\.preventDefault\(\)/);
assert.match(client, /Etapas \{process\.active_stage_count\}/);
assert.match(client, /<ProcessDetailModal[\s\S]*Descargar ficha PDF de/);
assert.doesNotMatch(client, /href=\{`\/procesos\/\$\{process\.process_id\}\/editar`\}/);
assert.doesNotMatch(client, /Editar proceso/);
assert.match(client, /<FileDown className="h-4 w-4" \/>/);
assert.match(client, /title="Descargar PDF"/);
assert.match(client, /href=\{\x60\/api\/procesos\/\$\{process\.process_id\}\/pdf\x60\}/);
assert.match(client, /download/);
assert.doesNotMatch(client, /<button[\s\S]*disabled[\s\S]*Descarga PDF proximamente/);

console.log("process-catalog-new-legacy-ui: 16/16 OK");