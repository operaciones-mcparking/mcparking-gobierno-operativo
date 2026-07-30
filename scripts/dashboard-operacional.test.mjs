import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const helperPath = "src/lib/dashboard/operacional.ts";
const routePath = "src/app/api/dashboard/operacional/route.ts";
const supabaseAdminPath = "src/lib/orquestador/supabase-admin.ts";
const authPath = "src/lib/orquestador/auth.ts";

const helper = readFileSync(helperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const supabaseAdmin = readFileSync(supabaseAdminPath, "utf8");
const auth = readFileSync(authPath, "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
const dashboardRpcHelper = supabaseAdmin.match(/export async function getOperationalDashboardRpcData[\\s\\S]+$/)?.[0] ?? "";

const compiled = ts.transpileModule(helper, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
const executeCompiled = new Function("exports", "module", compiled);
executeCompiled(module.exports, module);
const {
  calculateMarketShare,
  calculateOperationalDashboardTotals,
  calculateTotalsByDate,
  calculateTotalsByGroup,
  normalizeOperationalDashboardRpcResult,
} = module.exports;

const runId = "498a3a70-dbb0-4999-bab6-d85bc9eb07c4";
const updateId = "2c267fc4-64f4-4e4c-9362-2f860f61ac31";
const jobId = "5eb65645-cae1-4913-859b-d202491a8a30";

function row(overrides = {}) {
  return {
    advanced_book_days_boleta_avg: 2,
    advanced_book_days_pack_avg: 4,
    advanced_book_days_total_avg: 3,
    avg_order_value_boleta: 1000,
    calculated_at: "2026-07-30T12:00:00Z",
    created_at: "2026-07-30T12:00:00Z",
    dashboard_actualizacion_id: updateId,
    day: 30,
    duration_stay_boleta_avg: 1,
    duration_stay_pack_avg: 5,
    duration_stay_total_avg: 2,
    fecha: "2026-07-30",
    id: "46e4d0c8-19bb-4f21-86dd-62cb56cb16dc",
    metric_version: "v1",
    month: 7,
    pack_vendido_dbi: 20,
    pack_vendido_precio_lista_avg: 5000,
    pack_vendido_precio_pagado_avg: 4000,
    pack_vendido_q: 2,
    pack_vendido_venta: 8000,
    parking_codigo: "TEST",
    parking_nombre: "Parking test",
    precio_lista_boleta_avg: 2000,
    precio_pagado_boleta_avg: 1500,
    quarter: 3,
    reserva_boleta_dbi: 10,
    reserva_boleta_q: 4,
    reserva_boleta_venta: 6000,
    reserva_pack_dbi: 5,
    reserva_pack_q: 2,
    reserva_total_dbi: 15,
    reserva_total_q: 6,
    sistema_grupo: "MCP",
    source_run_id: runId,
    updated_at: "2026-07-30T12:00:00Z",
    venta_boleta: 999999,
    venta_total_operacional: 14000,
    year: 2026,
    ...overrides,
  };
}

function rpcResponse(rows = [row()]) {
  return {
    filters: {
      date: null,
      from: "2026-07-01",
      parking_codigo: null,
      sistema_grupo: null,
      source_run_id: runId,
      to: "2026-07-30",
    },
    lastUpdate: {
      calculated_at: "2026-07-30T12:00:00Z",
      composite_run_id: runId,
      created_at: "2026-07-30T12:00:00Z",
      dashboard_job_id: jobId,
      error_message: null,
      estado: "succeeded",
      id: updateId,
      metadata: { internal: true },
      metric_version: "v1",
      packs_job_id: null,
      periodo_desde: "2026-07-01",
      periodo_hasta: "2026-07-30",
      reservas_job_id: null,
      rows_written: rows.length,
      updated_at: "2026-07-30T12:00:00Z",
    },
    rows,
  };
}

test("1. Endpoint GET protegido por admin", () => {
  assert.equal(existsSync(routePath), true);
  assert.match(route, /export async function GET/);
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(auth, /profile\.app_role !== "admin"/);
  assert.match(auth, /profile\.status !== "active"/);
  assert.match(route, /401/);
  assert.match(route, /403/);
});

test("2. RPC exacta y parametros exactos", () => {
  assert.match(supabaseAdmin, /rpc\("orchestrator_dashboard_get_operacional"/);
  for (const param of ["p_from: query.from", "p_to: query.to", "p_date: query.date", "p_parking_codigo: query.parking_codigo", "p_sistema_grupo: query.sistema_grupo", "p_source_run_id: query.source_run_id"]) {
    assert.match(supabaseAdmin, new RegExp(param.replace(/[.]/g, "\\.")));
  }
});

test("3. Ausencia de schema y from en flujo nuevo", () => {
  const dashboardSources = [route, dashboardRpcHelper].join("\n");
  assert.doesNotMatch(dashboardSources, /schema\("ops_orchestrator"\)/);
  assert.doesNotMatch(dashboardSources, /\.from\("dashboard_operacional_diario"\)|\.from\("dashboard_actualizaciones"\)|\.from\(/);
});

test("4. Normalizacion de objeto valido", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcResponse());
  assert.notEqual(dashboard, null);
  assert.equal(dashboard.ok, undefined);
  assert.equal(dashboard.lastUpdate.estado, "succeeded");
  assert.equal(dashboard.rows.length, 1);
  assert.equal(dashboard.rows[0].venta_total_operacional, 14000);
});

test("5. Respuesta sin corrida", () => {
  const dashboard = normalizeOperationalDashboardRpcResult({ lastUpdate: null, rows: [] });
  assert.equal(dashboard.lastUpdate, null);
  assert.equal(dashboard.filters, null);
  assert.deepEqual(dashboard.rows, []);
  assert.equal(dashboard.totals.venta_total_operacional, 0);
});

test("6. Filters ausente solo se tolera sin corrida", () => {
  assert.equal(normalizeOperationalDashboardRpcResult({ lastUpdate: rpcResponse().lastUpdate, rows: [] }), null);
  assert.equal(normalizeOperationalDashboardRpcResult({ lastUpdate: null, rows: [] }).filters, null);
});

test("7. Numero recibido como number", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcResponse([row({ reserva_boleta_q: 7 })]));
  assert.notEqual(dashboard, null);
  assert.equal(dashboard.rows[0].reserva_boleta_q, 7);
});

test("8. Decimal recibido como string numerico", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcResponse([row({ precio_pagado_boleta_avg: "1234.5" })]));
  assert.notEqual(dashboard, null);
  assert.equal(dashboard.rows[0].precio_pagado_boleta_avg, 1234.5);
});

