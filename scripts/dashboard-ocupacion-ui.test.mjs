import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

const client = readFileSync("src/app/dashboard-operacional/dashboard-operacional-client.tsx", "utf8");
const component = readFileSync("src/app/dashboard-operacional/operational-occupancy-section.tsx", "utf8");
const selectionHelper = readFileSync("src/lib/dashboard/ocupacion-selection.ts", "utf8");
const formatters = readFileSync("src/app/dashboard-operacional/dashboard-operacional-formatters.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function compile(source) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

const { availableOccupancyParkingNames, emptyOccupancyParkingSelection, mergeOccupancyParkingSelection, occupancySelectionStorageKey, parseOccupancyParkingSelection, selectedAvailableOccupancyParkings } = compile(selectionHelper);
const { formatCurrency } = compile(formatters);

test("1. bloque Ocupacion queda despues de Resumen y antes del drawer", () => {
  const summary = client.indexOf("Resumen por estacionamiento");
  const occupancy = client.indexOf("<OperationalOccupancySection");
  const drawer = client.lastIndexOf("<ParkingDetailDrawer");
  assert.ok(summary >= 0 && occupancy > summary && drawer > occupancy);
});

test("2. selector segmentado conserva niveles fisico y comercial", () => {
  assert.match(component, /aria-label="Nivel de ocupación"/);
  assert.match(component, /"physical", "commercial"/);
  assert.match(component, /"Agregado" : "Por canal"/);
  assert.match(component, /aria-label=\{value === "physical" \? "Agregado" : "Por canal"\}/);
  assert.doesNotMatch(component, />Físico<|>Comercial</);
  assert.match(component, /mode === "physical" \? displayRows\.physical : displayRows\.commercial/);
});

test("3. primera visita selecciona todos los parkings disponibles", () => {
  const result = mergeOccupancyParkingSelection({ physical: ["MC PARKING VESPUCIO", "OK PARKING RC"], commercial: ["EAP", "MCP"] }, null);
  assert.deepEqual(result.physical.selected, ["MC PARKING VESPUCIO", "OK PARKING RC"]);
  assert.deepEqual(result.commercial.selected, ["EAP", "MCP"]);
});

test("4. selecciones fisica y comercial son independientes y persistibles", () => {
  const saved = emptyOccupancyParkingSelection();
  saved.physical = { known: ["F1", "F2"], selected: ["F1"] };
  saved.commercial = { known: ["C1", "C2"], selected: ["C2"] };
  const result = mergeOccupancyParkingSelection({ physical: ["F1", "F2"], commercial: ["C1", "C2"] }, parseOccupancyParkingSelection(JSON.stringify(saved)));
  assert.deepEqual(result.physical.selected, ["F1"]);
  assert.deepEqual(result.commercial.selected, ["C2"]);
  assert.equal(occupancySelectionStorageKey, "orquestador:ocupacion:parking-selection:v1");

});

test("5. parking nuevo queda activo y parking ausente se conserva", () => {
  const saved = { version: 1, physical: { known: ["ANTIGUO", "ACTUAL"], selected: ["ANTIGUO", "ACTUAL"] }, commercial: { known: [], selected: [] } };
  const result = mergeOccupancyParkingSelection({ physical: ["ACTUAL", "NUEVO"], commercial: [] }, parseOccupancyParkingSelection(JSON.stringify(saved)));
  assert.deepEqual(result.physical.selected, ["ACTUAL", "ANTIGUO", "NUEVO"]);
  assert.deepEqual(result.physical.known, ["ACTUAL", "ANTIGUO", "NUEVO"]);
});

test("5a. chips visibles usan solo el dataset activo y no storage o tendencia contaminados", () => {
  const visible = availableOccupancyParkingNames({
    physical: ["MC PARKING VESPUCIO", "OK PARKING RC"],
    commercial: ["ESTACIONAMIENTO AEROPUERTO", "MC PARKING VESPUCIO"],
  });
  const saved = {
    version: 1,
    physical: { known: ["ESTACIONAMIENTO AEROPUERTO"], selected: ["ESTACIONAMIENTO AEROPUERTO"] },
    commercial: { known: ["ESTACIONAMIENTO AEROPUERTO"], selected: ["ESTACIONAMIENTO AEROPUERTO"] },
  };
  const reconciled = mergeOccupancyParkingSelection(visible, saved);
  const availableBlock = component.slice(component.indexOf("const available"), component.indexOf("useEffect", component.indexOf("const available")));

  assert.equal(visible.physical.includes("ESTACIONAMIENTO AEROPUERTO"), false);
  assert.equal(visible.commercial.includes("ESTACIONAMIENTO AEROPUERTO"), true);
  assert.equal(reconciled.physical.selected.includes("ESTACIONAMIENTO AEROPUERTO"), true);
  assert.deepEqual(selectedAvailableOccupancyParkings(visible.physical, reconciled.physical.selected), ["MC PARKING VESPUCIO", "OK PARKING RC"]);
  assert.match(component, /selectedAvailableOccupancyParkings\(available\[mode\], selection\[mode\]\.selected\)/);
  assert.match(availableBlock, /displayRows\.physical/);
  assert.match(availableBlock, /displayRows\.commercial/);
  assert.doesNotMatch(availableBlock, /trendData/);
});

test("6. storage corrupto se ignora y reconstruye defaults", () => {
  assert.equal(parseOccupancyParkingSelection("{mal-json"), null);
  assert.equal(parseOccupancyParkingSelection(JSON.stringify({ version: 1, physical: {}, commercial: {} })), null);
  const result = mergeOccupancyParkingSelection({ physical: ["F1"], commercial: ["C1"] }, parseOccupancyParkingSelection("{mal-json"));
  assert.deepEqual(result.physical.selected, ["F1"]);
  assert.deepEqual(result.commercial.selected, ["C1"]);
});

test("7. localStorage se consulta solo en efectos de cliente", () => {
  assert.match(component, /useEffect\(\(\) => \{[\s\S]*window\.localStorage\.getItem/);
  assert.match(component, /useEffect\(\(\) => \{[\s\S]*window\.localStorage\.setItem/);
  assert.doesNotMatch(component, /useState[^;]*localStorage/);
});

test("8. chips accesibles filtran estacionamientos seleccionados", () => {
  assert.match(component, /aria-label="Filtros de estacionamiento"/);
  assert.match(component, /aria-pressed=\{selected\.has\(parking\)\}/);
  assert.match(component, /toggleParking\(parking\)/);
});

test("8a. no existe filtro superior de sistema", () => {
  assert.doesNotMatch(component, /Sistema de ocupación|\["ALL", "MCP", "OKP", "NP"\]|selectSystem/);
});

test("8b. storage v1 y v2 migran chips fisicos OKP sin tocar comercial", () => {
  for (const version of [1, 2]) {
    const migrated = parseOccupancyParkingSelection(JSON.stringify({
      version,
      system: "OKP",
      physical: { known: ["MC PARKING VESPUCIO", "OK PARKING RC", "OK PARKING EXPRESS"], selected: ["MC PARKING VESPUCIO", "OK PARKING RC"] },
      commercial: { known: ["OK PARKING RC", "OK PARKING EXPRESS"], selected: ["OK PARKING EXPRESS"] },
    }));
    assert.equal(migrated.version, 1);
    assert.deepEqual(migrated.physical.known, ["MC PARKING VESPUCIO", "OKP TOTAL"]);
    assert.deepEqual(migrated.physical.selected, ["MC PARKING VESPUCIO", "OKP TOTAL"]);
    assert.deepEqual(migrated.commercial.selected, ["OK PARKING EXPRESS"]);
  }
});

test("8c. ambos OKP fisicos deseleccionados mantienen OKP TOTAL deseleccionado", () => {
  const migrated = parseOccupancyParkingSelection(JSON.stringify({
    version: 2,
    system: "ALL",
    physical: { known: ["OK PARKING RC", "OK PARKING EXPRESS"], selected: [] },
    commercial: { known: ["OK PARKING RC", "OK PARKING EXPRESS"], selected: ["OK PARKING RC"] },
  }));
  const merged = mergeOccupancyParkingSelection({ physical: ["OKP TOTAL"], commercial: ["OK PARKING RC", "OK PARKING EXPRESS"] }, migrated);
  assert.deepEqual(merged.physical.selected, []);
  assert.deepEqual(merged.commercial.selected, ["OK PARKING RC"]);
});

test("8d. chips fisicos usan display rows y orden canonico", () => {
  const names = availableOccupancyParkingNames({
    physical: ["NP PEHUEN", "OKP TOTAL", "MC PARKING VESPUCIO", "NP EXPRESO 1"],
    commercial: ["OK PARKING RC", "OK PARKING EXPRESS"],
  });
  assert.deepEqual(names.physical, ["MC PARKING VESPUCIO", "OKP TOTAL", "NP EXPRESO 1", "NP PEHUEN"]);
  assert.deepEqual(names.commercial, ["OK PARKING EXPRESS", "OK PARKING RC"]);
  assert.match(component, /physical: displayRows\.physical\.map/);
  assert.match(component, /commercial: displayRows\.commercial\.map/);
});
test("8e. chips y heatmap usan labels solo en vista fisica", () => {
  assert.match(component, /parkingLabel\(parking, mode\)/);
  assert.match(component, /mode === "physical" \? physicalOccupancyDisplayLabel\(parking\) : parking/);
  assert.match(component, /<OperationalOccupancyRevenueHeatmap/);
});

test("9. fisico usa directamente RPC fisica sin sumar comercial", () => {
  assert.match(component, /mode === "physical" \? displayRows\.physical/);
  assert.doesNotMatch(component, /reduce[^;]*(parking_fisico|aporta_ocupacion_fisica)|EAP\s*\+\s*MCP/i);
});

test("10. heatmap conserva reglas null sin alterar gráfico físico", () => {
  assert.equal(formatCurrency(null), "No disponible");
  assert.match(formatCurrency(0), /0/);
  assert.match(component, /heatmapData/);
});

test("11. comercial mantiene dataset y selección independientes", () => {
  assert.match(component, /displayRows\.commercial/);
  assert.match(component, /selection\[mode\]\.selected/);
});

test("12. NP y cualquier revenue null conservan No disponible", () => {
  assert.equal(formatCurrency(null), "No disponible");
});

test("13. Evolución diaria se elimina y heatmap reutiliza filtros", () => {
  assert.doesNotMatch(component, /Evolución diaria|<table|OccupancyMetric/);
  assert.match(component, /selected=\{selected\}/);
});

test("14. no hay cards ni tabla y aparece revenue diario anual", () => {
  assert.doesNotMatch(component, /Última fecha disponible|latestRows|<table|<article/);
  assert.match(component, /<OperationalOccupancyRevenueHeatmap/);
});

test("15. refresh usa un rango y Promise.all para ambos endpoints", () => {
  assert.match(client, /Promise\.all\(\[[\s\S]*requestDashboardRange\(range\)[\s\S]*requestOccupancyRange\(range\)/);
  assert.match(client, /\/api\/dashboard\/operacional\$\{buildDashboardRangeQuery\(range\)\}/);
  assert.match(client, /\/api\/dashboard\/ocupacion\$\{buildDashboardRangeQuery\(range\)\}/);
  assert.match(client, /onSucceeded=\{\(\) => Promise\.all\(\[loadByRange\(dateRange\), loadOccupancyHeatmap\(occupancyHeatmapYear\)\]\)/);
});

test("16. respuesta stale no pisa rango y error de ocupacion queda aislado", () => {
  assert.match(client, /requestId !== activeRequestRef\.current/);
  assert.match(client, /setOccupancyError/);
  assert.match(client, /let dashboardLoaded = false/);
  assert.match(client, /return dashboardLoaded/);
});

test("17. estados loading error empty y responsive estan presentes", () => {
  assert.match(component, /Cargando ocupación/);
  assert.match(component, /No hay datos de ocupación/);
  assert.match(component, /<OperationalOccupancyRevenueHeatmap/);
});

test("18. no agrega dependencias ni toca areas excluidas", () => {
  assert.doesNotMatch(packageJson, /recharts|chart\.js|d3/);
  assert.doesNotMatch(diffNames, /supabase\/migrations|src\/app\/recuperacion|customer-window|n8n/i);
});
