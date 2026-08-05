import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const pagePath = "src/app/dashboard-operacional/page.tsx";
const orquestadorPagePath = "src/app/orquestador/page.tsx";
const clientPath = "src/app/dashboard-operacional/dashboard-operacional-client.tsx";
const formatterPath = "src/app/dashboard-operacional/dashboard-operacional-formatters.ts";
const dataHelperPath = "src/lib/dashboard/operacional.ts";
const endpointPath = "src/app/api/dashboard/operacional/route.ts";
const supabaseAdminPath = "src/lib/orquestador/supabase-admin.ts";
const dashboardViewPath = "src/app/orquestador/orchestrator-dashboard-view.tsx";
const tabsPath = "src/app/orquestador/orchestrator-view-tabs.tsx";
const compositeControlPath = "src/app/orquestador/actualizar-datos-operacionales-control.tsx";
const compositeHookPath = "src/app/orquestador/use-composite-operations-run.ts";
const compositeViewerPath = "src/app/orquestador/composite-run-viewer.tsx";

const page = readFileSync(pagePath, "utf8");
const orquestadorPage = readFileSync(orquestadorPagePath, "utf8");
const client = readFileSync(clientPath, "utf8");
const formatters = readFileSync(formatterPath, "utf8");
const dataHelper = readFileSync(dataHelperPath, "utf8");
const endpoint = readFileSync(endpointPath, "utf8");
const supabaseAdmin = readFileSync(supabaseAdminPath, "utf8");
const dashboardView = readFileSync(dashboardViewPath, "utf8");
const tabs = readFileSync(tabsPath, "utf8");
const compositeControl = readFileSync(compositeControlPath, "utf8");
const compositeHook = readFileSync(compositeHookPath, "utf8");
const compositeViewer = readFileSync(compositeViewerPath, "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
const uiSources = [page, client, formatters].join("\n");

test("A. ruta antigua Dashboard Operacional redirige a /orquestador", () => {
  assert.equal(existsSync(pagePath), true);
  assert.match(page, /redirect\("\/orquestador\?view=dashboard"\)/);
  assert.doesNotMatch(page, /DashboardOperacionalClient|requireAdminAccess|getOperationalDashboardRpcData/);
});

test("B. navegacion muestra Operaciones sin cambiar ruta", () => {
  const shell = readFileSync("src/components/dashboard/shell.tsx", "utf8");
  assert.match(shell, /href: "\/orquestador"/);
  assert.match(shell, /label: "Operaciones"/);
  assert.match(shell, /helper: "Dashboard y monitoreo"/);
  assert.doesNotMatch(shell, /label: "Orquestador"|helper: "Workers y jobs"/);
  assert.doesNotMatch(diffNames, /^src\/components\/dashboard\/mobile-navigation\.tsx$/m);
});

test("C. selector unificado contiene Dashboard y Centro de Control", () => {
  assert.match(tabs, /Dashboard/);
  assert.match(tabs, /Centro de Control/);
  assert.match(tabs, /\/orquestador\?view=\$\{view\}/);
  assert.match(orquestadorPage, /eyebrow="Operaciones McParking"/);
  assert.match(orquestadorPage, /title="McParking Dashboard"/);
  assert.match(orquestadorPage, /description="Monitoreo operacional y control de procesos\."/);
  assert.doesNotMatch(orquestadorPage, /McParking Orquestador|centro de control seguro del orquestador existente/);
  assert.doesNotMatch(client, /McParking Orquestador|Centro de Control|href="\/orquestador"/);
});

test("D. consume GET api dashboard operacional y filtra por date", () => {
  assert.match(client, /fetch\(`\/api\/dashboard\/operacional\$\{query\}`/);
  assert.match(client, /method: "GET"/);
  assert.match(client, /type="date"/);
  assert.match(client, /date=\$\{encodeURIComponent\(date\)\}/);
});

test("E. no consulta Supabase ni SQLite desde React", () => {
  assert.doesNotMatch(client, /createClient|SUPABASE_SERVICE_ROLE_KEY|\.rpc\(|sqlite|SQLite|\.from\(|schema\("ops_orchestrator"\)/);
});

test("F. vista server reutiliza helper server-only y normalizador", () => {
  assert.match(dashboardView, /getOperationalDashboardRpcData/);
  assert.match(dashboardView, /normalizeOperationalDashboardRpcResult/);
  assert.doesNotMatch(dashboardView, /createClient|\.from\(|schema\("ops_orchestrator"\)|sqlite|SQLite/);
});

test("G. comparativa MCP OKP y Market size", () => {
  assert.match(client, /SystemColumn label="OKP"/);
  assert.match(client, /SystemColumn label="MCP"/);
  assert.match(client, /Total \/ Market size/);
  assert.match(client, /marketShare\?\.venta_total_operacional/);
  assert.match(client, /marketShare\?\.reserva_total_dbi/);
  assert.match(client, /marketShare\?\.reserva_total_q/);
  assert.match(client, /<p className="mt-1 text-lg font-semibold text-navy">\{total\}<\/p>[\s\S]*aria-label=\{`\$\{label\} OKP vs MCP`\}[\s\S]*<p className="text-left">OKP \{formatPercent\(safeOkp\)\}<\/p>[\s\S]*<p className="text-right">MCP \{formatPercent\(safeMcp\)\}<\/p>/);
  assert.doesNotMatch(client, /OTRO existe en los totales por grupo/);
});


test("G1. barras Market size conectan colores con porcentajes correctos", () => {
  assert.match(client, /const safeMcp = Number\.isFinite\(mcp\) \? Math\.max\(0, Math\.min\(100, mcp\)\) : 0/);
  assert.match(client, /const safeOkp = Number\.isFinite\(okp\) \? Math\.max\(0, Math\.min\(100, okp\)\) : 0/);
  assert.match(client, /<div className="bg-sea" style=\{\{ width: `\$\{safeOkp\}%` \}\} \/>/);
  assert.match(client, /<div className="bg-clay" style=\{\{ width: `\$\{safeMcp\}%` \}\} \/>/);
  assert.doesNotMatch(client, /<div className="bg-sea" style=\{\{ width: `\$\{safeMcp\}%` \}\} \/>/);
  assert.doesNotMatch(client, /<div className="bg-clay" style=\{\{ width: `\$\{safeOkp\}%` \}\} \/>/);
  assert.doesNotMatch(client, /w-1\/4|w-3\/4|w-\[[0-9]+%\]/);
  for (const label of ["Venta total operacional", "DBI reservas total", "Q reservas total"]) {
    assert.match(client, new RegExp(`ShareBar label="${label}"`));
  }
});

test("G2. calculo visual de barras cubre proporciones y limites", () => {
  const safePercentForTest = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);
  assert.equal(safePercentForTest(28.63), 28.63);
  assert.equal(safePercentForTest(71.37), 71.37);
  assert.equal(safePercentForTest(28.63) + safePercentForTest(71.37), 100);
  assert.equal(safePercentForTest(0), 0);
  assert.equal(safePercentForTest(100), 100);
  assert.equal(safePercentForTest(-5), 0);
  assert.equal(safePercentForTest(125), 100);
  assert.equal(safePercentForTest(Number.NaN), 0);
  assert.equal(safePercentForTest(Number.POSITIVE_INFINITY), 0);
  assert.equal(safePercentForTest(0) + safePercentForTest(0), 0);
});

test("G3. porcentajes Market size quedan en una fila desde mobile", () => {
  assert.match(client, /<div className="mt-2 flex w-full items-center justify-between gap-2 text-xs text-slate-500">/);
  assert.match(client, /<p className="text-left">OKP \{formatPercent\(safeOkp\)\}<\/p>/);
  assert.match(client, /<p className="text-right">MCP \{formatPercent\(safeMcp\)\}<\/p>/);
  assert.doesNotMatch(client, /mt-2 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row/);
  assert.doesNotMatch(client, /sm:justify-between[\s\S]{0,140}OKP \{formatPercent\(safeOkp\)\}/);
  for (const label of ["Venta total operacional", "DBI reservas total", "Q reservas total"]) {
    assert.match(client, new RegExp(`ShareBar label="${label}"`));
  }
});
test("H. metricas principales solicitadas visibles", () => {
  for (const token of [
    "venta_total_operacional",
    "reserva_boleta_venta",
    "pack_vendido_venta",
    "reserva_total_dbi",
    "reserva_boleta_dbi",
    "reserva_pack_dbi",
    "reserva_total_q",
    "reserva_boleta_q",
    "reserva_pack_q",
    "advanced_book_days_total_avg",
    "duration_stay_total_avg",
    "precio_pagado_boleta_avg",
    "precio_lista_boleta_avg",
    "avg_order_value_boleta",
    "pack_vendido_precio_pagado_avg",
    "pack_vendido_precio_lista_avg",
  ]) {
    assert.match(client, new RegExp(token));
  }
});

test("I. resumen por estacionamiento usa tabla desktop compacta con ADR", () => {
  assert.match(client, /Resumen por estacionamiento/);
  assert.match(client, /estacionamientos para la fecha seleccionada/);
  assert.doesNotMatch(client, /Detalle operativo por parking|filas operacionales visibles/);
  assert.match(client, /function ParkingSummaryTable/);
  assert.match(client, /className="mt-5 hidden lg:block"/);
  for (const label of ["Estacionamiento", "Sistema", "Venta", "Reservas", "DBI", "ADR Pagado (CLP)", "ADR Lista (CLP)"]) {
    assert.equal(client.includes(label), true);
  }
  assert.equal(client.includes('"Acci\\u00f3n"'), true);
  assert.match(client, /title="Promedio por reserva pagado"/);
  assert.match(client, /title="Promedio por reserva segun tarifa lista"/);
  assert.match(client, /row\.parking_nombre/);
  assert.match(client, /row\.sistema_grupo/);
  assert.match(client, /formatCurrency\(row\.venta_total_operacional\)/);
  assert.match(client, /formatInteger\(row\.reserva_total_q\)/);
  assert.match(client, /formatInteger\(row\.reserva_total_dbi\)/);
  assert.match(client, /formatAdrCurrency\(row\.precio_pagado_boleta_avg, row\.duration_stay_boleta_avg\)/);
  assert.match(client, /formatAdrCurrency\(row\.precio_lista_boleta_avg, row\.duration_stay_boleta_avg\)/);
  const tableMatch = client.match(/function ParkingSummaryTable[\s\S]*?function ParkingSummaryCard/);
  assert.ok(tableMatch);
  assert.doesNotMatch(tableMatch[0], /Packs vendidos|pack_vendido_q/);
  assert.doesNotMatch(client, /min-w-\[1180px\]|overflow-x-auto/);
});
test("I1. drawer de detalle conserva los desgloses operativos", () => {
  assert.match(client, /function ParkingDetailDrawer/);
  assert.match(client, /function ParkingSummaryToggle/);
  assert.equal(client.includes('aria-label={`Ver detalle de ${parkingName}`}'), true);
  assert.match(client, /Ver detalle/);
  assert.doesNotMatch(client, /Ocultar detalle|aria-expanded={isExpanded}|aria-controls={detailId}/);
  assert.match(client, /role="dialog"/);
  assert.match(client, /aria-modal="true"/);
  assert.match(client, /Cerrar detalle operacional/);
  assert.match(client, /event.key === "Escape"/);
  assert.match(client, /document.body.style.overflow = "hidden"/);
  assert.match(client, /max-w-full/);
  assert.match(client, /md:max-w-3xl/);
  assert.match(client, /overflow-y-auto overflow-x-hidden/);
  for (const label of [
    "Ventas",
    "Venta Operacional",
    "Venta Boleta",
    "Venta Packs Vendidos",
    "Reservas",
    "Q Boleta",
    "Q Reservas Pack",
    "Q Total Reservas",
    "DBI",
    "DBI Boleta",
    "DBI Reservas Pack",
    "DBI Total Reservas",
    "Packs vendidos",
    "Q Packs Vendidos",
    "DBI Packs Vendidos",
    "Anticipacion",
    "Anticipacion Total",
    "Anticipacion Boleta",
    "Anticipacion Pack",
    "Estadia",
    "Estadia Total",
    "Estadia Boleta",
    "Estadia Pack",
    "ADR",
    "ADR Pagado",
    "ADR Lista",
    "Ticket",
    "Ticket Pagado",
    "Ticket Lista",
  ]) {
    assert.match(client, new RegExp(label));
  }
});
test("I2. fila TOTAL usa totales existentes y ADR ponderado del DTO", () => {
  assert.match(client, /type ParkingSummaryTotals = Pick<[\s\S]*OperationalDashboardTotals/);
  assert.match(client, /"precio_pagado_boleta_avg"/);
  assert.match(client, /"precio_lista_boleta_avg"/);
  assert.match(client, /"duration_stay_boleta_avg"/);
  assert.doesNotMatch(client, /function calculateParkingSummaryTotals/);
  assert.match(client, /const parkingSummaryTotals = dashboard\?\.totals \?\? emptyTotals/);
  assert.match(client, /<td className="border-t border-\[#cbd8e3\] px-2\.5 py-3">TOTAL<\/td>/);
  assert.match(client, /formatCurrency\(totals\.venta_total_operacional\)/);
  assert.match(client, /formatInteger\(totals\.reserva_total_q\)/);
  assert.match(client, /formatInteger\(totals\.reserva_total_dbi\)/);
  assert.match(client, /formatAdrCurrency\(totals\.precio_pagado_boleta_avg, totals\.duration_stay_boleta_avg\)/);
  assert.match(client, /formatAdrCurrency\(totals\.precio_lista_boleta_avg, totals\.duration_stay_boleta_avg\)/);
  assert.match(client, /<ParkingTotalsCard totals=\{totals\} \/>/);
  assert.doesNotMatch(client, /TOTAL[\s\S]{0,240}<ParkingSummaryToggle/);
});
test("I3. mobile usa tarjetas y conserva orden del dashboard", () => {
  assert.match(client, /function ParkingSummaryCards/);
  assert.match(client, /function ParkingSummaryCard/);
  assert.match(client, /className="mt-5 grid gap-3 lg:hidden"/);
  assert.match(client, /<ParkingTotalsCard totals=\{totals\} \/>/);
  for (const label of ["Venta", "Reservas", "DBI", "ADR Pagado", "ADR Lista"]) {
    assert.match(client, new RegExp(label));
  }
  assert.match(client, /<div className="order-1 xl:order-2">\s*<MarketColumn dashboard=\{dashboard\} \/>\s*<\/div>/);
  assert.match(client, /<div className="order-2 xl:order-1">\s*<SystemColumn label="OKP" totals=\{groupTotals\(dashboard, "OKP"\)\} \/>\s*<\/div>/);
  assert.match(client, /<div className="order-3 xl:order-3">\s*<SystemColumn label="MCP" totals=\{groupTotals\(dashboard, "MCP"\)\} \/>\s*<\/div>/);
});

test("J. no recalcula metricas base en UI", () => {
  assert.doesNotMatch(client, /calculateOperationalDashboardTotals|calculateTotalsByGroup|calculateMarketShare/);
  assert.match(client, /dashboard\?\.totals/);
  assert.match(client, /dashboard\?\.totalsByGroup/);
});

test("K. maneja estados loading empty error y rows vacias", () => {
  assert.match(client, /isLoading/);
  assert.match(client, /LoadingOverlay/);
  assert.match(client, /initialError/);
  assert.match(client, /No hay una corrida operacional disponible/);
  assert.match(client, /No hay estacionamientos para la fecha seleccionada/);
});

test("L. Dashboard reutiliza el control compuesto existente", () => {
  assert.match(client, /ActualizarDatosOperacionalesControl/);
  assert.match(client, /onSucceeded=\{\(\) => loadByDate\(selectedDate\)\}/);
  assert.match(compositeControl, /useCompositeOperationsRun/);
  assert.match(compositeControl, /CompositeRunViewer/);
  assert.doesNotMatch(client, /Conexion operativa en siguiente etapa/);
  assert.doesNotMatch(client, /className="h-10 rounded-lg border border-\[#d6e1ea\] bg-\[#f8fbfd\][\s\S]*Actualizar datos operacionales/);
  assert.doesNotMatch(client, /orchestrator_create_job|createCompositeJobStep|\/api\/orquestador\/operaciones|method: "POST"/);
});

test("M. formateadores locales evitan NaN Infinity undefined", () => {
  assert.match(formatters, /Number\.isFinite/);
  assert.match(formatters, /No disponible/);
  assert.doesNotMatch(uiSources, />\s*(NaN|Infinity|undefined)\s*</);
});

test("N. no muestra metadata ni ids internos sensibles", () => {
  assert.doesNotMatch(client, /metadata|source_run_id|composite_run_id|reservas_job_id|packs_job_id|dashboard_job_id|payload|error_message/);
});

test("O. endpoint y capa datos siguen siendo fuente unica", () => {
  assert.match(endpoint, /normalizeOperationalDashboardRpcResult/);
  assert.match(supabaseAdmin, /orchestrator_dashboard_get_operacional/);
  assert.match(dataHelper, /calculateOperationalDashboardTotals/);
  assert.match(dataHelper, /calculateMarketShare/);
});

test("P. no toca recuperacion ni endpoints POST", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/api\/recuperacion|^scripts\/recovery/m);
  assert.doesNotMatch(uiSources, /export async function POST|method: "POST"|orchestrator_create_job/);
});
test("Q. mapeo visual ADR ticket y packs usa campos correctos", () => {
  assert.match(formatters, /formatAdrCurrency\(priceAverage: number \| null \| undefined, stayAverage: number \| null \| undefined\)/);
  assert.match(formatters, /stayAverage <= 0/);
  assert.match(formatters, /formatCurrency\(priceAverage \/ stayAverage\)/);
  assert.match(client, /ADR pagado" layout=\{layout\} value=\{formatAdrCurrency\(totals\.precio_pagado_boleta_avg, totals\.duration_stay_boleta_avg\)\}/);
  assert.match(client, /ADR lista" layout=\{layout\} value=\{formatAdrCurrency\(totals\.precio_lista_boleta_avg, totals\.duration_stay_boleta_avg\)\}/);
  assert.match(client, /Ticket pagado" layout=\{layout\} value=\{formatCurrency\(totals\.precio_pagado_boleta_avg\)\}/);
  assert.match(client, /Ticket lista" layout=\{layout\} value=\{formatCurrency\(totals\.precio_lista_boleta_avg\)\}/);
  assert.match(client, /Pack pagado prom\." layout=\{layout\} value=\{formatCurrency\(totals\.pack_vendido_precio_pagado_avg\)\}/);
  assert.match(client, /Pack lista prom\." layout=\{layout\} value=\{formatCurrency\(totals\.pack_vendido_precio_lista_avg\)\}/);
  assert.doesNotMatch(client, /ADR pagado" value=\{formatCurrency\(totals\.precio_pagado_boleta_avg\)\}/);
  assert.doesNotMatch(client, /Ticket lista" value="No disponible"/);
});


test("Q1. columnas OKP MCP agrupan venta DBI y reservas", () => {
  assert.match(client, /function GroupedMetricBlock/);
  assert.match(client, /function SecondaryMetricCard/);
  assert.match(client, /title="Venta total"/);
  assert.match(client, /leftLabel="Venta boleta"/);
  assert.match(client, /rightLabel="Venta pack"/);
  assert.match(client, /mainValue=\{formatCurrency\(totals\.venta_total_operacional\)\}/);
  assert.match(client, /leftValue=\{formatCurrency\(totals\.reserva_boleta_venta\)\}/);
  assert.match(client, /rightValue=\{formatCurrency\(totals\.pack_vendido_venta\)\}/);
  assert.match(client, /title="DBI total reservas"/);
  assert.match(client, /leftLabel="DBI boleta"/);
  assert.match(client, /rightLabel="DBI pack"/);
  assert.match(client, /mainValue=\{formatInteger\(totals\.reserva_total_dbi\)\}/);
  assert.match(client, /leftValue=\{formatInteger\(totals\.reserva_boleta_dbi\)\}/);
  assert.match(client, /rightValue=\{formatInteger\(totals\.reserva_pack_dbi\)\}/);
  assert.match(client, /title="Q reservas total"/);
  assert.match(client, /leftLabel="Q boleta"/);
  assert.match(client, /rightLabel="Q pack"/);
  assert.match(client, /mainValue=\{formatInteger\(totals\.reserva_total_q\)\}/);
  assert.match(client, /leftValue=\{formatInteger\(totals\.reserva_boleta_q\)\}/);
  assert.match(client, /rightValue=\{formatInteger\(totals\.reserva_pack_q\)\}/);
});

test("Q2. columnas usan orden movil y escritorio sin duplicar contenido", () => {
  assert.match(client, /<div className="order-2 xl:order-1">\s*<SystemColumn label="OKP" totals=\{groupTotals\(dashboard, "OKP"\)\} \/>\s*<\/div>/);
  assert.match(client, /<div className="order-1 xl:order-2">\s*<MarketColumn dashboard=\{dashboard\} \/>\s*<\/div>/);
  assert.match(client, /<div className="order-3 xl:order-3">\s*<SystemColumn label="MCP" totals=\{groupTotals\(dashboard, "MCP"\)\} \/>\s*<\/div>/);
  assert.equal([...client.matchAll(/<SystemColumn label="OKP"/g)].length, 1);
  assert.equal([...client.matchAll(/<MarketColumn dashboard=\{dashboard\}/g)].length, 1);
  assert.equal([...client.matchAll(/<SystemColumn label="MCP"/g)].length, 1);
  assert.match(client, /Total \/ Market size/);
  assert.match(client, /ShareBar label="Venta total operacional"/);
  assert.match(client, /ShareBar label="DBI reservas total"/);
  assert.match(client, /ShareBar label="Q reservas total"/);
});

test("Q3. bloques mantienen estetica sobria sin colores fuertes por sistema", () => {
  const groupedBlockMatch = client.match(/function GroupedMetricBlock[\s\S]*?function AverageBlock/);
  assert.ok(groupedBlockMatch);
  const groupedBlock = groupedBlockMatch[0];
  assert.match(groupedBlock, /border-\[#e4edf4\]/);
  assert.match(client, /bg-\[#f8fbfd\]/);
  assert.match(groupedBlock, /text-navy/);
  assert.doesNotMatch(groupedBlock, /border-l|bg-green|text-green|border-green|bg-blue|text-blue|border-blue|gradient|shadow-lg|shadow-xl/);
  assert.doesNotMatch(client, /OKP[\s\S]{0,120}(green|emerald|blue|border-l)|MCP[\s\S]{0,120}(green|emerald|blue|border-l)/i);
});

test("Q4. MCP usa composicion visual espejo sin invertir datos", () => {
  assert.match(client, /type MetricLayout = "normal" \| "mirror"/);
  assert.match(client, /const layout: MetricLayout = label === "MCP" \? "mirror" : "normal"/);
  assert.match(client, /layout === "mirror" \? "flex-row-reverse"/);
  assert.match(client, /const secondaryAlignment: TextAlignment = layout === "mirror" \? "left" : "right"/);
  assert.match(client, /<SecondaryMetricCard alignment=\{secondaryAlignment\} label=\{rightLabel\} value=\{rightValue\} \/>/);
  assert.match(client, /<SecondaryMetricCard alignment=\{secondaryAlignment\} label=\{leftLabel\} value=\{leftValue\} \/>/);
  assert.match(client, /leftLabel="Venta boleta"[\s\S]*leftValue=\{formatCurrency\(totals\.reserva_boleta_venta\)\}[\s\S]*rightLabel="Venta pack"[\s\S]*rightValue=\{formatCurrency\(totals\.pack_vendido_venta\)\}/);
  assert.match(client, /leftLabel="DBI boleta"[\s\S]*leftValue=\{formatInteger\(totals\.reserva_boleta_dbi\)\}[\s\S]*rightLabel="DBI pack"[\s\S]*rightValue=\{formatInteger\(totals\.reserva_pack_dbi\)\}/);
  assert.match(client, /leftLabel="Q boleta"[\s\S]*leftValue=\{formatInteger\(totals\.reserva_boleta_q\)\}[\s\S]*rightLabel="Q pack"[\s\S]*rightValue=\{formatInteger\(totals\.reserva_pack_q\)\}/);
  assert.match(client, /function SecondaryMetricCard\(\{ alignment = "left", label, value \}/);
  assert.match(client, /const textAlignment = alignment === "right" \? "text-right" : "text-left"/);
  assert.match(client, /<p className=\{`text-xs font-semibold uppercase tracking-\[0\.08em\] text-slate-500 \$\{textAlignment\}`\}>\{label\}<\/p>[\s\S]*<p className=\{`mt-1 text-sm font-semibold text-navy \$\{textAlignment\}`\}>\{value\}<\/p>/);
});

test("Q5. promedios miran hacia la columna central y filas finales siguen en espejo", () => {
  assert.match(client, /type TextAlignment = "left" \| "right"/);
  assert.match(client, /function AverageBlock\(\{ alignment = "left", label/);
  assert.match(client, /const textAlignment = alignment === "right" \? "text-right" : "text-left"/);
  assert.match(client, /const averageAlignment: TextAlignment = label === "OKP" \? "right" : "left"/);
  assert.match(client, /<p className=\{`text-xs font-semibold uppercase tracking-\[0\.08em\] text-slate-500 \$\{textAlignment\}`\}>\{label\}<\/p>[\s\S]*<p className=\{`mt-1 text-lg font-semibold text-navy \$\{textAlignment\}`\}>\{formatDays\(main\)\}<\/p>[\s\S]*<span>\{ticketLabel\}: \{formatDays\(ticket\)\}<\/span>[\s\S]*<span>Pack: \{formatDays\(pack\)\}<\/span>/);
  assert.match(client, /<AverageBlock alignment=\{averageAlignment\} label="Anticipacion promedio" main=\{totals\.advanced_book_days_total_avg\} pack=\{totals\.advanced_book_days_pack_avg\} ticket=\{totals\.advanced_book_days_boleta_avg\} \/>/);
  assert.match(client, /<AverageBlock alignment=\{averageAlignment\} label="Estadia promedio" main=\{totals\.duration_stay_total_avg\} pack=\{totals\.duration_stay_pack_avg\} ticket=\{totals\.duration_stay_boleta_avg\} \/>/);
  assert.doesNotMatch(client, /<AverageBlock[^>]*layout=\{layout\}/);
  assert.match(client, /function KpiLine\(\{ label, layout = "normal", value \}/);
  assert.match(client, /<KpiLine label="ADR pagado" layout=\{layout\}/);
  assert.match(client, /<KpiLine label="Pack lista prom\." layout=\{layout\}/);
});

test("Q6. mobile OKP y MCP usan estructura comun sin espejo", () => {
  assert.match(client, /function SystemColumnMobile\(\{ label, totals \}/);
  assert.match(client, /<div className="xl:hidden">/);
  assert.match(client, /function SystemColumnDesktop\(\{ label, totals \}/);
  assert.match(client, /<div className="hidden xl:block">/);
  assert.match(client, /<SystemColumnMobile label=\{label\} totals=\{totals\} \/>\s*<SystemColumnDesktop label=\{label\} totals=\{totals\} \/>/);

  const mobileMatch = client.match(/function SystemColumnMobile[\s\S]*?function SystemColumnDesktop/);
  assert.ok(mobileMatch);
  const mobile = mobileMatch[0];
  assert.match(mobile, /<div className="flex items-center justify-between gap-3">\s*<h2 className="text-lg font-semibold text-navy">\{label\}<\/h2>[\s\S]*>Sistema<\/span>/);
  assert.doesNotMatch(mobile, /flex-row-reverse|layout=\{layout\}|AverageBlock|KpiLine/);
  assert.match(mobile, /<MobileGroupedMetricBlock[\s\S]*leftLabel="Venta boleta"[\s\S]*rightLabel="Venta pack"/);
  assert.match(mobile, /<MobileGroupedMetricBlock[\s\S]*leftLabel="DBI boleta"[\s\S]*rightLabel="DBI pack"/);
  assert.match(mobile, /<MobileGroupedMetricBlock[\s\S]*leftLabel="Q boleta"[\s\S]*rightLabel="Q pack"/);
  assert.match(mobile, /<CompactMetricLine label="Anticipacion promedio" value=\{formatDays\(totals\.advanced_book_days_total_avg\)\} \/>/);
  assert.match(mobile, /<CompactMetricLine label="Estadia promedio" value=\{formatDays\(totals\.duration_stay_total_avg\)\} \/>/);
  assert.doesNotMatch(mobile, /advanced_book_days_boleta_avg|advanced_book_days_pack_avg|duration_stay_boleta_avg\} \/>|duration_stay_pack_avg\} \/>/);
});

test("Q7. mobile mantiene dos tarjetas por fila y filas compactas", () => {
  assert.match(client, /function MobileGroupedMetricBlock/);
  assert.match(client, /<div className="mt-3 grid grid-cols-2 gap-2">\s*<SecondaryMetricCard label=\{leftLabel\} value=\{leftValue\} \/>\s*<SecondaryMetricCard label=\{rightLabel\} value=\{rightValue\} \/>\s*<\/div>/);
  assert.doesNotMatch(client, /MobileGroupedMetricBlock[\s\S]*grid-cols-1/);
  assert.match(client, /function CompactMetricLine/);
  assert.match(client, /<dt className="text-xs font-medium uppercase tracking-\[0\.08em\] text-slate-500">\{label\}<\/dt>\s*<dd className="text-right text-sm font-semibold text-navy">\{value\}<\/dd>/);
  for (const label of ["ADR pagado", "ADR lista", "Ticket pagado", "Ticket lista", "Pack pagado prom.", "Pack lista prom."]) {
    assert.match(client, new RegExp(`<CompactMetricLine label="${label.replace(".", "\\.")}"`));
  }
});

test("Q8. desktop conserva espejo MCP y desgloses de promedios", () => {
  const desktopMatch = client.match(/function SystemColumnDesktop[\s\S]*?function SystemColumn\(/);
  assert.ok(desktopMatch);
  const desktop = desktopMatch[0];
  assert.match(desktop, /const layout: MetricLayout = label === "MCP" \? "mirror" : "normal"/);
  assert.match(desktop, /className=\{`flex items-center justify-between gap-3 \$\{layout === "mirror" \? "flex-row-reverse" : ""\}`\}/);
  assert.match(desktop, /<GroupedMetricBlock[\s\S]*layout=\{layout\}/);
  assert.match(desktop, /<AverageBlock alignment=\{averageAlignment\} label="Anticipacion promedio" main=\{totals\.advanced_book_days_total_avg\} pack=\{totals\.advanced_book_days_pack_avg\} ticket=\{totals\.advanced_book_days_boleta_avg\} \/>/);
  assert.match(desktop, /<AverageBlock alignment=\{averageAlignment\} label="Estadia promedio" main=\{totals\.duration_stay_total_avg\} pack=\{totals\.duration_stay_pack_avg\} ticket=\{totals\.duration_stay_boleta_avg\} \/>/);
  assert.match(desktop, /<KpiLine label="ADR pagado" layout=\{layout\}/);
  assert.match(client, /<div className="order-1 xl:order-2">\s*<MarketColumn dashboard=\{dashboard\} \/>\s*<\/div>/);
});
test("R. formula ADR usa valores crudos antes de formatear", () => {
  const formatAdrForTest = (priceAverage, stayAverage) => {
    if (typeof priceAverage !== "number" || !Number.isFinite(priceAverage)) return "No disponible";
    if (typeof stayAverage !== "number" || !Number.isFinite(stayAverage) || stayAverage <= 0) return "No disponible";
    return Math.round(priceAverage / stayAverage);
  };

  assert.equal(formatAdrForTest(22842.49, 4.525), 5048);
  assert.equal(formatAdrForTest(33737.2, 4.526), 7454);
  assert.equal(formatAdrForTest(22317.25, 4.617), 4834);
  assert.equal(formatAdrForTest(29776.4, 4.619), 6447);
  assert.equal(formatAdrForTest(22842.49, 0), "No disponible");
  assert.equal(formatAdrForTest(null, 4.5), "No disponible");
  assert.equal(formatAdrForTest(22842.49, null), "No disponible");
  assert.equal(formatAdrForTest(Number.NaN, 4.5), "No disponible");
  assert.equal(formatAdrForTest(22842.49, Number.POSITIVE_INFINITY), "No disponible");
  assert.equal(formatAdrForTest(101.6, 4.1), 25);
});
test("S. anticipacion y estadia muestran unidad dias", () => {
  assert.match(formatters, /export function formatDays\(value: number \| null \| undefined\)/);
  assert.match(formatters, /value === 1 \?/);
  assert.match(formatters, /"d.as"/);
  assert.match(client, /\{formatDays\(main\)\}/);
  assert.match(client, /\{ticketLabel\}: \{formatDays\(ticket\)\}/);
  assert.match(client, /Pack: \{formatDays\(pack\)\}/);
  assert.match(client, /<AverageBlock alignment=\{averageAlignment\} label="Anticipacion promedio" main=\{totals\.advanced_book_days_total_avg\} pack=\{totals\.advanced_book_days_pack_avg\} ticket=\{totals\.advanced_book_days_boleta_avg\} \/>/);
  assert.match(client, /<AverageBlock alignment=\{averageAlignment\} label="Estadia promedio" main=\{totals\.duration_stay_total_avg\} pack=\{totals\.duration_stay_pack_avg\} ticket=\{totals\.duration_stay_boleta_avg\} \/>/);
  assert.match(client, /<SystemColumn label="OKP"/);
  assert.match(client, /<SystemColumn label="MCP"/);
  assert.doesNotMatch(client, /formatDays\(totals\.precio|formatDays\(totals\.venta|formatDays\(totals\.reserva|formatDays\(totals\.pack_vendido/);
  assert.doesNotMatch(client + formatters, /No disponible dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­as/);
});

test("T. formatDays singular plural y valores invalidos", () => {
  const decimalFormatterForTest = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  const formatDaysForTest = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "No disponible";

    return `${decimalFormatterForTest.format(value)} ${value === 1 ? "día" : "días"}`;
  };

  assert.equal(formatDaysForTest(1), "1 día");
  assert.equal(formatDaysForTest(2.3), "2,3 días");
  assert.equal(formatDaysForTest(0), "0 días");
  assert.equal(formatDaysForTest(0.5), "0,5 días");
  assert.equal(formatDaysForTest(null), "No disponible");
  assert.equal(formatDaysForTest(undefined), "No disponible");
  assert.equal(formatDaysForTest(Number.NaN), "No disponible");
  assert.equal(formatDaysForTest(Number.POSITIVE_INFINITY), "No disponible");
  assert.notEqual(formatDaysForTest(null), "No disponible días");
});test("U. control exige confirmacion y bloquea doble creacion", () => {
  assert.match(compositeControl, /setIsConfirming\(true\)/);
  assert.match(compositeControl, /Confirmacion requerida/);
  assert.match(compositeControl, /Confirmar ejecucion/);
  assert.match(compositeControl, /Cancelar/);
  assert.match(compositeControl, /const canStart = !isStarting && !run/);
  assert.match(compositeControl, /disabled=\{!canStart\}/);
  assert.match(compositeHook, /JSON\.stringify\(\{ confirm: true \}\)/);
  assert.match(compositeHook, /fetch\("\/api\/orquestador\/operaciones\/actualizar-datos"/);
});

test("V. progreso y enlace al Centro de Control se reutilizan desde Dashboard", () => {
  assert.match(client, /controlHref="\/orquestador\?view=control"/);
  assert.match(compositeControl, /Ver en Centro de Control/);
  assert.match(compositeControl, /href=\{controlHref\}/);
  assert.match(compositeControl, /run \? <CompositeRunViewer/);
  assert.match(compositeViewer, /export function CompositeRunViewer/);
});

test("W. refresh automatico ocurre una sola vez por run succeeded", () => {
  assert.match(compositeControl, /completedRunRef/);
  assert.match(compositeControl, /refreshingRunRef/);
  assert.match(compositeControl, /if \(!run \|\| run\.status !== "succeeded"\)/);
  assert.match(compositeControl, /completedRunRef\.current === run\.run_id \|\| refreshingRunRef\.current === run\.run_id/);
  assert.match(compositeControl, /refreshingRunRef\.current = run\.run_id/);
  assert.match(compositeControl, /Promise\.resolve\(onSucceededRef\.current\?\.\(\)\)/);
  assert.match(compositeControl, /completedRunRef\.current = run\.run_id/);
  assert.match(compositeControl, /refreshingRunRef\.current = null/);
  assert.match(client, /onSucceeded=\{\(\) => loadByDate\(selectedDate\)\}/);
  assert.match(client, /cache: "no-store"/);
  assert.doesNotMatch(compositeControl, /run\?\.status === "failed"[\s\S]*onSucceeded|run\?\.status === "cancelled"[\s\S]*onSucceeded/);
});

test("X. no duplica rutas ni contratos del composite run en Dashboard", () => {
  assert.doesNotMatch(client, /\/api\/orquestador\/operaciones\/actualizar-datos|\/advance|method: "POST"|startRun\(/);
  assert.match(compositeHook, /\/api\/orquestador\/operaciones\/actualizar-datos\/\$\{runId\}/);
  assert.match(compositeHook, /\/api\/orquestador\/operaciones\/actualizar-datos\/advance/);
  assert.match(compositeHook, /orquestador:actualizar-datos:last-month:run-id:v1/);
});
test("Y. fecha inicial usa hoy local sin toISOString", () => {
  assert.match(client, /function getTodayLocalDate\(\)/);
  assert.match(client, /today\.getFullYear\(\)/);
  assert.match(client, /today\.getMonth\(\) \+ 1/);
  assert.match(client, /today\.getDate\(\)/);
  assert.match(client, /padStart\(2, "0"\)/);
  assert.match(client, /return `\$\{year\}-\$\{month\}-\$\{day\}`/);
  assert.match(client, /initialDateRef = useRef\(getTodayLocalDate\(\)\)/);
  assert.match(client, /useState\(initialDateRef\.current\)/);
  assert.match(client, /loadByDate\(initialDateRef\.current\)/);
  assert.doesNotMatch(client, /toISOString\(\)\.slice\(0, 10\)/);
});

test("Z. fecha seleccionada sigue siendo mutable y se usa en refresh final", () => {
  assert.match(client, /onChange=\{\(event\) => loadByDate\(event\.target\.value\)\}/);
  assert.match(client, /onSucceeded=\{\(\) => loadByDate\(selectedDate\)\}/);
  assert.doesNotMatch(client, /initialDashboard\?\.filters\?\.date \?\?/);
});

test("Z1. no existe boton visual Refrescar y el cambio de fecha solo consulta GET", () => {
  assert.doesNotMatch(client, /RefreshCw|Refrescar dashboard operacional|>\s*Refrescar\s*</);
  assert.match(client, /onChange=\{\(event\) => loadByDate\(event\.target\.value\)\}/);
  assert.match(client, /fetch\(`\/api\/dashboard\/operacional\$\{query\}`/);
  assert.match(client, /method: "GET"/);
  assert.doesNotMatch(client, /method: "POST"|startRun\(|\/api\/orquestador\/operaciones\/actualizar-datos/);
});

test("Z2. cambio de fecha evita doble GET y respuestas antiguas", () => {
  const dateChangeCalls = client.match(/loadByDate\(event\.target\.value\)/g) ?? [];
  assert.equal(dateChangeCalls.length, 1);
  assert.match(client, /activeRequestRef = useRef\(0\)/);
  assert.match(client, /requestId !== activeRequestRef\.current/);
  assert.doesNotMatch(client, /void loadByDate\(selectedDate\)/);
});

test("Z3. seccion intermedia no aparece en Dashboard y el control queda en cabecera", () => {
  const headerStart = client.indexOf("Dashboard operacional");
  const controlStart = client.indexOf("<ActualizarDatosOperacionalesControl");
  const firstSectionEnd = client.indexOf("</section>", headerStart);
  assert.ok(headerStart >= 0);
  assert.ok(controlStart > headerStart);
  assert.ok(controlStart < firstSectionEnd);
  assert.match(client, /presentation="overlay"/);
  assert.doesNotMatch(client, /Ejecucion real[\s\S]*Actualizar Reservas ultimo mes[\s\S]*Actualizar Banco de Packs[\s\S]*Actualizar metricas Dashboard ultimo mes/);
});

test("Z3b. cabecera movil conserva solo titulo fecha y accion principal", () => {
  assert.match(client, /<p className="text-xs font-semibold uppercase tracking-\[0\.14em\] text-sea">Dashboard operacional<\/p>/);
  assert.match(client, /<div className="hidden lg:block">\s*<h2 className="mt-2 text-xl font-semibold text-navy">Comparativa operacional MCP vs OKP<\/h2>\s*<LastUpdateSummary dashboard=\{dashboard\} \/>\s*<\/div>/);
  assert.match(client, /Filtro Fecha/);
  assert.match(client, /<ActualizarDatosOperacionalesControl/);
  assert.match(client, /presentation="overlay"/);
  assert.match(client, /function LastUpdateSummary/);
  assert.match(client, /Ultima actualizacion: \{updateDate\}/);
  assert.match(client, /Estado: \{updateStatusLabel\(lastUpdate\.estado\)\}/);
  assert.match(client, /Datos disponibles: \{formatDate\(lastUpdate\.periodo_desde\)\} al \{formatDate\(lastUpdate\.periodo_hasta\)\}/);
  const desktopOnlyHeader = client.match(/<div className="hidden lg:block">[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.doesNotMatch(desktopOnlyHeader, /Filtro Fecha|ActualizarDatosOperacionalesControl/);
});

test("Z4. ultima actualizacion usa textos operativos", () => {
  assert.match(client, /function updateStatusLabel/);
  assert.match(client, /succeeded"\) return "Actualizado correctamente"/);
  assert.match(client, /failed"\) return "Actualizacion con error"/);
  assert.match(client, /cancelled"\) return "Actualizacion cancelada"/);
  assert.match(client, /running"\) return "Actualizacion en curso"/);
  assert.match(client, /waiting" \|\| status === "queued" \|\| status === "claimed"\) return "Actualizacion pendiente"/);
  assert.match(client, /Estado no disponible/);
  assert.match(client, /Sin actualizaciones registradas/);
  assert.match(client, /Datos disponibles:/);
  assert.doesNotMatch(client, /Ultima corrida|Sin corrida registrada|\$\{dashboard\.lastUpdate\.estado\}/);
});

test("AA. overlay usa dialog accesible y se recupera cuando existe run", () => {
  assert.match(compositeControl, /presentation\?: "inline" \| "overlay"/);
  assert.match(compositeControl, /presentation = "inline"/);
  assert.match(compositeControl, /const useOverlay = presentation === "overlay"/);
  assert.match(compositeControl, /const showOverlay = useOverlay && \(isConfirming \|\| isStarting \|\| hasRun \|\| isOverlayOpen\)/);
  assert.match(compositeControl, /aria-labelledby="actualizar-datos-overlay-title"/);
  assert.match(compositeControl, /aria-modal="true"/);
  assert.match(compositeControl, /role="dialog"/);
  assert.match(compositeControl, /aria-describedby="actualizar-datos-overlay-description"/);
  assert.match(compositeControl, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(compositeControl, /overflow-x-hidden/);
  assert.match(compositeControl, /overflow-y-auto/);
  assert.match(compositeControl, /min-w-0/);
  assert.match(compositeControl, /fixed inset-0 z-50/);
});

test("AB. overlay muestra carga real y reutiliza CompositeRunViewer", () => {
  assert.match(compositeControl, /Actualizando datos operacionales/);
  assert.match(compositeControl, /Manten esta ventana abierta/);
  assert.match(compositeControl, /Loader2/);
  assert.match(compositeControl, /animate-spin/);
  assert.match(compositeControl, /const viewer = run \? <CompositeRunViewer/);
  assert.match(compositeControl, /compact=\{useOverlay\}/);
  assert.doesNotMatch(compositeControl, /barra falsa|fake|setInterval/);
});

test("AC. overlay distingue succeeded failed cancelled y refresh posterior", () => {
  assert.match(compositeControl, /Actualizacion de procesos completada/);
  assert.match(compositeControl, /Actualizando indicadores del Dashboard/);
  assert.match(compositeControl, /Actualizacion completada correctamente/);
  assert.match(compositeControl, /Todos los procesos finalizaron con exito/);
  assert.match(compositeControl, /Puedes cerrar esta ventana con tranquilidad/);
  assert.match(compositeControl, /no fue posible actualizar los indicadores visibles/);
  assert.match(compositeControl, /vuelve a seleccionar la fecha/);
  assert.doesNotMatch(compositeControl, /usar Refrescar/);
  assert.match(compositeControl, /No se pudo completar la actualizacion/);
  assert.match(compositeControl, /Etapa afectada/);
  assert.match(compositeControl, /Actualizacion cancelada/);
  assert.match(compositeControl, /run\.status === "failed"/);
  assert.match(compositeControl, /run\.status === "succeeded"/);
  assert.match(compositeControl, /role="status"/);
  assert.match(compositeControl, /aria-live="polite"/);
  assert.doesNotMatch(compositeControl, /payload|stack trace|stdout|stderr|SUPABASE|confeti|corneta|ilustracion/i);
});

test("AD. cierre del overlay espera el refresh despues de succeeded", () => {
  assert.match(compositeControl, /const isRefreshingAfterSuccess = run\?\.status === "succeeded" && \(refreshStatus === "idle" \|\| refreshStatus === "refreshing"\)/);
  assert.match(compositeControl, /const canCloseOverlay = Boolean\(run && isTerminalRun\(run\) && !isRefreshingAfterSuccess\)/);
  assert.match(compositeControl, /disabled=\{!canCloseOverlay\}/);
  assert.match(compositeControl, /if \(!canCloseOverlay\) \{/);
  assert.match(compositeControl, /Cerrar resultado/);
  assert.match(compositeControl, /Cerrar/);
});
