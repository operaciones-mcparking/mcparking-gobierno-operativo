import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");

assert.match(catalog, /type ProcessSortKey = "type" \| "process" \| "owner" \| "person" \| "stages"/, "only the five official columns may be sortable");
assert.match(catalog, /useState<ProcessSortState \| null>\(null\)/, "the default state must preserve source order");
assert.match(catalog, /current\?\.key === key[\s\S]*"descending" : "ascending"[\s\S]*\{ key, direction: "ascending" \}/, "a repeated click must reverse direction and a new column must restart ascending");
assert.match(catalog, /new Intl\.Collator\("es", \{ numeric: true, sensitivity: "base" \}\)/, "text sorting must be locale-aware");
assert.match(catalog, /sort\.key === "process"[\s\S]*compare\(left\.process_name, right\.process_name\)/, "process sorting must use the process name");
assert.match(catalog, /sort\.key === "owner"[\s\S]*left\.owner_role_names[\s\S]*right\.owner_role_names/, "owner sorting must use owner role names");
assert.match(catalog, /sort\.key === "person"[\s\S]*left\.current_person_names[\s\S]*right\.current_person_names/, "person sorting must use current person names");
assert.match(catalog, /processTypeSortOrder[\s\S]*strategic: 0[\s\S]*operational: 1[\s\S]*support: 2/, "type sorting must reuse the visible business order");
assert.match(catalog, /sort\.key === "stages"[\s\S]*left\.active_stage_count - right\.active_stage_count/, "stage sorting must be numeric");
assert.ok(catalog.indexOf("const filteredProcesses") < catalog.indexOf("const sortedNewProcesses"), "sorting must happen after search and filters");
assert.match(catalog, /catalogMode === "new-only" \? sortOfficialProcesses\(newProcesses, sort\) : newProcesses/, "sorting must be isolated to the official structure catalog");
assert.match(catalog, /aria-sort=\{active \? sort\.direction : "none"\}[\s\S]*role="columnheader"[\s\S]*<button/, "sortable headers must expose aria-sort and keyboard buttons");
assert.match(catalog, /<span className="text-right" role="columnheader">Accion<\/span>/, "Action must remain a non-sortable header");
assert.match(catalog, /function clearFilters\(\) \{[\s\S]*setFilters\(emptyFilters\);[\s\S]*function toggleSort/, "clearing filters must not reset sorting");
assert.match(catalog, /historicalProcesses,[\s\S]*true,[\s\S]*\) : null/, "historical and draft grouping must keep its original unsorted list");

console.log("structure-process-sorting: 15/15 OK");