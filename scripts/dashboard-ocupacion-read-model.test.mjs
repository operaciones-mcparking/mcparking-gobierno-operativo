import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";

const helper = readFileSync("src/lib/dashboard/ocupacion.ts", "utf8");
const route = readFileSync("src/app/api/dashboard/ocupacion/route.ts", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { buildOperationalOccupancyReadModel, collectOccupancyRpcPages, isValidOccupancyDate, nullableOccupancyNumber } = module.exports;

function physical(overrides = {}) {
  return { fecha: "2026-08-31", parking_fisico: "MC PARKING VESPUCIO", occupied: "1232", capacity: "2200", occupancy_percentage: "56.0000", revenue_ocupacion: "3522833.00", fuente_capacidad: "catalogo", estado_capacidad: "available", tipo_operacion_fisica: "MCP_EAP", source_run_id: "not-exposed", calculated_at: "2026-08-31T12:00:00Z", ...overrides };
}

function commercial(overrides = {}) {
  return { fecha: "2026-08-31", parking_comercial: "ESTACIONAMIENTO AEROPUERTO", parking_fisico: "MC PARKING VESPUCIO", occupied: "573", revenue_ocupacion: "1000.00", tipo_operacion_fisica: "MCP_EAP", aporta_ocupacion_fisica: true, source_run_id: "not-exposed", calculated_at: "2026-08-31T12:00:00Z", ...overrides };
}

function model({ physicalRows = [physical()], commercialRows = [commercial()] } = {}) {
  return buildOperationalOccupancyReadModel({ from: "2026-08-31", to: "2026-08-31", physical: physicalRows, commercial: commercialRows });
}

test("1. endpoint replica acceso admin, parametros cerrados y no-store", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /new Set\(\["from", "to"\]\)/);
  assert.match(route, /force-dynamic/);
  assert.match(route, /revalidate = 0/);
  assert.match(route, /Cache-Control.*no-store/);
});

test("2. ambas RPC se consultan completas en paralelo con fechas exactas", () => {
  assert.match(route, /Promise\.all\(/);
  assert.match(supabaseAdmin, /getOccupancyRpcData/);
  assert.match(supabaseAdmin, /"orchestrator_ocupacion_list_fisica"/);
  assert.match(supabaseAdmin, /"orchestrator_ocupacion_list_comercial"/);
  assert.match(supabaseAdmin, /p_desde: from, p_hasta: to/);
  assert.match(supabaseAdmin, /\.range\(rangeFrom, rangeTo\)/);
});

test("2a. horizonte superior a mil filas recupera todas las paginas", async () => {
  const source = Array.from({ length: 2086 }, (_, index) => ({ index }));
  const ranges = [];
  const rows = await collectOccupancyRpcPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.equal(rows.length, 2086);
  assert.equal(rows.at(-1).index, 2085);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("2b. error de una pagina invalida la lectura completa", async () => {
  let calls = 0;
  const rows = await collectOccupancyRpcPages(async () => {
    calls += 1;
    return calls === 1
      ? { data: Array.from({ length: 1000 }, (_, index) => index), error: null }
      : { data: null, error: new Error("page failed") };
  });

  assert.equal(rows, null);
  assert.equal(calls, 2);
});

test("3. fechas validas, futuras y rango ordenado", () => {
  assert.equal(isValidOccupancyDate("2030-12-31"), true);
  assert.equal(isValidOccupancyDate("2030-02-30"), false);
  assert.equal(buildOperationalOccupancyReadModel({ from: "2030-02-02", to: "2030-02-01", physical: [], commercial: [] }), null);
  assert.notEqual(buildOperationalOccupancyReadModel({ from: "2030-02-01", to: "2030-02-02", physical: [], commercial: [] }), null);
});

test("4. numeric string se normaliza y null permanece null", () => {
  assert.equal(nullableOccupancyNumber("56.0000"), 56);
  assert.equal(nullableOccupancyNumber(null), null);
  const result = model({ physicalRows: [physical({ capacity: null, revenue_ocupacion: null })] });
  assert.equal(result.physical[0].capacity, null);
  assert.equal(result.physical[0].revenue_ocupacion, null);
});

test("5. porcentaje superior a 100 no se limita", () => {
  assert.equal(model({ physicalRows: [physical({ occupancy_percentage: "123.45" })] }).physical[0].occupancy_percentage, 123.45);
});

test("6. EAP y MCP comerciales permanecen separados en el mismo recinto fisico", () => {
  const result = model({ commercialRows: [commercial(), commercial({ parking_comercial: "MC PARKING VESPUCIO", occupied: "659" })] });
  assert.deepEqual(result.commercial.map((row) => row.parking_comercial), ["ESTACIONAMIENTO AEROPUERTO", "MC PARKING VESPUCIO"]);
  assert.equal(result.commercial.every((row) => row.parking_fisico === "MC PARKING VESPUCIO"), true);
  assert.equal(result.physical.length, 1);
  assert.equal(result.physical[0].occupied, 1232);
});

test("7. helper no fabrica fisico sumando comercial", () => {
  const result = model({ physicalRows: [], commercialRows: [commercial(), commercial({ parking_comercial: "MC PARKING VESPUCIO" })] });
  assert.deepEqual(result.physical, []);
});

test("8. OK Parking RC y Express permanecen separados fisicamente", () => {
  const result = model({ physicalRows: [physical({ parking_fisico: "OK PARKING RC" }), physical({ parking_fisico: "OK PARKING EXPRESS" })] });
  assert.deepEqual(result.physical.map((row) => row.parking_fisico), ["OK PARKING RC", "OK PARKING EXPRESS"]);
});

test("9. comercial no expone capacidad, porcentaje ni source run", () => {
  const result = model();
  assert.equal("capacity" in result.commercial[0], false);
  assert.equal("occupancy_percentage" in result.commercial[0], false);
  assert.equal("source_run_id" in result.commercial[0], false);
  assert.equal("capacity" in result.physical[0], true);
  assert.equal("occupancy_percentage" in result.physical[0], true);
  assert.equal("source_run_id" in result.physical[0], false);
});

test("10. duplicados logicos remotos se rechazan sin deduplicar ni sumar", () => {
  assert.equal(model({ physicalRows: [physical(), physical()] }), null);
  assert.equal(model({ commercialRows: [commercial(), commercial()] }), null);
});

test("11. endpoint no ejecuta jobs ni toca areas excluidas", () => {
  assert.doesNotMatch(route, /export async function POST|orchestrator_create_job|ocupaciones_actualizar/);
  assert.doesNotMatch(diffNames, /src\/app\/recuperacion|src\/app\/api\/recuperacion|supabase\/migrations|n8n/i);
});
