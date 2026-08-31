import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

const chart = readFileSync("src/app/dashboard-operacional/operational-occupancy-chart.tsx", "utf8");
const section = readFileSync("src/app/dashboard-operacional/operational-occupancy-section.tsx", "utf8");
const client = readFileSync("src/app/dashboard-operacional/dashboard-operacional-client.tsx", "utf8");
const helper = readFileSync("src/lib/dashboard/ocupacion-chart.ts", "utf8");
const formatters = readFileSync("src/app/dashboard-operacional/dashboard-operacional-formatters.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { getOccupancyTrendRange, occupancySeriesColor, splitOccupancyDailySegments } = module.exports;
const compiledFormatters = ts.transpileModule(formatters, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const formattersModule = { exports: {} };
new Function("exports", "module", compiledFormatters)(formattersModule.exports, formattersModule);
const { formatCurrency } = formattersModule.exports;

test("1. grafico aparece despues de chips y antes de tabla sin cards de resumen", () => {
  const chips = section.indexOf('aria-label="Filtros de estacionamiento"');
  const graph = section.indexOf("<OperationalOccupancyChart");
  const table = section.indexOf("<table");
  assert.ok(chips >= 0 && graph > chips && table > graph);
  assert.match(section, /Evolución diaria/);
  assert.doesNotMatch(section, /latestRows|Última fecha disponible/);
});

test("2. ventana fija incluye cinco meses hasta actual y dos siguientes", () => {
  assert.deepEqual(getOccupancyTrendRange("2026-08-31"), { from: "2026-04-01", to: "2026-10-31" });
  assert.deepEqual(getOccupancyTrendRange("2026-01-15"), { from: "2025-09-01", to: "2026-03-31" });
  assert.match(chart, /Últimos 5 meses y próximos 2 meses\./);
  assert.doesNotMatch(chart, /Últimos 6 meses/);
});

test("3. hoy usa fecha canonica existente y linea vertical roja", () => {
  assert.match(client, /occupancyTodayRef = useRef\(getTodayLocalDate\(\)\)/);
  assert.match(chart, /stroke="#dc2626"/);
  assert.match(chart, /Hoy \{displayDate\(today\)\}/);
  assert.match(chart, /y1=\{margin\.top\}[\s\S]*y2=\{margin\.top \+ model\.plotHeight\}/);
});

test("4. vista fisica crea series por parking fisico canonico", () => {
  assert.match(chart, /mode === "physical" \? \(row as PhysicalOccupancyRow\)\.parking_fisico/);
  assert.doesNotMatch(chart, /EAP\s*\+\s*MCP|OK juntos|aporta_ocupacion_fisica[^;]*reduce/i);
});

test("5. vista comercial crea series por parking comercial", () => {
  assert.match(chart, /\(row as CommercialOccupancyRow\)\.parking_comercial/);
  assert.match(chart, /mode === "physical"[\s\S]*occupancy_percentage/);
  assert.match(chart, /Revenue de ocupación: \$\{formatCurrency\(tooltip\.revenue\)\}/);
});

test("6. los chips existentes controlan exactamente las series", () => {
  assert.match(section, /selected=\{selected\}/);
  assert.match(chart, /filter\(\(row\) => selected\.has\(seriesName\(row, mode\)\)\)/);
});

test("6a. grafico fisico usa OKP TOTAL y comercial conserva filas fuente", () => {
  assert.match(chart, /mode === "physical"[\s\S]*buildPhysicalOccupancyDisplayRows\(data\.physical\)[\s\S]*data\.commercial/);
  assert.match(section, /buildPhysicalOccupancyDisplayRows\(data\?\.physical \?\? \[\]\)/);
  assert.doesNotMatch(section, /Sistema de ocupación|system=\{system\}/);
});
test("7. EAP y MCP comerciales no se fusionan", () => {
  const rows = [
    { fecha: "2026-08-01", parking_comercial: "ESTACIONAMIENTO AEROPUERTO" },
    { fecha: "2026-08-01", parking_comercial: "MC PARKING VESPUCIO" },
  ];
  assert.equal(new Set(rows.map((row) => row.parking_comercial)).size, 2);
  assert.doesNotMatch(chart, /parking_fisico[^\n]*grouped\.set/);
});

test("8. grafico fisico agrupa una sola serie OKP TOTAL", () => {
  assert.match(chart, /buildPhysicalOccupancyDisplayRows\(data\.physical\)/);
  assert.match(chart, /grouped\.set\(name/);
  assert.doesNotMatch(chart, /OK PARKING RC|OK PARKING EXPRESS/);
});

test("8a. leyenda tooltip y foco usan labels fisicos sin cambiar agrupacion", () => {
  assert.match(chart, /mode === "physical" \? physicalOccupancyDisplayLabel\(name\) : name/);
  assert.match(chart, /mode === "physical" \? physicalOccupancyDisplayLabel\(tooltip\.name\) : tooltip\.name/);
  assert.match(chart, /grouped\.set\(name/);
  assert.match(chart, /occupancySeriesColor\(name\)/);
  assert.doesNotMatch(chart, /physicalOccupancyDisplayLabel\(\(row as CommercialOccupancyRow\)\.parking_comercial\)/);
});
test("9. ausencia diaria crea gap y nunca una fila cero", () => {
  const segments = splitOccupancyDailySegments([
    { fecha: "2026-08-01", occupied: 10 },
    { fecha: "2026-08-02", occupied: 11 },
    { fecha: "2026-08-04", occupied: 12 },
  ]);
  assert.deepEqual(segments.map((segment) => segment.map((row) => row.fecha)), [["2026-08-01", "2026-08-02"], ["2026-08-04"]]);
  assert.doesNotMatch(helper, /occupied\s*:\s*0|fillMissing|interpol/);
});

test("10. futuro y NP solo usan filas realmente retornadas", () => {
  assert.match(chart, /mode === "physical"[\s\S]*buildPhysicalOccupancyDisplayRows\(data\.physical\)[\s\S]*data\.commercial/);
  assert.doesNotMatch(chart, /NP[^\n]*(project|future)|completeDays|calendarRange/i);
});

test("11. colores fisicos principales son fijos y el resto conserva fallback estable", () => {
  assert.equal(occupancySeriesColor("MC PARKING VESPUCIO"), "#023574");
  assert.equal(occupancySeriesColor("OKP TOTAL"), "#00d084");
  const fallback = occupancySeriesColor("NP EXPRESO 1");
  assert.equal(fallback, occupancySeriesColor("NP EXPRESO 1"));
  assert.notEqual(fallback, "#023574");
  assert.notEqual(fallback, "#00d084");
  assert.match(helper, /fixedSeriesColors\[parking\]/);
  assert.match(helper, /character\.charCodeAt/);
  assert.match(chart, /backgroundColor: occupancySeriesColor\(name\)/);
  assert.match(chart, /const color = occupancySeriesColor\(name\)/);
  assert.match(chart, /stroke=\{color\}/);
  assert.match(chart, /fill=\{color\}/);
});
test("12. porcentaje superior a cien no limita occupied ni escala", () => {
  const scaleStart = chart.indexOf("const maxOccupied");
  const scaleEnd = chart.indexOf("return {", scaleStart);
  const scaleBlock = chart.slice(scaleStart, scaleEnd);

  assert.match(scaleBlock, /Math\.max\(1, \.\.\.rows\.map\(\(row\) => row\.occupied\)\)/);
  assert.doesNotMatch(scaleBlock, /Math\.min|occupancy_percentage/);
});

test("13. SVG es accesible, responsive y tiene tooltip interactivo", () => {
  assert.match(chart, /role="img"/);
  assert.match(chart, /aria-describedby="occupancy-chart-description"/);
  assert.match(chart, /min-w-\[760px\]/);
  assert.match(chart, /overflow-x-auto/);
  assert.match(chart, /onMouseEnter|onFocus/);
  assert.match(chart, /ocupados`\}/);
  assert.match(chart, /Capacidad \$\{formatInteger\(tooltip\.capacity\)\}/);
  assert.match(chart, /Ocupación \$\{formatTooltipPercentage\(tooltip\.occupancyPercentage\)\}/);
  assert.match(chart, /Revenue de ocupación: \{formatCurrency\(tooltip\.revenue\)\}/);
  assert.match(chart, /mode === "physical" \? \([\s\S]*Revenue de ocupación:/);
});

test("13a. revenue del tooltip conserva null cero y CLP positivo", () => {
  assert.equal(formatCurrency(null), "No disponible");
  assert.equal(formatCurrency(0), "$0");
  assert.equal(formatCurrency(1234567), "$1.234.567");
});

test("14. leyenda contiene solo series agrupadas y activas", () => {
  assert.match(chart, /Leyenda del gráfico/);
  assert.match(chart, /\[\.\.\.model\.grouped\.keys\(\)\]\.sort\(\)/);
});

test("15. refresh consulta horizonte junto al mismo ciclo operacional", () => {
  assert.match(client, /requestOccupancyRange\(occupancyTrendRangeRef\.current\)/);
  assert.match(client, /onSucceeded=\{\(\) => loadByRange\(dateRange\)\}/);
  assert.doesNotMatch(client, /setInterval[^\n]*occupancy|poll[^\n]*occupancy/i);
});

test("16. respuesta stale tampoco pisa tendencia", () => {
  const loadBlock = client.slice(client.indexOf("const loadByRange"), client.indexOf("const loadInitialOccupancy"));
  assert.match(loadBlock, /requestId !== activeRequestRef\.current/);
  assert.match(loadBlock, /setOccupancyTrend\(trendData\)/);
});

test("17. no cambia endpoint ni agrega dependencia grafica", () => {
  assert.doesNotMatch(packageJson, /recharts|chart\.js|d3/);
  assert.doesNotMatch(diffNames, /src\/app\/api\/dashboard\/ocupacion|supabase\/migrations/i);
});
