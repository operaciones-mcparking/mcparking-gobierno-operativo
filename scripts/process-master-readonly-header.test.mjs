import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheet = readFileSync("src/app/procesos/process-master/process-master-sheet.tsx", "utf8");
const types = readFileSync("src/app/procesos/process-master/process-master-types.ts", "utf8");
const detailPage = readFileSync("src/app/procesos/[processId]/page.tsx", "utf8");

const readonlyStart = sheet.indexOf('if (mode === "readonly")');
const readonlyEnd = sheet.indexOf('const stages = process.stages.filter', readonlyStart);
const readonly = sheet.slice(readonlyStart, readonlyEnd);

assert.match(readonly, /text-2xl[\s\S]*process\.process\.name[\s\S]*ValueBadge tone=\{statusTone\}/);
assert.match(readonly, /"Vigente"[\s\S]*"Archivado"[\s\S]*"Borrador"/);
assert.match(readonly, /processTypeLabels\[process\.process\.process_type\][\s\S]*company_name/);
assert.match(readonly, /DocumentaryField label="Dueno del proceso"[\s\S]*DocumentaryField label="Codigo"[\s\S]*DocumentaryField label="Ultima edicion"/);
assert.match(readonly, /owner_person_name, "Sin persona asignada"/);
assert.doesNotMatch(readonly, /DocumentaryField label="Version"|Sin publicar|process\.process\.version/);
assert.match(types, /version: string \| null/);
assert.match(readonly, /sm:grid-cols-2[\s\S]*lg:grid-cols-\[minmax\(220px,1\.5fr\)_minmax\(140px,0\.8fr\)_minmax\(160px,0\.9fr\)\]/);
assert.match(readonly, /actions \? <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end"/);
assert.doesNotMatch(readonly, />Ficha de proceso<|>Cabecera documental<|DocumentaryField label="Proceso"|DocumentaryField label="Estado"|DocumentaryField label="Tipo de proceso"|DocumentaryField label="Empresa"/);
assert.match(readonly, /ProcessDocumentSection title=\{"1\. PROP/);
assert.match(sheet, /href="\/estructura#procesos"[\s\S]*Volver a procesos[\s\S]*href=\{`\/procesos\/\$\{processId\}\/editar`\}[\s\S]*Editar proceso/);
assert.match(detailPage, /<ProcessMasterSheet[\s\S]*mode="readonly"/);

console.log("process-master-readonly-header: 12/12 OK");