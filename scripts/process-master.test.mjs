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
const { validateProcessForActivation } = loadTsModule(
  "src/app/procesos/process-master/process-master-validation.ts",
);

const completeProcess = {
  active_stage_count: 1,
  area_id: "area-1",
  area_name: "Operaciones",
  basic_kpi: "Reservas completadas",
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
    inputs_providers: null,
    objective: null,
    outputs_clients: null,
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

const missingInputs = validateProcessForActivation({
  ...master,
  process: { ...master.process, inputs_providers: null },
});
assert.ok(missingInputs.missingFields.some((field) => field.key === "inputs_providers"));

const missingOutputs = validateProcessForActivation({
  ...master,
  process: { ...master.process, outputs_clients: null },
});
assert.ok(missingOutputs.missingFields.some((field) => field.key === "outputs_clients"));

const missingKpi = validateProcessForActivation({
  ...master,
  process: { ...master.process, basic_kpi: null },
});
assert.ok(missingKpi.missingFields.some((field) => field.key === "basic_kpi"));

const noStages = validateProcessForActivation({ ...master, stages: [] });
assert.ok(noStages.missingFields.some((field) => field.key === "active_stage"));

const stageWithoutOwner = validateProcessForActivation({
  ...master,
  stages: [{ ...master.stages[0], owner_role_id: null }],
});
assert.ok(stageWithoutOwner.missingFields.some((field) => field.key === "owner_role"));
assert.ok(stageWithoutOwner.warnings.some((warning) => warning.key.startsWith("stage_owner:")));

const noPerson = validateProcessForActivation({
  ...master,
  responsibility: { ...master.responsibility, owner_person_name: null },
});
assert.ok(noPerson.warnings.some((warning) => warning.key === "owner_person"));

const badImpact = validateProcessForActivation({
  ...master,
  stages: [{ ...master.stages[0], impact_percent: 80 }],
});
assert.ok(badImpact.warnings.some((warning) => warning.key === "impact_total"));

const criticalNoBackup = validateProcessForActivation({
  ...master,
  stages: [{ ...master.stages[0], backup_role_id: null, criticality: "critical" }],
});
assert.ok(criticalNoBackup.warnings.some((warning) => warning.key.startsWith("stage_backup:")));

console.log("process-master: 23/23 OK");
