import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { generateProcessPdf, planPdfTablePages, processPdfFilename, shouldAddPdfPage } from "../src/lib/procesos/process-pdf.ts";

const route = readFileSync("src/app/api/procesos/[processId]/pdf/route.ts", "utf8");
const generator = readFileSync("src/lib/procesos/process-pdf.ts", "utf8");
const readModel = readFileSync("src/lib/procesos/process-master-read-model.ts", "utf8");
const readonlyPage = readFileSync("src/app/procesos/[processId]/page.tsx", "utf8");
const catalog = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");

const sample = {
  process: {
    id: "12345678-1234-4234-9234-123456789abc",
    name: "Atención al Cliente / Operacional",
    processCode: "PROC-000011",
    version: "1.0",
    masterUpdatedAt: "2026-08-15T12:00:00Z",
    createdAt: "2026-08-10T12:00:00Z",
    effectiveDate: null,
    description: null,
    objective: "Atender solicitudes de clientes con trazabilidad.",
    expected_result: null,
    processStart: "Recepción de solicitud",
    processEnd: "Cierre confirmado",
    scope: "Clientes y equipo operacional.",
    inputs_providers: null,
    outputs_clients: null,
    supplier_origin: "Cliente",
    process_inputs: "Solicitud y antecedentes",
    process_outputs: "Respuesta documentada",
    client_destination: "Cliente",
    basic_kpi: null,
    pdca: { plan: null, do: null, check: null, act: null },
    company_id: "company-id",
    company_name: "McParking",
    area_id: null,
    area_name: null,
    process_type: "operational",
    criticality: "medium",
    status: "active",
    documentation_status: "documented",
  },
  responsibility: {
    owner_role_id: "role-id",
    owner_role_name: "Jefe de Operaciones",
    owner_person_id: "person-id",
    owner_person_name: "Diego Vera",
  },
  stages: Array.from({ length: 12 }, (_, index) => ({
    id: "stage-" + index,
    name: "Etapa " + (index + 1),
    description: "Descripción operacional suficientemente extensa para validar ajuste de texto y paginación entre páginas.",
    criticality: "medium",
    impact_percent: null,
    sort_order: index + 1,
    status: "active",
    owner_role_id: null,
    owner_role_name: null,
    owner_person_name: null,
    user_role_id: null,
    support_role_ids: [],
    backup_role_id: null,
  })),
  roleProfiles: Array.from({ length: 45 }, (_, index) => ({
    id: "profile-" + index,
    sort_order: index,
    role_id: "role-" + index,
    role_name: index % 2 === 0 ? "Jefe de Operaciones" : "Analista Datos TI",
    current_person_name: index % 2 === 0 ? "Diego Vera" : "Sin persona asignada",
    responsibility: "Coordinar y documentar la ejecución operacional con antecedentes multilínea suficientes para validar el ajuste.",
    authority: "Resolver excepciones dentro del alcance asignado y escalar decisiones cuando corresponda.",
    accountability: "Rendir resultados y conservar evidencia trazable de cada actividad.",
    is_process_owner: index === 0,
    participations: index === 0 ? ["owner"] : ["support"],
  })),
  metrics: [{
    id: "metric-1",
    name: "Tiempo de respuesta",
    formula: "Minutos totales / solicitudes",
    target: "< 15 minutos",
    frequency: "Mensual",
    owner_role_id: null,
    owner_role_name: null,
    owner_person_name: null,
    responsible_roles: [{ role_id: "role-id", role_name: "Jefe de Operaciones", sort_order: 1 }],
    sort_order: 1,
  }],
  risks: [{
    id: "risk-1",
    name: "Respuesta tardía",
    risk_type: "risk",
    controls: [{
      id: "control-1",
      name: "Seguimiento diario",
      evidence: "Registro de casos",
      owner_role_id: null,
      owner_role_name: null,
      owner_person_name: null,
      responsible_roles: [{ role_id: "role-id", role_name: "Jefe de Operaciones", sort_order: 1 }],
    }],
  }],
};

test("generator returns a real paginated PDF and safe filename", async () => {
  const bytes = await generateProcessPdf(sample);
  assert.equal(new TextDecoder("latin1").decode(bytes.slice(0, 4)), "%PDF");
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 2);
  assert.equal(processPdfFilename(sample), "Ficha_Proceso_PROC-000011_Atencion_al_Cliente_Operacional.pdf");
});

