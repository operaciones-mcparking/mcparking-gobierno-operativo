import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ExcelJS from "exceljs";

import { generateProcessMasterExcel, processMasterExcelFilename } from "../src/lib/procesos/process-excel.ts";

const route = readFileSync("src/app/api/procesos/export/route.ts", "utf8");
const button = readFileSync("src/app/estructura/process-excel-download-button.tsx", "utf8");
const structure = readFileSync("src/app/estructura/page.tsx", "utf8");
const roleLoader = readFileSync("src/lib/procesos/process-role-profiles.ts", "utf8");

function processFixture(overrides = {}) {
  return {
    process: {
      id: "12345678-1234-4234-9234-123456789abc",
      name: "Atención operacional",
      processCode: "PROC-000019",
      version: null,
      masterUpdatedAt: "2026-08-17T12:00:00Z",
      createdAt: "2026-08-10T12:00:00Z",
      effectiveDate: null,
      description: null,
      objective: "Atender clientes",
      expected_result: null,
      processStart: "Solicitud recibida",
      processEnd: "Solicitud cerrada",
      scope: "Operación nacional",
      inputs_providers: null,
      outputs_clients: null,
      supplier_origin: "Cliente",
      process_inputs: "Solicitud",
      process_outputs: "Respuesta",
      client_destination: "Cliente",
      basic_kpi: null,
      pdca: { plan: null, do: null, check: null, act: null },
      company_id: "company-id",
      company_name: "McParking",
      area_id: "area-id",
      area_name: "Operación",
      process_type: "operational",
      criticality: "medium",
      status: "active",
      documentation_status: "documented",
      ...overrides,
    },
    responsibility: {
      owner_role_id: "role-id",
      owner_role_name: "Jefe de Operaciones",
      owner_person_id: "person-id",
      owner_person_name: "Diego Vera",
    },
    stages: [
      { id: "stage-2", name: "Cerrar", description: "Cierre", criticality: "medium", impact_percent: null, sort_order: 2, status: "active", owner_role_id: null, owner_role_name: null, owner_person_name: null, user_role_id: null, support_role_ids: [], backup_role_id: null },
      { id: "stage-1", name: "Recibir", description: "Recepción", criticality: "medium", impact_percent: null, sort_order: 1, status: "active", owner_role_id: null, owner_role_name: null, owner_person_name: null, user_role_id: null, support_role_ids: [], backup_role_id: null },
    ],
    roleProfiles: [
      { id: "profile-2", sort_order: 1, role_id: "role-id", role_name: "Jefe de Operaciones", current_person_name: "Diego Vera", responsibility: "Supervisar", authority: "Resolver", accountability: "Informar", is_process_owner: false, participations: [] },
      { id: "profile-1", sort_order: 0, role_id: "role-id", role_name: "Jefe de Operaciones", current_person_name: "Diego Vera", responsibility: "Dirigir", authority: "Aprobar", accountability: "Responder", is_process_owner: true, participations: ["owner"] },
    ],
    metrics: [{ id: "metric-1", name: "Tiempo", formula: "Minutos", target: "15", frequency: "Mensual", owner_role_id: null, owner_role_name: null, owner_person_name: null, responsible_roles: [{ role_id: "role-2", role_name: "Analista", sort_order: 2 }, { role_id: "role-1", role_name: "Jefe", sort_order: 1 }], sort_order: 1 }],
    risks: [{ id: "risk-1", name: "Demora", risk_type: "risk", controls: [
      { id: "control-1", name: "Revisión", evidence: "Registro", owner_role_id: null, owner_role_name: null, owner_person_name: null, responsible_roles: [{ role_id: "role-1", role_name: "Jefe", sort_order: 1 }] },
      { id: "control-2", name: "Alerta", evidence: "Correo", owner_role_id: null, owner_role_name: null, owner_person_name: null, responsible_roles: [{ role_id: "role-2", role_name: "Analista", sort_order: 1 }] },
    ] }],
  };
}

