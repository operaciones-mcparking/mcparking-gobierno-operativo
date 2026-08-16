import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/app/procesos/[processId]/editar/archive-process-panel.tsx", "utf8");

assert.match(panel, /Para confirmar, escribe:[\s\S]*PERMANENT_DELETE_CONFIRMATION/);
assert.match(panel, /name="confirmation_text"[\s\S]*value=\{confirmationText\}/);
assert.match(panel, /enabled=\{confirmationText === PERMANENT_DELETE_CONFIRMATION\}/);
assert.match(panel, /Proceso:[\s\S]*\{processName\}/);
assert.match(panel, /if \(deleteInFlightRef\.current \|\| confirmationText !== PERMANENT_DELETE_CONFIRMATION\) return/);
assert.match(panel, /const result = await deleteProcessPermanently[\s\S]*if \(result\.error\) \{[\s\S]*setDeleteError\(result\.error\);[\s\S]*return;[\s\S]*router\.replace\("\/estructura#procesos"\)/);
assert.match(panel, /catch \{[\s\S]*setDeleteError\("No se pudo eliminar definitivamente el proceso\."\)/);
assert.match(panel, /pending \? "Eliminando\.\.\." : "Eliminar definitivamente"/);
assert.doesNotMatch(panel, /action=\{deleteProcessPermanently\}|confirmationName|window\.location|\.reload\(/);

console.log("process-permanent-delete-ui: 9/9 OK");