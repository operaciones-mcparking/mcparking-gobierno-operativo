import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorer = readFileSync("src/app/estructura/structure-explorer.tsx", "utf8");

assert.match(explorer, /const \[matrixEditingEnabled, setMatrixEditingEnabled\] = useState\(false\)/, "matrix must start locked on every mount");
assert.match(explorer, /role="switch"/);
assert.match(explorer, /aria-checked=\{matrixEditingEnabled\}/);
assert.match(explorer, /Edición bloqueada/);
assert.match(explorer, /Modo edición activado/);
assert.match(explorer, /onClick=\{\(\) => setMatrixEditingEnabled\(\(enabled\) => !enabled\)\}/, "switch must toggle local state");
assert.match(explorer, /if \(!canEdit \|\| !matrixEditingEnabled \|\| !item\.id\) return;[\s\S]*setAssignmentKeys[\s\S]*toggleRoleGovernanceProcessInline/, "write handler must stop before optimistic and server updates");
assert.match(explorer, /disabled=\{!canEdit \|\| !matrixEditingEnabled \|\| !item\.id \|\| pending\}/, "matrix cells must be disabled while locked");
assert.match(explorer, /cursor-not-allowed opacity-80/, "locked cells must look read-only without hiding their state");
assert.match(explorer, /aria-label=\{`\$\{active \? "Quitar" : "Agregar"\} relación entre/);
assert.match(explorer, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/, "search must remain independent");
assert.match(explorer, /onChange=\{\(event\) => setArea\(event\.target\.value\)\}/, "operation filter must remain independent");
assert.match(explorer, /onChange=\{\(event\) => setRole\(event\.target\.value\)\}/, "role filter must remain independent");
assert.match(explorer, /setArea\(allOption\);[\s\S]*setRole\(allOption\);[\s\S]*setQuery\(""\)/, "clear must remain available");
assert.doesNotMatch(explorer, /localStorage|sessionStorage|inert|pointer-events-none/, "lock must be local and limited to matrix cells");

console.log("structure-matrix-edit-lock: 15/15 OK");