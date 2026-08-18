import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");
const structurePage = readFileSync("src/app/estructura/page.tsx", "utf8");
const explorer = readFileSync("src/app/estructura/structure-explorer.tsx", "utf8");

assert.match(client, /const compactMobile = catalogMode === "new-only" && newModel/, "compact cards must be scoped to the new-only structure catalog");
assert.match(client, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/, "mobile card must use two balanced columns");
assert.match(client, /col-start-1 row-start-1[\s\S]*ValueBadge tone=\{typeMeta\.tone\}/, "type badge must stay at the upper left");
assert.match(client, /col-start-2 row-start-1 flex justify-self-end[\s\S]*Etapas \{process\.active_stage_count\}/, "stage badge must stay at the upper right");
assert.match(client, /col-span-2 row-start-2 min-w-0[\s\S]*process\.process_name/, "process title must use the full mobile width");
assert.match(client, /col-start-1 row-start-3 min-w-0[\s\S]*Rol dueno/, "owner must use the left metadata column");
assert.match(client, /col-start-2 row-start-3 min-w-0[\s\S]*Persona actual/, "person must use the right metadata column");
assert.match(client, /compactMobile \? "gap-x-3 gap-y-2" : "gap-3"/, "mobile vertical spacing must be compact");
assert.match(client, /compactMobile \? "px-3 py-2\.5 sm:px-4 sm:py-3" : "px-4 py-3"/, "mobile card padding must be reduced without fixed heights");
assert.match(client, /newProcessListGridColumns = "xl:grid-cols-\[88px_minmax\(340px,1fr\)_148px_140px_78px_146px\]"/, "desktop grid must remain unchanged");
assert.match(client, /xl:col-auto xl:row-auto/, "mobile placement must reset at the desktop breakpoint");
assert.match(client, /<ProcessFilters[\s\S]*onClearFilters=\{clearFilters\}[\s\S]*onFilterChange=\{updateFilter\}/, "search and filters must remain connected");
assert.match(explorer, /if \(!canEdit \|\| !matrixEditingEnabled \|\| !item\.id\) return/, "matrix write protection must remain intact");
assert.match(structurePage, /canEdit=\{structureAccess\.canEditMatrix\}/, "STRUCTURE_EDITOR matrix permission must remain connected");

console.log("structure-process-mobile: 14/14 OK");