test("generates the five-sheet master workbook with stable relationships", async () => {
  const bytes = await generateProcessMasterExcel([
    processFixture(),
    processFixture({ id: "22345678-1234-4234-9234-123456789abc", name: "Administración", processCode: "PROC-000002" }),
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);

  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "Procesos",
    "Etapas",
    "Roles y responsabilidades",
    "Indicadores",
    "Riesgos y controles",
  ]);
  const processes = workbook.getWorksheet("Procesos");
  assert.ok(processes);
  assert.deepEqual(processes.getRow(1).values.slice(1), ["Código", "Proceso", "Estado", "Empresa", "Tipo de proceso", "Tipo de operación", "Rol dueño", "Persona actual", "Propósito", "Inicio", "Fin", "Alcance", "Proveedor / Origen", "Entradas", "Salidas", "Cliente / Destino", "Cantidad de etapas", "Última edición"]);
  assert.equal(processes.getCell("A2").value, "PROC-000002");
  assert.equal(processes.getCell("A3").value, "PROC-000019");
  assert.equal(processes.getCell("Q2").value, 2);
  assert.equal(processes.views[0]?.state, "frozen");
  assert.equal(processes.views[0]?.ySplit, 1);
  assert.ok(processes.autoFilter);

  const stages = workbook.getWorksheet("Etapas");
  assert.deepEqual(stages.getRow(1).values.slice(1), ["Código proceso", "Proceso", "Nº etapa", "Etapa", "Descripción"]);
  assert.equal(stages.getCell("C2").value, 1);
  assert.equal(stages.getCell("D2").value, "Recibir");

  const roles = workbook.getWorksheet("Roles y responsabilidades");
  assert.deepEqual(roles.getRow(1).values.slice(1), ["Código proceso", "Proceso", "Orden", "Rol", "Responsabilidad", "Autoridad", "Rendición de cuentas"]);
  assert.equal(roles.rowCount, 5);
  assert.equal(roles.getCell("D2").value, "Jefe de Operaciones");
  assert.equal(roles.getCell("D3").value, "Jefe de Operaciones");
  assert.equal(roles.getCell("C2").value, 0);
  assert.equal(roles.getCell("E2").value, "Dirigir");

  const metrics = workbook.getWorksheet("Indicadores");
  assert.deepEqual(metrics.getRow(1).values.slice(1), ["Código proceso", "Proceso", "Indicador", "Fórmula / criterio", "Meta", "Frecuencia", "Responsables"]);
  assert.equal(metrics.getCell("G2").value, "Jefe; Analista");

  const risks = workbook.getWorksheet("Riesgos y controles");
  assert.deepEqual(risks.getRow(1).values.slice(1), ["Código proceso", "Proceso", "Tipo", "Riesgo / oportunidad", "Control", "Evidencia", "Responsables"]);
  assert.equal(risks.rowCount, 5);
  assert.equal(risks.getCell("E2").value, "Revisión");
  assert.equal(risks.getCell("E3").value, "Alerta");
});

test("uses a dated Excel filename", () => {
  assert.equal(processMasterExcelFilename(new Date("2026-08-17T12:00:00Z")), "Maestro_de_Procesos_2026-08-17.xlsx");
});

test("endpoint exports every official coded process through the shared read model", () => {
  assert.match(route, /getProcessCatalogV2\(\)/);
  assert.match(route, /filter\(\(process\) => process\.status === "active" && Boolean\(process\.process_code\?\.trim\(\)\)\)/);
  assert.match(route, /getProcessMasterReadModel\(process\.process_id\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /profile\.status !== "active"/);
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(route, /attachment; filename=/);
  assert.doesNotMatch(route, /createSupabaseAdminClient|service_role|searchParams|\.insert\(|\.update\(|\.delete\(/);
});

test("structure button downloads independently from visible filters", () => {
  assert.match(structure, /<ProcessExcelDownloadButton \/>[\s\S]*Nuevo proceso/);
  assert.match(button, /fetch\("\/api\/procesos\/export", \{ cache: "no-store" \}\)/);
  assert.match(button, /Preparando Excel\.\.\./);
  assert.match(button, /disabled=\{pending\}/);
  assert.match(button, /finally[\s\S]*setPending\(false\)/);
  assert.doesNotMatch(button, /filters|searchParams|activeProcesses|processIds/);
});

test("role loader exposes persisted sort order without deduplicating profiles", () => {
  assert.match(roleLoader, /select\('id,role_id,responsibility_description,authority_description,accountability_description,sort_order'\)/);
  assert.match(roleLoader, /sort_order: profile\.sort_order \?\? 0/);
  assert.doesNotMatch(roleLoader, /new Map\([^\n]*profiles|dedup/i);
});

console.log("process-excel: 5/5 OK");