test("9. Numero invalido rechazado", () => {
  assert.equal(normalizeOperationalDashboardRpcResult(rpcResponse([row({ reserva_boleta_q: "NaN" })])), null);
  assert.equal(normalizeOperationalDashboardRpcResult(rpcResponse([row({ venta_total_operacional: Infinity })])), null);
});

test("10. Sumas correctas", () => {
  const totals = calculateOperationalDashboardTotals([
    row({ reserva_boleta_venta: 10, venta_total_operacional: 100 }),
    row({ reserva_boleta_venta: 20, venta_total_operacional: 200 }),
  ]);
  assert.equal(totals.reserva_boleta_venta, 30);
  assert.equal(totals.venta_total_operacional, 300);
});

test("11. Promedios ponderados correctos", () => {
  const totals = calculateOperationalDashboardTotals([
    row({ precio_pagado_boleta_avg: 100, reserva_boleta_q: 2 }),
    row({ precio_pagado_boleta_avg: 200, reserva_boleta_q: 6 }),
  ]);
  assert.equal(totals.precio_pagado_boleta_avg, 175);
});

test("12. Denominador cero devuelve null", () => {
  const totals = calculateOperationalDashboardTotals([row({ precio_pagado_boleta_avg: 100, reserva_boleta_q: 0 })]);
  assert.equal(totals.precio_pagado_boleta_avg, null);
});

