import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const editPage = read("src/app/procesos/[processId]/editar/page.tsx");
const archivePanel = read("src/app/procesos/[processId]/editar/archive-process-panel.tsx");
const documentLayout = read("src/app/procesos/process-master/process-document-layout.tsx");
const masterSheet = read("src/app/procesos/process-master/process-master-sheet.tsx");
const sectionForm = read("src/app/procesos/process-master/process-section-form.tsx");
const roleEditor = read("src/app/procesos/process-master/process-role-profiles-editor.tsx");
const metricEditor = read("src/app/procesos/process-master/process-metrics-editor.tsx");
const riskEditor = read("src/app/procesos/process-master/process-risks-controls-editor.tsx");
const coordinator = read("src/app/procesos/process-master/process-master-save-coordinator.tsx");

assert.match(editPage, /rounded-lg bg-\[#f8fafc\][\s\S]*sm:grid-cols-2/, "the edit header must use a soft compact metadata layout");
assert.match(editPage, /text-base font-bold text-navy[\s\S]*name="name"/, "the process name must remain visually prominent and editable");
assert.match(editPage, /process\.status === "active" \? "Vigente" : "Borrador"/, "status must remain visible as compact metadata");
assert.doesNotMatch(editPage, /Activo\. Este proceso ya forma parte del Diccionario/, "active status must not be duplicated in a large banner");
assert.match(documentLayout, /bg-navy px-4 py-2\.5[\s\S]*text-\[13px\]/, "section bars must keep navy identity with reduced height");
assert.match(documentLayout, /sm:grid-cols-\[9rem_minmax\(0,1fr\)\]/, "document rows must keep a compact responsive label/content layout");
assert.doesNotMatch(documentLayout, /sm:border-r/, "document rows must avoid rigid vertical separators");
assert.match(masterSheet, /mt-5 grid gap-6/, "the sheet must add air between sections");
assert.match(masterSheet, /rounded-lg border border-\[#dbe4eb\] bg-white/, "the sheet header must use a soft card without a heavy shadow");
assert.doesNotMatch(sectionForm, /<button/, "document sections must not repeat save controls");
assert.match(coordinator, /sticky top-3[\s\S]*Guardar ficha/, "the master save must use one compact sticky action bar");

for (const [name, source] of [["roles", roleEditor], ["metrics", metricEditor], ["risks", riskEditor]]) {
  assert.match(source, /rows\.length \? <div[\s\S]*border-b border-\[#e7edf2\] bg-\[#f8fafb\][\s\S]*text-\[11px\]/, `${name} must show the shared compact table header only with rows`);
  assert.match(source, /border-t border-\[#e7edf2\] bg-\[#fbfcfd\]/, `${name} must use the shared compact footer`);
  assert.doesNotMatch(source, /Guardar (?:roles|indicadores|riesgos)/, `${name} must not repeat the master save action`);
}

assert.match(roleEditor, /rows\.length \? <div[\s\S]*\+ Agregar rol/, "roles empty state must lead directly to its add action");
assert.match(metricEditor, /rows\.length \? <div[\s\S]*\+ Agregar indicador/, "metrics empty state must lead directly to its add action");
assert.match(riskEditor, /rows\.length \? <div[\s\S]*\+ Agregar riesgo \/ oportunidad/, "risks empty state must lead directly to its add action");
assert.match(archivePanel, /<details className="group">[\s\S]*<summary[\s\S]*Zona administrativa/, "administrative actions must be collapsed in a native details control");
assert.doesNotMatch(archivePanel, /<details[^>]*\sopen(?:=|\s|>)/, "administrative zone must be closed by default");
assert.match(archivePanel, /archiveProcess/, "archive behavior must remain connected");

console.log("process-master-visual-refinement: OK");