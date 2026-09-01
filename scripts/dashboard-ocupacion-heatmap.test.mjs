import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

const helper = readFileSync("src/lib/dashboard/ocupacion-heatmap.ts", "utf8");
const component = readFileSync("src/app/dashboard-operacional/operational-occupancy-revenue-heatmap.tsx", "utf8");
const section = readFileSync("src/app/dashboard-operacional/operational-occupancy-section.tsx", "utf8");
const client = readFileSync("src/app/dashboard-operacional/dashboard-operacional-client.tsx", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { buildOccupancyPercentageHeatmap, buildOccupancyRevenueHeatmap, buildRevenueQuantileScale, buildYearCalendar, getOccupancyHeatmapLevel, getRevenueHeatmapLevel, occupancyHeatmapYears, occupancyYearRange } = module.exports;

function row(overrides = {}) {
  return { fecha: "2026-08-31", parking_fisico: "MC PARKING VESPUCIO", parking_comercial: "MC PARKING VESPUCIO", revenue_ocupacion: 1000, ...overrides };
}

test("1. selector genera desde 2024 hasta año actual sin hardcode futuro", () => {
  assert.deepEqual(occupancyHeatmapYears(2026), [2024, 2025, 2026]);
  assert.deepEqual(occupancyHeatmapYears(2027), [2024, 2025, 2026, 2027]);
  assert.match(client, /initialHeatmapYearRef = useRef\(Number\(occupancyTodayRef\.current\.slice\(0, 4\)\)\)/);
  assert.match(client, /useState\(initialHeatmapYearRef\.current\)/);
});

test("2. rango anual es exacto y no altera dateRange", () => {
  assert.deepEqual(occupancyYearRange(2025), { from: "2025-01-01", to: "2025-12-31" });
  assert.match(client, /const range = \{ \.\.\.occupancyYearRange\(year\), preset: "custom" as const \}/);
  assert.doesNotMatch(client, /setDateRange\(range\)[\s\S]{0,100}loadOccupancyHeatmap/);
});

test("3. calendario conserva 365 y 366 dias incluido 29 febrero", () => {
  assert.equal(buildYearCalendar(2025).length, 365);
  const leap = buildYearCalendar(2024);
  assert.equal(leap.length, 366);
  assert.equal(leap.some((day) => day.date === "2024-02-29"), true);
});

test("4. agregado suma solo series fisicas seleccionadas", () => {
  const days = buildOccupancyRevenueHeatmap([
    row({ parking_fisico: "MC PARKING VESPUCIO", revenue_ocupacion: 1000 }),
    row({ parking_fisico: "OKP TOTAL", revenue_ocupacion: 2500 }),
    row({ parking_fisico: "NP PEHUEN", revenue_ocupacion: null }),
  ], 2026, "physical", new Set(["MC PARKING VESPUCIO", "OKP TOTAL"]));
  const day = days.find((value) => value.date === "2026-08-31");
  assert.equal(day.total, 3500);
  assert.deepEqual(day.breakdown.map((item) => item.name), ["MC PARKING VESPUCIO", "OKP TOTAL"]);
});

test("5. por canal usa nombres comerciales sin mezclar fisico", () => {
  const days = buildOccupancyRevenueHeatmap([
    row({ parking_comercial: "ESTACIONAMIENTO AEROPUERTO", revenue_ocupacion: 700 }),
    row({ parking_comercial: "MC PARKING VESPUCIO", revenue_ocupacion: 300 }),
  ], 2026, "commercial", new Set(["ESTACIONAMIENTO AEROPUERTO"]));
  const day = days.find((value) => value.date === "2026-08-31");
  assert.equal(day.total, 700);
  assert.deepEqual(day.breakdown, [{ name: "ESTACIONAMIENTO AEROPUERTO", revenue: 700 }]);
});

test("6. filtros quitan y reponen aporte inmediatamente", () => {
  const rows = [row({ parking_fisico: "A", revenue_ocupacion: 10 }), row({ parking_fisico: "B", revenue_ocupacion: 20 })];
  const total = (selected) => buildOccupancyRevenueHeatmap(rows, 2026, "physical", new Set(selected)).find((day) => day.date === "2026-08-31").total;
  assert.equal(total(["A", "B"]), 30);
  assert.equal(total(["A"]), 10);
  assert.equal(total(["A", "B"]), 30);
});

test("7. sin fila todos null y cero mantienen semanticas distintas", () => {
  const value = (rows) => buildOccupancyRevenueHeatmap(rows, 2026, "physical", new Set(["A"])).find((day) => day.date === "2026-08-31");
  assert.deepEqual(value([]), { date: "2026-08-31", day: 31, month: 7, breakdown: [], total: null });
  assert.equal(value([row({ parking_fisico: "A", revenue_ocupacion: null })]).total, null);
  assert.equal(value([row({ parking_fisico: "A", revenue_ocupacion: 0 })]).total, 0);
  assert.equal(value([row({ parking_fisico: "A", revenue_ocupacion: 0 })]).breakdown[0].revenue, 0);
});

test("8. revenue usa nueve cuantiles incluye cero y excluye null", () => {
  const scale = buildRevenueQuantileScale([null, 0, 10, 20, 30, 40, 50, 60, 70, 80, 10000]);
  assert.equal(scale.thresholds.length, 8);
  assert.equal(getRevenueHeatmapLevel(null, scale), 0);
  assert.equal(getRevenueHeatmapLevel(0, scale), 1);
  assert.ok(getRevenueHeatmapLevel(80, scale) > getRevenueHeatmapLevel(20, scale));
  assert.ok(getRevenueHeatmapLevel(80, scale) >= 7, "un outlier no aplasta los valores altos normales");
  const equalScale = buildRevenueQuantileScale([5, 5, 5]);
  assert.equal(getRevenueHeatmapLevel(5, equalScale), 1);
  const sparseScale = buildRevenueQuantileScale([0, 10]);
  assert.ok(getRevenueHeatmapLevel(10, sparseScale) > getRevenueHeatmapLevel(0, sparseScale));
});

test("9. UI muestra doce meses responsive leyenda y tooltip accesible", () => {
  assert.match(component, /Array\.from\(\{ length: 12 \}/);
  assert.match(component, /grid-cols-1[^"]*sm:grid-cols-2[^"]*xl:grid-cols-4/);
  assert.match(component, /Menor/);
  assert.match(component, /Mayor/);
  assert.match(component, /aria-label=\{`\$\{displayDate\(day\.date\)\}, \$\{metric === "revenue"/);
  assert.match(component, /Revenue de ocupaci/);
  assert.match(component, /group-hover:block group-focus-within:block/);
  assert.match(component, /displayName\(item\.name, mode\).*formatCurrency\(item\.revenue\)/);
});

test("10. sección reemplaza Evolución diaria debajo del gráfico", () => {
  const chart = section.indexOf("<OperationalOccupancyChart");
  const heatmap = section.indexOf("<OperationalOccupancyRevenueHeatmap");
  assert.ok(chart >= 0 && heatmap > chart);
  assert.doesNotMatch(section, /Evolución diaria|<table|OccupancyMetric/);
});

test("11. fisico reutiliza display rows y comercial permanece separado", () => {
  assert.match(component, /const physicalRows = useMemo\(\(\) => data \? buildPhysicalOccupancyDisplayRows\(data\.physical\) : \[\]/);
  assert.match(component, /mode === "physical" \? physicalRows : data\.commercial/);
  assert.doesNotMatch(component, /parking_comercial[^\n]*(reduce|parking_fisico)/);
  assert.match(section, /selected=\{selected\}/);
});

test("12. año cambia fetch refresca con composite y respuesta stale no pisa", () => {
  assert.match(client, /useEffect\(\(\) => \{\s*void loadOccupancyHeatmap\(occupancyHeatmapYear\)/);
  assert.match(client, /Promise\.all\(\[loadByRange\(dateRange\), loadOccupancyHeatmap\(occupancyHeatmapYear\)\]\)/);
  assert.match(client, /requestId !== heatmapRequestRef\.current/);
  assert.match(client, /setOccupancyHeatmapError/);
  assert.doesNotMatch(client, /setInterval[^\n]*Heatmap|poll[^\n]*Heatmap/i);
});

test("13. usa endpoint existente sin dependencias ni áreas excluidas", () => {
  assert.match(client, /requestOccupancyRange\(range\)/);
  assert.doesNotMatch(packageJson, /recharts|chart\.js|d3/);
  assert.doesNotMatch(diffNames, /src\/app\/api\/dashboard\/ocupacion|supabase\/migrations|src\/app\/recuperacion|customer-window|n8n/i);
});


test("14. porcentaje pondera occupied y capacity sin promediar porcentajes", () => {
  const days = buildOccupancyPercentageHeatmap([
    row({ parking_fisico: "MC PARKING VESPUCIO", occupied: 1232, capacity: 2200 }),
    row({ parking_fisico: "OKP TOTAL", occupied: 1196, capacity: 1750 }),
  ], 2026, new Set(["MC PARKING VESPUCIO", "OKP TOTAL"]));
  const day = days.find((value) => value.date === "2026-08-31");
  assert.equal(day.occupied, 2428);
  assert.equal(day.capacity, 3950);
  assert.equal(day.percentage, (2428 / 3950) * 100);
  assert.notEqual(day.percentage, (56 + 68.34) / 2);
});

test("15. capacidad invalida excluye tambien occupied y conserva null cero y sobre 100", () => {
  const value = (rows) => buildOccupancyPercentageHeatmap(rows, 2026, new Set(["A", "B"])).find((day) => day.date === "2026-08-31");
  assert.equal(value([row({ parking_fisico: "A", occupied: 10, capacity: null })]).percentage, null);
  assert.equal(value([row({ parking_fisico: "A", occupied: 10, capacity: 0 })]).occupied, null);
  assert.equal(value([row({ parking_fisico: "A", occupied: 0, capacity: 100 })]).percentage, 0);
  assert.equal(value([row({ parking_fisico: "A", occupied: 120, capacity: 100 })]).percentage, 120);
  const mixed = value([row({ parking_fisico: "A", occupied: 10, capacity: null }), row({ parking_fisico: "B", occupied: 20, capacity: 100 })]);
  assert.equal(mixed.occupied, 20);
  assert.equal(mixed.percentage, 20);
});

test("16. porcentaje usa nueve rangos fijos con limites inclusivos", () => {
  assert.equal(getOccupancyHeatmapLevel(null), 0);
  for (const [value, level] of [[0, 1], [20, 1], [20.01, 2], [40, 2], [55, 3], [70, 4], [80, 5], [90, 6], [100, 7], [110, 8], [110.01, 9], [120, 9]]) {
    assert.equal(getOccupancyHeatmapLevel(value), level);
  }
});

test("17. selector limita porcentaje a Agregado y vuelve a Revenue", () => {
  assert.match(component, /useState<OccupancyHeatmapMetric>\("revenue"\)/);
  assert.match(component, /value === "occupancy" && mode === "commercial"/);
  assert.match(component, /mode === "commercial" && metric === "occupancy"\) setMetric\("revenue"\)/);
  assert.match(component, /Revenue de ocupaci/);
  assert.match(component, /% de ocupaci/);
  assert.match(component, /Ocupaci.*n agregada:/);
  assert.match(component, /Ocupados:/);
  assert.match(component, /Capacidad:/);
  assert.equal((component.match(/intensityClasses\.slice\(1\)/g) ?? []).length, 1);
  assert.match(component, /occupancyLegendLabels/);
  assert.match(component, /Escala de revenue por cuantiles/);
});