test("13. Agrupacion MCP OKP OTRO", () => {
  const groups = calculateTotalsByGroup([
    row({ sistema_grupo: "MCP", venta_total_operacional: 10 }),
    row({ id: "c60ac568-83a0-4c97-8f97-a43219d7f4ba", sistema_grupo: "OKP", venta_total_operacional: 20 }),
    row({ id: "f3006ca4-1a44-44a1-adf8-df5529388e08", sistema_grupo: "OTRO", venta_total_operacional: 30 }),
  ]);
  assert.equal(groups.MCP.venta_total_operacional, 10);
  assert.equal(groups.OKP.venta_total_operacional, 20);
  assert.equal(groups.OTRO.venta_total_operacional, 30);
});

test("14. Agrupacion por fecha", () => {
  const byDate = calculateTotalsByDate([
    row({ fecha: "2026-07-31", venta_total_operacional: 31 }),
    row({ id: "c60ac568-83a0-4c97-8f97-a43219d7f4ba", fecha: "2026-07-30", venta_total_operacional: 30 }),
  ]);
  assert.equal(JSON.stringify(byDate.map((item) => item.fecha)), JSON.stringify(["2026-07-30", "2026-07-31"]));
});

test("15. Market share MCP mas OKP", () => {
  const groups = calculateTotalsByGroup([
    row({ sistema_grupo: "MCP", venta_total_operacional: 75, reserva_total_dbi: 30, reserva_total_q: 8 }),
    row({ id: "c60ac568-83a0-4c97-8f97-a43219d7f4ba", sistema_grupo: "OKP", venta_total_operacional: 25, reserva_total_dbi: 70, reserva_total_q: 2 }),
  ]);
  const marketShare = calculateMarketShare(groups);
  assert.equal(marketShare.venta_total_operacional.MCP, 75);
  assert.equal(marketShare.venta_total_operacional.OKP, 25);
  assert.equal(marketShare.reserva_total_q.MCP, 80);
});

test("16. OTRO no altera el market share", () => {
  const groups = calculateTotalsByGroup([
    row({ sistema_grupo: "MCP", venta_total_operacional: 50 }),
    row({ id: "c60ac568-83a0-4c97-8f97-a43219d7f4ba", sistema_grupo: "OKP", venta_total_operacional: 50 }),
    row({ id: "f3006ca4-1a44-44a1-adf8-df5529388e08", sistema_grupo: "OTRO", venta_total_operacional: 900 }),
  ]);
  assert.equal(JSON.stringify(calculateMarketShare(groups).venta_total_operacional), JSON.stringify({ MCP: 50, OKP: 50 }));
});

test("17. No se incluyen campos legacy en el DTO", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcResponse([row({ venta_total: 123, q_total: 456 })]));
  assert.notEqual(dashboard, null);
  assert.equal("venta_total" in dashboard.rows[0], false);
  assert.equal("q_total" in dashboard.rows[0], false);
});

test("18. No se incluye metadata completa", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcResponse([row({ metadata: { internal: true } })]));
  assert.notEqual(dashboard, null);
  assert.equal("metadata" in dashboard.rows[0], false);
  assert.equal("metadata" in dashboard.lastUpdate, false);
});

test("19. Error RPC devuelve mensaje generico", () => {
  assert.match(route, /No fue posible consultar el dashboard operacional/);
  assert.doesNotMatch(route, /error\.message|details|hint|stack/);
});

test("20. Endpoint no ejecuta jobs ni POST", () => {
  assert.doesNotMatch(route, /export async function POST|orchestrator_create_job|createCompositeJobStep|method:\s*"POST"/);
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery/m);
});
