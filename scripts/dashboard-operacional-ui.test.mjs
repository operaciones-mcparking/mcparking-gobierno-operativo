import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const pagePath = "src/app/dashboard-operacional/page.tsx";
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

test("B. no modifica navegacion global", () => {
  assert.doesNotMatch(diffNames, /^src\/components\/dashboard\/shell\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/components\/dashboard\/mobile-navigation\.tsx$/m);
});

test("C. selector unificado contiene Dashboard y Centro de Control", () => {
  assert.match(tabs, /Dashboard/);
  assert.match(tabs, /Centro de Control/);
  assert.match(tabs, /\/orquestador\?view=\$\{view\}/);
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

test("I. detalle por parking contiene columnas solicitadas", () => {
  for (const label of [
    "Fecha",
    "Parking",
    "Sistema",
    "Venta operacional",
    "Venta boleta",
    "Venta packs vendidos",
    "Q boleta",
    "Q reservas pack",
    "Q total reservas",
    "DBI boleta",
    "DBI reservas pack",
    "DBI total reservas",
    "Q packs vendidos",
    "DBI packs vendidos",
  ]) {
    assert.match(client, new RegExp(label));
  }
});

test("J. no recalcula metricas base en UI", () => {
  assert.doesNotMatch(client, /reduce\(|calculateOperationalDashboardTotals|calculateTotalsByGroup|calculateMarketShare/);
  assert.match(client, /dashboard\?\.totals/);
  assert.match(client, /dashboard\?\.totalsByGroup/);
});

test("K. maneja estados loading empty error y rows vacias", () => {
  assert.match(client, /isLoading/);
  assert.match(client, /LoadingOverlay/);
  assert.match(client, /initialError/);
  assert.match(client, /No hay una corrida operacional disponible/);
  assert.match(client, /No hay filas para el filtro seleccionado/);
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
  assert.match(client, /ADR pagado" value=\{formatAdrCurrency\(totals\.precio_pagado_boleta_avg, totals\.duration_stay_boleta_avg\)\}/);
  assert.match(client, /ADR lista" value=\{formatAdrCurrency\(totals\.precio_lista_boleta_avg, totals\.duration_stay_boleta_avg\)\}/);
  assert.match(client, /Ticket pagado" value=\{formatCurrency\(totals\.precio_pagado_boleta_avg\)\}/);
  assert.match(client, /Ticket lista" value=\{formatCurrency\(totals\.precio_lista_boleta_avg\)\}/);
  assert.match(client, /Pack pagado prom\." value=\{formatCurrency\(totals\.pack_vendido_precio_pagado_avg\)\}/);
  assert.match(client, /Pack lista prom\." value=\{formatCurrency\(totals\.pack_vendido_precio_lista_avg\)\}/);
  assert.doesNotMatch(client, /ADR pagado" value=\{formatCurrency\(totals\.precio_pagado_boleta_avg\)\}/);
  assert.doesNotMatch(client, /Ticket lista" value="No disponible"/);
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
  assert.match(formatters, /value === 1 \? "día" : "días"/);
  assert.match(client, /<p className="mt-1 text-lg font-semibold text-navy">\{formatDays\(main\)\}<\/p>/);
  assert.match(client, /\{ticketLabel\}: \{formatDays\(ticket\)\}/);
  assert.match(client, /Pack: \{formatDays\(pack\)\}/);
  assert.match(client, /<AverageBlock label="Anticipacion promedio" main=\{totals\.advanced_book_days_total_avg\} pack=\{totals\.advanced_book_days_pack_avg\} ticket=\{totals\.advanced_book_days_boleta_avg\} \/>/);
  assert.match(client, /<AverageBlock label="Estadia promedio" main=\{totals\.duration_stay_total_avg\} pack=\{totals\.duration_stay_pack_avg\} ticket=\{totals\.duration_stay_boleta_avg\} \/>/);
  assert.match(client, /<SystemColumn label="OKP"/);
  assert.match(client, /<SystemColumn label="MCP"/);
  assert.doesNotMatch(client, /formatDays\(totals\.precio|formatDays\(totals\.venta|formatDays\(totals\.reserva|formatDays\(totals\.pack_vendido/);
  assert.doesNotMatch(client + formatters, /No disponible días/);
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
});
test("U. control exige confirmacion y bloquea doble creacion", () => {
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
  assert.match(compositeControl, /run\?\.status !== "succeeded"/);
  assert.match(compositeControl, /completedRunRef\.current === run\.run_id/);
  assert.match(compositeControl, /completedRunRef\.current = run\.run_id/);
  assert.match(compositeControl, /void onSucceededRef\.current\?\.\(\)/);
  assert.match(client, /onSucceeded=\{\(\) => loadByDate\(selectedDate\)\}/);
  assert.doesNotMatch(compositeControl, /run\?\.status === "failed"[\s\S]*onSucceeded|run\?\.status === "cancelled"[\s\S]*onSucceeded/);
});

test("X. no duplica rutas ni contratos del composite run en Dashboard", () => {
  assert.doesNotMatch(client, /\/api\/orquestador\/operaciones\/actualizar-datos|\/advance|method: "POST"|startRun\(/);
  assert.match(compositeHook, /\/api\/orquestador\/operaciones\/actualizar-datos\/\$\{runId\}/);
  assert.match(compositeHook, /\/api\/orquestador\/operaciones\/actualizar-datos\/advance/);
  assert.match(compositeHook, /orquestador:actualizar-datos:last-month:run-id:v1/);
});