test("generator contains readonly sections 1 through 5 only", () => {
  for (const section of ["1. PROPOSITO", "2. ENTRADAS", "3. ROLES", "4. INDICADORES", "5. RIESGOS"]) {
    assert.match(generator, new RegExp(section.replace(".", "\\.")));
  }
  assert.doesNotMatch(generator, /6\. |7\. /);
  assert.match(generator, /PAGE_WIDTH = 595\.28/);
  assert.match(generator, /\["PROVEEDOR \/ ORIGEN", "ENTRADAS", "ACTIVIDADES CLAVE", "SALIDAS", "CLIENTE \/ DESTINO"\]/);
  assert.ok(generator.includes('String(stage.sort_order ?? index + 1) + ". " + stage.name'));
  assert.doesNotMatch(generator, /\["N°", "ACTIVIDAD \/ ETAPA", "DESCRIPCION"\]/);
  assert.match(generator, /readFile\(join\(cwd\(\), "public", "mcparking-logo-pdf\.png"\)\)/);
  assert.match(generator, /document\.embedPng/);
  assert.match(generator, /const logoWidth = 128/);
  assert.match(generator, /logo\.height \/ logo\.width \* logoWidth/);
  assert.match(generator, /this\.page\.drawImage\(logo/);
  assert.doesNotMatch(generator, /"Versión"|Sin publicar|process\.process\.version/);
  assert.match(generator, /"Código"[\s\S]*"Última edición"/);
  assert.match(generator, /processStatus\(process\.process\.status\)/);
  assert.match(readFileSync("src/app/procesos/process-master/process-master-types.ts", "utf8"), /version: string \| null/);
});

test("a tabular section moves when only its title would fit", () => {
  const titleHeight = 30;
  const minimumTableSectionHeight = 28 + 19 + 9.2 + 8;
  const currentY = 48 + 16 + titleHeight + 1;

  assert.equal(shouldAddPdfPage(currentY, titleHeight), false);
  assert.equal(shouldAddPdfPage(currentY, minimumTableSectionHeight), true);
});

test("all documentary sections use the shared indivisible-row paginator", () => {
  assert.ok(generator.includes("planPdfTablePages(this.y, measuredRows.map((row) => row.height))"));
  assert.ok(generator.includes("drawSectionTitle(plannedPage.continuation)"));
  assert.ok(generator.includes("drawHeader();"));
  assert.ok(generator.includes('title + " - continuación"'));
  assert.equal(generator.split("layout.tableSection(").length - 1, 5);
  for (const section of ["1. PROPOSITO", "2. ENTRADAS", "3. ROLES", "4. INDICADORES", "5. RIESGOS"]) {
    assert.ok(generator.includes(section));
  }
});
test("planner moves an orphan section start and keeps a short section in place", () => {
  const orphan = planPdfTablePages(90, [30]);
  assert.equal(orphan.startsOnNewPage, true);
  assert.deepEqual(orphan.pages, [{ continuation: false, rowIndexes: [0] }]);

  const short = planPdfTablePages(700, [30, 30]);
  assert.equal(short.startsOnNewPage, false);
  assert.equal(short.pages.length, 1);
});

test("planner keeps multiline rows whole and repeats context on every continuation", () => {
  const rowHeights = Array.from({ length: 14 }, (_, index) => index % 3 === 0 ? 120 : 54);
  const plan = planPdfTablePages(500, rowHeights);
  const indexes = plan.pages.flatMap((page) => page.rowIndexes);

  assert.ok(plan.pages.length >= 2);
  assert.equal(plan.pages[0].continuation, false);
  assert.ok(plan.pages.slice(1).every((page) => page.continuation));
  assert.deepEqual(indexes, rowHeights.map((_, index) => index));
  assert.equal(new Set(indexes).size, rowHeights.length);
});

test("planner handles long roles, indicators and risks without splitting rows", () => {
  for (const rowHeights of [
    Array.from({ length: 30 }, () => 42),
    Array.from({ length: 22 }, () => 58),
    Array.from({ length: 18 }, () => 76),
  ]) {
    const plan = planPdfTablePages(760, rowHeights);
    assert.ok(plan.pages.length > 1);
    assert.deepEqual(
      plan.pages.flatMap((page) => page.rowIndexes),
      rowHeights.map((_, index) => index),
    );
  }
});

test("planner moves a very tall printable row intact and rejects an impossible row", () => {
  const tall = planPdfTablePages(280, [650]);
  assert.equal(tall.startsOnNewPage, true);
  assert.deepEqual(tall.pages[0].rowIndexes, [0]);
  assert.throws(() => planPdfTablePages(760, [700]), /taller than the printable page area/);
});

test("planner preserves the footer safety boundary", () => {
  const plan = planPdfTablePages(760, Array.from({ length: 20 }, () => 80));
  assert.ok(plan.pages.length > 1);
  assert.ok(generator.includes("const pageBottom = MARGIN + 16"));
  assert.match(generator, /y: 22/);
  assert.ok(generator.includes('"Ficha de proceso - " + (index + 1) + "/" + pages.length'));
});
test("endpoint authenticates, validates and returns safe PDF headers", () => {
  assert.match(route, /uuidPattern\.test\(processId\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /profile\.status !== "active"/);
  assert.match(route, /jsonError\("Proceso no encontrado\.", 404\)/);
  assert.match(route, /"Content-Type": "application\/pdf"/);
  assert.match(route, /"Content-Disposition": "attachment;/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.doesNotMatch(route, /service_role|createSupabaseAdminClient|\.insert\(|\.update\(|\.delete\(/);
});

test("readonly page and PDF endpoint share one read model", () => {
  assert.match(readonlyPage, /getProcessMasterReadModel\(processId\)/);
  assert.match(route, /getProcessMasterReadModel\(processId\)/);
  assert.match(readModel, /getProcessCatalogV2Item\(processId\)/);
  assert.match(readModel, /getProcessMatrixV2\(processId\)/);
  assert.match(readModel, /getProcessRoleProfilesForMaster/);
  assert.match(readModel, /getProcessMetricsForMaster/);
  assert.match(readModel, /getProcessRisksForMaster/);
});

test("new and historical groups use the same enabled PDF flow", () => {
  assert.match(catalog, /href=\{\x60\/api\/procesos\/\$\{process\.process_id\}\/pdf\x60\}/);
  assert.match(catalog, /download/);
  assert.doesNotMatch(catalog, /Descarga PDF proximamente|cursor-not-allowed|<FileType2|<button[\s\S]*disabled/);
  assert.match(catalog, /newProcesses,[\s\S]*historicalProcesses/);
});
