import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const clientPath = "src/app/dashboard-operacional/dashboard-operacional-client.tsx";
const dataHelperPath = "src/lib/dashboard/operacional.ts";
const routePath = "src/app/api/dashboard/operacional/route.ts";
const supabaseAdminPath = "src/lib/orquestador/supabase-admin.ts";
const dashboardViewPath = "src/app/orquestador/orchestrator-dashboard-view.tsx";
const workerPattern = /(?:^|\n)(?: M|M|A|\?\?)\s+(?:worker|workers|src\/worker|src\/workers|agents|agentes|src\/agents|src\/agentes|PC1|pc1)\//i;

const client = readFileSync(clientPath, "utf8");
const dataHelper = readFileSync(dataHelperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const supabaseAdmin = readFileSync(supabaseAdminPath, "utf8");
const dashboardView = readFileSync(dashboardViewPath, "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

function loadDataHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(dataHelper, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: dataHelperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(name) {
      throw new Error("Unexpected require in operational detail test: " + name);
    },
  });

  return module.exports;
}

const { displayOperationalParkingName, normalizeOperationalDashboardRpcResult } = loadDataHelperExports();

function uuid(seed) {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function row(overrides = {}) {
  return {
    advanced_book_days_boleta_avg: 3.2581,
    advanced_book_days_pack_avg: 0.2222,
    advanced_book_days_total_avg: 1.9236,
    avg_order_value_boleta: 29347.24,
    calculated_at: "2026-08-04T19:42:44.812224+00:00",
    created_at: "2026-08-04T19:42:44.812224+00:00",
    dashboard_actualizacion_id: uuid(2),
    day: 21,
    duration_stay_boleta_avg: 5.8235,
    duration_stay_pack_avg: 6.875,
    duration_stay_total_avg: 6.2857,
    fecha: "2026-07-21",
    id: uuid(1),
    metric_version: "dashboard_operacional_mvp_v2_boleta_pack",
    month: 7,
    pack_vendido_dbi: 86,
    pack_vendido_precio_lista_avg: 148795,
    pack_vendido_precio_pagado_avg: 119815,
    pack_vendido_q: 2,
    pack_vendido_venta: 239630,
    parking_codigo: "EAP",
    parking_nombre: "ESTACIONAMIENTO AEROPUERTO",
    precio_lista_boleta_avg: 37914.86,
    precio_pagado_boleta_avg: 29347.24,
    quarter: 3,
    reserva_boleta_dbi: 297,
    reserva_boleta_q: 51,
    reserva_boleta_venta: 1496709,
    reserva_pack_dbi: 275,
    reserva_pack_q: 40,
    reserva_total_dbi: 572,
    reserva_total_q: 91,
    sistema_grupo: "MCP",
    source_run_id: uuid(3),
    updated_at: "2026-08-04T19:42:44.812224+00:00",
    venta_total_operacional: 1736339,
    year: 2026,
    ...overrides,
  };
}

function rpcPayload(rows = [row()]) {
  return {
    filters: { date: "2026-07-21", from: "2026-07-21", parking_codigo: null, sistema_grupo: null, source_run_id: uuid(3), to: "2026-07-21" },
    lastUpdate: {
      calculated_at: "2026-08-04T19:42:44.812224+00:00",
      composite_run_id: uuid(4),
      created_at: "2026-08-04T19:42:31.615169+00:00",
      dashboard_job_id: uuid(5),
      error_message: null,
      estado: "succeeded",
      id: uuid(6),
      metadata: { periodo_desde: "2026-07-05", periodo_hasta: "2026-08-04" },
      metric_version: "dashboard_operacional_mvp_v2_boleta_pack",
      packs_job_id: null,
      periodo_desde: "2022-01-01",
      periodo_hasta: "2026-07-20",
      reservas_job_id: null,
      rows_written: 6275,
      updated_at: "2026-08-04T19:42:44.812224+00:00",
    },
    rows,
  };
}

test("1. no se modifican worker, agentes ni contratos de jobs", () => {
  assert.doesNotMatch(diffNames, workerPattern);
  assert.doesNotMatch(diffNames, /src\/lib\/orquestador\/actualizar-datos-operacionales|src\/lib\/orquestador\/composite-runs|src\/app\/api\/orquestador/);
});

test("2. la fuente exacta es la RPC operacional existente", () => {
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(supabaseAdmin, /rpc\("orchestrator_dashboard_get_operacional"/);
  assert.match(dashboardView, /getOperationalDashboardRpcData/);
  assert.match(dashboardView, /normalizeOperationalDashboardRpcResult/);
});

test("3. no hay POST ni escrituras nuevas", () => {
  assert.doesNotMatch(route, /export async function POST|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.doesNotMatch(client, /method:\s*"POST"|create_recovery_weekly_snapshot|supabase\.from|\.rpc\(/);
});

test("4. Rio Claro no aparece en UI y Rio Clarillo si", () => {
  assert.doesNotMatch(client, /Rio Claro/);
  assert.doesNotMatch(dataHelper, /Rio Claro/);
  assert.match(dataHelper, /OKParking Rio Clarillo/);
  assert.equal(displayOperationalParkingName("OKP_RC", "OKParking Rio Claro"), "OKParking Rio Clarillo");
  assert.equal(displayOperationalParkingName("OK PARKING RC", "OK PARKING RC"), "OKParking Rio Clarillo");
});

test("5. alias operacionales conocidos quedan centralizados", () => {
  assert.equal(displayOperationalParkingName("EAP", "ESTACIONAMIENTO AEROPUERTO"), "Estacionamiento Aeropuerto");
  assert.equal(displayOperationalParkingName("MCP", "MC PARKING VESPUCIO"), "McParking");
  assert.equal(displayOperationalParkingName("OKP_EXP", "OK PARKING EXPRESS"), "OKParking Express");
  assert.equal(displayOperationalParkingName("OKP_RC", "OK PARKING RC"), "OKParking Rio Clarillo");
});

test("6. metadata real corrige fecha maxima disponible sin usar 20-07-26", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcPayload());
  assert.equal(dashboard.lastUpdate.periodo_desde, "2026-07-05");
  assert.equal(dashboard.lastUpdate.periodo_hasta, "2026-08-04");
  assert.match(client, /formatDateTime\(lastUpdate\.calculated_at \?\? lastUpdate\.updated_at \?\? lastUpdate\.created_at\)/);
  assert.doesNotMatch(client, /20-07-26|2026-07-20T00:00:00|hardcode/);
});

test("7. resumen mantiene columnas actuales y fila TOTAL no expandible", () => {
  for (const label of ["Estacionamiento", "Sistema", "Venta", "Reservas", "DBI", "Packs vendidos"]) {
    assert.match(client, new RegExp(label));
  }
  assert.equal(client.includes('"Acci\\u00f3n"'), true);
  assert.match(client, /<td className="border-t border-\[#cbd8e3\] px-3 py-3">TOTAL<\/td>/);
  assert.doesNotMatch(client, /TOTAL[\s\S]{0,260}<ParkingSummaryToggle/);
  assert.doesNotMatch(client, /min-w-\[1180px\]|overflow-x-auto/);
});

test("8. boton Ver detalle abre drawer", () => {
  assert.match(client, /function ParkingDetailDrawer/);
  assert.match(client, /role="dialog"/);
  assert.match(client, /aria-modal="true"/);
  assert.match(client, /setSelectedParkingDetail\(row\)/);
  assert.match(client, /ParkingDetailDrawer/);
  assert.equal(client.includes("onClose={closeParkingDetail}"), true);
  assert.equal(client.includes("row={selectedParkingDetail}"), true);
});

test("9. drawer muestra identificacion", () => {
  assert.match(client, /Detalle operacional/);
  assert.match(client, /formatDate\(row\.fecha\)/);
  assert.match(client, /row\.parking_nombre/);
  assert.match(client, /Sistema \{row\.sistema_grupo\}/);
});

test("10. drawer muestra las 21 metricas solicitadas", () => {
  for (const label of [
    "Venta Operacional", "Venta Boleta", "Venta Packs Vendidos",
    "Q Boleta", "Q Reservas Pack", "Q Total Reservas",
    "DBI Boleta", "DBI Reservas Pack", "DBI Total Reservas",
    "Q Packs Vendidos", "DBI Packs Vendidos",
    "Anticipacion Total", "Anticipacion Boleta", "Anticipacion Pack",
    "Estadia Total", "Estadia Boleta", "Estadia Pack",
    "ADR Pagado", "ADR Lista", "Ticket Pagado", "Ticket Lista",
  ]) {
    assert.match(client, new RegExp(label));
  }
});

test("11. drawer usa los campos reales del DTO y no inventa valores", () => {
  for (const field of [
    "venta_total_operacional", "reserva_boleta_venta", "pack_vendido_venta",
    "reserva_boleta_q", "reserva_pack_q", "reserva_total_q",
    "reserva_boleta_dbi", "reserva_pack_dbi", "reserva_total_dbi",
    "pack_vendido_q", "pack_vendido_dbi",
    "advanced_book_days_total_avg", "advanced_book_days_boleta_avg", "advanced_book_days_pack_avg",
    "duration_stay_total_avg", "duration_stay_boleta_avg", "duration_stay_pack_avg",
    "precio_pagado_boleta_avg", "precio_lista_boleta_avg",
  ]) {
    assert.match(client, new RegExp(`row\\.${field}`));
    assert.match(dataHelper, new RegExp(field));
  }
});

test("12. null muestra guion visual", () => {
  assert.match(client, /function formatDetailValue/);
  assert.equal(client.includes('No disponible" ? "\\u2014" : value'), true);
});

test("13. usa formateadores existentes de moneda, enteros, dias y fecha", () => {
  for (const formatter of ["formatCurrency", "formatInteger", "formatDays", "formatAdrCurrency", "formatDate", "formatDateTime"]) {
    assert.match(client, new RegExp(formatter));
  }
});

test("14. responsive desktop lateral y mobile full-screen", () => {
  assert.match(client, /fixed inset-0 z-50/);
  assert.match(client, /w-full max-w-full/);
  assert.match(client, /md:max-w-3xl/);
  assert.match(client, /overflow-y-auto overflow-x-hidden/);
  assert.match(client, /md:grid-cols-2/);
});

test("15. cierre accesible, overlay y Escape", () => {
  assert.match(client, /aria-label="Cerrar detalle operacional"/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(client, /document\.body\.style\.overflow = "hidden"/);
  assert.match(client, /setSelectedParkingDetail\(null\)/);
});

test("16. tabla resumen no se convierte en 24 columnas", () => {
  assert.equal(client.includes('["Estacionamiento", "Sistema", "Venta", "Reservas", "DBI", "Packs vendidos", "Acci\\u00f3n"]'), true);
  assert.doesNotMatch(client, /Venta Operacional[\s\S]{0,120}<th|Ticket Lista[\s\S]{0,120}<th/);
});

test("17. caso 21-07-2026 normaliza nombres y conserva 21 campos disponibles", () => {
  const dashboard = normalizeOperationalDashboardRpcResult(rpcPayload([
    row(),
    row({ id: uuid(11), parking_codigo: "OKP_RC", parking_nombre: "OKParking Rio Claro", sistema_grupo: "OKP", venta_total_operacional: 2260355, pack_vendido_q: 0, pack_vendido_dbi: 0, pack_vendido_precio_pagado_avg: null, pack_vendido_precio_lista_avg: null }),
  ]));
  assert.equal(dashboard.rows.length, 2);
  assert.equal(dashboard.rows[0].parking_nombre, "Estacionamiento Aeropuerto");
  assert.equal(dashboard.rows[1].parking_nombre, "OKParking Rio Clarillo");
  assert.equal(dashboard.rows[0].venta_total_operacional, 1736339);
  assert.equal(dashboard.rows[0].reserva_total_q, 91);
  assert.equal(dashboard.rows[0].pack_vendido_dbi, 86);
});

test("18. no se modifica recuperacion ni orquestador de jobs", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion\//m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\//m);
  assert.doesNotMatch(diffNames, /^src\/lib\/orquestador\//m);
});

test("19. archivos esperados existen", () => {
  for (const file of [clientPath, dataHelperPath, routePath, supabaseAdminPath]) {
    assert.equal(existsSync(file), true);
  }
});

test("20. diff queda acotado a la web nueva y tests", () => {
  const allowed = new Set([
    "scripts/orchestrator-operational-detail.test.mjs",
    "src/app/dashboard-operacional/dashboard-operacional-client.tsx",
    "src/lib/dashboard/operacional.ts",
    "scripts/dashboard-operacional-ui.test.mjs",
  ]);
  for (const file of diffNames.split(/\r?\n/).filter(Boolean)) {
    assert.equal(allowed.has(file), true, `Unexpected diff file: ${file}`);
  }
});
