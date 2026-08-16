import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadTsModule(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const fn = new Function("module", "exports", output);
  fn(module, module.exports);
  return module.exports;
}

const mapperSource = fs.readFileSync(
  path.join(rootDir, "src/app/procesos/process-master/process-master-mapper.ts"),
  "utf8",
);
const validationSource = fs.readFileSync(
  path.join(rootDir, "src/app/procesos/process-master/process-master-validation.ts"),
  "utf8",
);
const typesSource = fs.readFileSync(
  path.join(rootDir, "src/app/procesos/process-master/process-master-types.ts"),
  "utf8",
);

assert.match(typesSource, /export type ProcessMasterMode = "create" \| "edit" \| "readonly"/);
assert.match(typesSource, /export type ProcessMasterDto/);
assert.match(typesSource, /inputs_providers: string \| null/);
assert.match(typesSource, /outputs_clients: string \| null/);
assert.match(typesSource, /basic_kpi: string \| null/);
assert.match(mapperSource, /export function mapProcessMasterDto/);
assert.match(validationSource, /export function validateProcessForActivation/);

const { mapProcessMasterDto } = loadTsModule("src/app/procesos/process-master/process-master-mapper.ts");
const { getProcessActivationCompleteness, validateProcessForActivation } = loadTsModule(
  "src/app/procesos/process-master/process-master-validation.ts",
);

const completeProcess = {
  active_stage_count: 1,
  area_id: "area-1",
  area_name: "Operaciones",
  basic_kpi: "Reservas completadas",
  process_code: "PROC-001",
  master_updated_at: "2026-08-13T12:00:00.000Z",
  version: "1.0",
  effective_date: "2026-08-11",
  process_start: "Cliente inicia solicitud",
  process_end: "Reserva queda cerrada",
  scope: "Reservas web y atencion",
  supplier_origin: "Cliente y sistema de reservas",
  process_inputs: "Solicitud y datos de pago",
  process_outputs: "Reserva confirmada",
  client_destination: "Cliente y Operaciones",
  pdca_plan: "Planificar capacidad",
  pdca_do: "Ejecutar reserva",
  pdca_check: "Revisar conversion",
  pdca_act: "Ajustar reglas",
  company_id: "company-1",
  company_name: "McParking",
  country_code: "CL",
  country_id: "country-1",
  country_name: "Chile",
  criticality: "high",
  current_person_ids: ["person-1"],
  current_person_names: ["Ana Perez"],
  definition: "Descripcion corta",
  documentation_status: "documented",
  expected_result: "Resultado esperado",
  inputs_providers: "Reservas y pagos",
  is_global: false,
  is_replicable: false,
  objective: "Objetivo del proceso",
  operating_company_id: "company-1",
  operating_company_name: "McParking",
  operating_company_type: "operator",
  operating_site_id: null,
  operating_site_name: null,
  outputs_clients: "Reserva confirmada",
  owner_company_id: "company-1",
  owner_company_name: "McParking",
  owner_company_type: "operator",
  owner_role_id: "role-1",
  owner_role_name: "Encargado de Operaciones",
  owner_person_id: "person-1",
  owner_person_name: "Ana Perez",
  owner_role_ids: ["role-1"],
  owner_role_names: ["Encargado de Operaciones"],
  owner_site_id: null,
  owner_site_name: null,
  process_id: "process-1",
  process_name: "Reservas McParking",
  process_type: "operational",
  status: "active",
  support_role_ids: ["role-2"],
  support_role_names: ["Analista de Datos"],
  support_role_types: ["user"],
};

const completeStage = {
  backup_person_name: "Pedro Backup",
  backup_role_company_name: "McParking",
  backup_role_name: "Supervisor de Operaciones",
  controls: null,
  criticality: "critical",
  impact_percent: 100,
  operating_company_name: "McParking",
  owner_company_name: "McParking",
  owner_person_name: "Ana Perez",
  owner_role_company_name: "McParking",
  owner_role_name: "Encargado de Operaciones",
  process_id: "process-1",
  process_name: "Reservas McParking",
  risks: null,
  sort_order: 1,
  subprocess_description: "Gestionar reserva",
  subprocess_id: "stage-1",
  subprocess_name: "Confirmar reserva",
  subprocess_status: "active",
  support_person_name: "Luis Apoyo",
  support_role_company_name: "McParking",
  support_role_name: "Analista de Datos",
  systems: null,
  user_person_name: "Maria Usuario",
  user_role_company_name: "McParking",
  user_role_name: "Ejecutivo de Atencion",
};

const master = mapProcessMasterDto({
  ownerRoleBySubprocess: { "stage-1": "role-1" },
  process: completeProcess,
  stageRoleIdsBySubprocess: {
    "stage-1": {
      backup_role_id: "role-4",
      support_role_ids: ["role-3"],
      user_role_id: "role-2",
    },
  },
  stages: [completeStage],
});

assert.equal(master.process.name, completeProcess.process_name, "mapper preserves name");
assert.equal(master.process.processCode, completeProcess.process_code, "mapper preserves process code");
assert.equal(master.process.version, completeProcess.version, "mapper preserves version");
assert.equal(master.process.masterUpdatedAt, completeProcess.master_updated_at, "mapper preserves master updated timestamp");
assert.equal(master.process.effectiveDate, completeProcess.effective_date, "mapper preserves effective date");
assert.equal(master.process.processStart, completeProcess.process_start, "mapper preserves process start");
assert.equal(master.process.processEnd, completeProcess.process_end, "mapper preserves process end");
assert.equal(master.process.scope, completeProcess.scope, "mapper preserves scope");
assert.equal(master.process.supplier_origin, completeProcess.supplier_origin, "mapper preserves supplier origin");
assert.equal(master.process.process_inputs, completeProcess.process_inputs, "mapper preserves separated inputs");
assert.equal(master.process.process_outputs, completeProcess.process_outputs, "mapper preserves separated outputs");
assert.equal(master.process.client_destination, completeProcess.client_destination, "mapper preserves client destination");
assert.deepEqual(master.process.pdca, {
  plan: completeProcess.pdca_plan,
  do: completeProcess.pdca_do,
  check: completeProcess.pdca_check,
  act: completeProcess.pdca_act,
}, "mapper preserves PDCA fields");
assert.equal(master.process.objective, completeProcess.objective, "mapper preserves objective");
assert.equal(master.process.expected_result, completeProcess.expected_result, "mapper preserves expected_result");
assert.equal(master.process.inputs_providers, completeProcess.inputs_providers, "mapper preserves inputs_providers");
assert.equal(master.process.outputs_clients, completeProcess.outputs_clients, "mapper preserves outputs_clients");
assert.equal(master.process.basic_kpi, completeProcess.basic_kpi, "mapper preserves basic_kpi");
assert.equal(master.responsibility.owner_role_id, "role-1", "mapper maps owner role");
assert.equal(master.responsibility.owner_person_name, "Ana Perez", "mapper maps derived person");
assert.equal(master.stages.length, 1, "mapper maps active stages");
assert.equal(master.stages[0].name, "Confirmar reserva", "mapper maps stage name");
assert.equal(master.stages[0].user_role_id, "role-2", "mapper maps user role id when provided");
assert.deepEqual(master.stages[0].support_role_ids, ["role-3"], "mapper maps support role ids when provided");
assert.equal(master.stages[0].backup_role_id, "role-4", "mapper maps backup role id when provided");

const nullMaster = mapProcessMasterDto({
  process: {
    ...completeProcess,
    basic_kpi: null,
    current_person_ids: [],
    current_person_names: [],
    effective_date: null,
    inputs_providers: null,
    objective: null,
    pdca_plan: null,
    pdca_do: null,
    pdca_check: null,
    pdca_act: null,
    process_code: null,
    master_updated_at: null,
    process_start: null,
    process_end: null,
    scope: null,
    supplier_origin: null,
    process_inputs: null,
    process_outputs: null,
    client_destination: null,
    version: null,
    outputs_clients: null,
    owner_role_id: null,
    owner_role_name: null,
    owner_person_id: null,
    owner_person_name: null,
    owner_role_ids: [],
    owner_role_names: [],
  },
  stages: [
    {
      ...completeStage,
      impact_percent: null,
      owner_person_name: null,
      owner_role_name: null,
      subprocess_status: "active",
    },
  ],
});

assert.equal(nullMaster.process.inputs_providers, null, "mapper preserves null inputs");
assert.equal(nullMaster.process.processCode, null, "mapper preserves null process code");
assert.equal(nullMaster.process.effectiveDate, null, "mapper preserves null effective date");
assert.deepEqual(nullMaster.process.pdca, { plan: null, do: null, check: null, act: null }, "mapper preserves null PDCA fields");
assert.equal(nullMaster.responsibility.owner_role_id, null, "mapper does not invent owner role");
assert.equal(nullMaster.responsibility.owner_person_name, null, "mapper does not invent person");

const valid = validateProcessForActivation(master);
assert.equal(valid.isValid, true, "complete process is valid");
assert.equal(valid.missingFields.length, 0, "complete process has no blocking fields");

const missingObjective = validateProcessForActivation({
  ...master,
  process: { ...master.process, objective: null },
});
assert.equal(missingObjective.isValid, false, "missing objective blocks activation");
assert.ok(missingObjective.missingFields.some((field) => field.key === "objective"));

for (const field of ["supplier_origin", "process_inputs", "process_outputs", "client_destination"]) {
  const missingFlowField = validateProcessForActivation({
    ...master,
    process: { ...master.process, [field]: null },
  });
  assert.ok(missingFlowField.missingFields.some((item) => item.key === field), `${field} blocks activation`);
}

const noStages = validateProcessForActivation({ ...master, stages: [] });
assert.ok(noStages.missingFields.some((field) => field.key === "active_stage"));

const stageWithoutLegacyFields = validateProcessForActivation({
  ...master,
  stages: [{
    ...master.stages[0],
    backup_role_id: null,
    criticality: "critical",
    impact_percent: null,
    owner_role_id: null,
    support_role_ids: [],
  }],
});
assert.equal(stageWithoutLegacyFields.isValid, true, "stage legacy fields do not block activation");
const noPerson = validateProcessForActivation({
  ...master,
  responsibility: { ...master.responsibility, owner_person_name: null },
});
assert.ok(noPerson.warnings.some((warning) => warning.key === "owner_person"));

const completeness = getProcessActivationCompleteness(missingObjective);
assert.equal(completeness.blockingCount, missingObjective.missingFields.length, "completeness exposes blocking count");
assert.ok(completeness.completionPercent < 100, "missing blocking field lowers completion");

console.log("process-master: 46/46 OK");