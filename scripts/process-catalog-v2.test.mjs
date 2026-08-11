import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const catalogPath = path.join(rootDir, "supabase", "seeds", "process_catalog_v2.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const processes = catalog.processes;
const mojibakePattern = /Ã.|Â.|�|DirecciÃ|PlanificaciÃ|VehÃ|AtenciÃ/;
const mainMigrationForEncoding = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "20260810160000_prepare_process_catalog_v2.sql"), "utf8");
const catalogTextForEncoding = fs.readFileSync(catalogPath, "utf8");
assert.doesNotMatch(catalogTextForEncoding, mojibakePattern, "catalog seed must not contain mojibake");
assert.doesNotMatch(mainMigrationForEncoding, mojibakePattern, "main process catalog migration must not contain mojibake");

assert.equal(catalog.version, "process_catalog_v2");
assert.equal(catalog.source_a.status, "available_locally");
assert.equal(catalog.source_b.status, "available_locally");
assert.equal(processes.length, 19, "catalog must contain exactly 19 processes");

const counts = processes.reduce((acc, process) => {
  acc[process.process_type] = (acc[process.process_type] ?? 0) + 1;
  return acc;
}, {});

assert.equal(counts.strategic, 4, "expected 4 strategic processes");
assert.equal(counts.operational, 8, "expected 8 operational processes");
assert.equal(counts.support, 7, "expected 7 support processes");
const expectedStageCountsByProcess = new Map([
  ["Revenue Management", 5],
  ["Dirección y Planificación Operacional", 4],
  ["Estrategia Comercial y Alianzas", 5],
  ["Planificación de Capacidad y Ocupación", 4],
  ["Reservas McParking", 6],
  ["Cotización y Reserva Online", 4],
  ["Check-in y Recepción del Vehículo", 5],
  ["Custodia del Vehículo", 5],
  ["Traslado al Aeropuerto", 4],
  ["Atención al Cliente Operacional", 5],
  ["Check-out y Entrega del Vehículo", 5],
  ["Gestión de Incidencias Operativas", 5],
  ["Cierre Operacional, Liquidación y Cobranza a Inversionistas", 5],
  ["Finanzas y Contabilidad", 5],
  ["Sistemas y Datos", 5],
  ["Infraestructura y Mantenciones", 6],
  ["Personas y Turnos", 5],
  ["Gestión de Proveedores", 5],
  ["Control Documental y Administración", 6],
]);

const totalStageCount = processes.reduce((total, process) => total + process.stages.length, 0);
assert.equal(totalStageCount, 94, "catalog must contain exactly 94 V2 stages");

for (const [processName, expectedStageCount] of expectedStageCountsByProcess) {
  const process = processes.find((item) => item.name === processName);
  assert.ok(process, `missing process for expected stage count ${processName}`);
  assert.equal(process.stages.length, expectedStageCount, `unexpected stage count for ${processName}`);
}


const keys = new Set();
const names = new Set();
const allowedTypes = new Set(["strategic", "operational", "support"]);
const forbiddenNamePattern = /demo mapa|contabilidad test|teeeest|proceso demo mapa|test1l/i;
const requiredFields = [
  "objective",
  "inputs_providers",
  "outputs_clients",
  "basic_kpi",
  "owner_role_name",
];

for (const process of processes) {
  assert.ok(process.canonical_key, "process canonical_key is required");
  assert.ok(!keys.has(process.canonical_key), `duplicate canonical_key ${process.canonical_key}`);
  keys.add(process.canonical_key);

  assert.ok(process.name, "process name is required");
  assert.ok(!names.has(process.name), `duplicate process name ${process.name}`);
  names.add(process.name);

  assert.ok(allowedTypes.has(process.process_type), `invalid process type ${process.process_type}`);
  assert.equal(process.status, "active", `${process.name} must be active in the seed`);
  assert.ok(!forbiddenNamePattern.test(process.name), `forbidden demo/test process ${process.name}`);

  for (const field of requiredFields) {
    assert.equal(typeof process[field], "string", `${process.name}.${field} must be a string`);
    assert.ok(process[field].trim().length > 0, `${process.name}.${field} must not be blank`);
  }

  assert.ok(Array.isArray(process.stages), `${process.name} stages must be an array`);
  assert.ok(process.stages.length > 0, `${process.name} must have stages from Fuente B`);

  const stageOrders = new Set();
  const stageNames = new Set();
  for (const stage of process.stages) {
    assert.ok(stage.name, `${process.name} stage name is required`);
    assert.ok(!/^(test8|aaaaaaa)$/i.test(stage.name), `${process.name} includes test stage ${stage.name}`);
    assert.ok(!stageNames.has(stage.name), `${process.name} duplicate stage ${stage.name}`);
    stageNames.add(stage.name);
    assert.equal(typeof stage.sort_order, "number", `${process.name}.${stage.name} sort_order must be numeric`);
    assert.ok(stage.sort_order > 0, `${process.name}.${stage.name} sort_order must be positive`);
    assert.ok(!stageOrders.has(stage.sort_order), `${process.name} duplicate stage sort_order ${stage.sort_order}`);
    stageOrders.add(stage.sort_order);
  }
}

const expectedControlProcesses = [
  "Revenue Management",
  "Reservas McParking",
  "Finanzas y Contabilidad",
  "Control Documental y Administración",
];

for (const name of expectedControlProcesses) {
  const process = processes.find((item) => item.name === name);
  assert.ok(process, `missing control process ${name}`);
  for (const field of requiredFields) {
    assert.ok(process[field].trim().length > 0, `${name}.${field} must be populated from Fuente A`);
  }
}


const validOwnerClassifications = new Set(["EXACTO", "EQUIVALENTE_SEGURO", "AMBIGUO", "INEXISTENTE"]);
const validSupportClassifications = new Set(["EXACTO", "EQUIVALENTE_SEGURO", "AMBIGUO", "NO_ES_ROL", "INEXISTENTE"]);
const roleResolution = catalog.preflight_3a?.role_resolution;
assert.ok(roleResolution, "preflight_3a.role_resolution is required");

for (const process of processes) {
  const ownerResolution = roleResolution.owner_roles?.[process.owner_role_name];
  assert.ok(ownerResolution, `${process.name} owner role must have preflight resolution`);
  assert.ok(validOwnerClassifications.has(ownerResolution.classification), `${process.name} owner role classification is invalid`);
  for (const supportRole of process.support_roles ?? []) {
    assert.equal(typeof supportRole, "string", `${process.name} support role must be a string`);
    assert.ok(supportRole.trim().length > 0, `${process.name} support role must not be blank`);
    const supportResolution = roleResolution.support_roles?.[supportRole];
    assert.ok(supportResolution, `${process.name} support role ${supportRole} must have preflight resolution`);
    assert.ok(validSupportClassifications.has(supportResolution.classification), `${process.name} support role ${supportRole} classification is invalid`);
  }
}


const mainMigrationPath = path.join(rootDir, "supabase", "migrations", "20260810160000_prepare_process_catalog_v2.sql");
const reconcileMigrationPath = path.join(rootDir, "supabase", "migrations", "20260811143000_reconcile_process_catalog_v2_stages.sql");
const mainMigrationSql = fs.readFileSync(mainMigrationPath, "utf8");
const reconcileMigrationSql = fs.readFileSync(reconcileMigrationPath, "utf8");

assert.match(mainMigrationSql, /Archive active legacy stages under target processes/i, "main migration must archive non-v2 legacy stages for future installs");
assert.match(mainMigrationSql, /not exists \(\s*select 1\s*from _process_catalog_v2_stage/i, "main migration must compare active stages against Fuente B catalog");
assert.match(mainMigrationSql, /-- active subprocesses = 94/i, "main migration postcheck comments must expect 94 active stages");

const legacyStageIdsToArchive = [
  "88188b89-13c7-46ce-a0a7-a227ba8d6024",
  "41a75020-30d6-4f0f-a5ee-809ee4d0d537",
  "c5ad56f5-e456-48d0-bd24-2599e9bbffa7",
  "6de322e7-4b67-4db3-9609-75d198b2f935",
  "83dd3297-f9b8-4af4-8233-732cd35db067",
  "0f7199d9-6042-4503-b6fa-ccde6ba75131",
  "a7425934-c8ff-4607-9c10-28948187c8bf",
  "23389806-087b-474e-8336-7aab1b75200c",
  "19035b37-5ad2-47e2-9b1d-ef172ca38189",
  "f995a93e-bdc7-4d6a-9a9c-a89da4da6b26",
  "b99f0c71-78aa-4f75-89b0-cc56204bf23b",
  "0fff1b5e-3cd1-46f1-b656-1b8751648d2c",
  "f9605417-7d93-44bf-a14e-733325ba47d1",
  "d1e4e4c0-0428-43c4-9c3f-fbedd427ffb7",
  "acf3d518-6fc3-4ef6-a2fa-2108dbc332a0",
];

assert.match(reconcileMigrationSql, /\bbegin;[\s\S]*\bcommit;\s*$/i, "reconcile migration must be transactional");
assert.doesNotMatch(reconcileMigrationSql, /\bdelete\b|\btruncate\b|drop\s+table|alter\s+table/i, "reconcile migration must not delete, truncate, drop, or alter tables");
assert.match(reconcileMigrationSql, /status = 'archived'::public\.record_status/i, "reconcile migration must archive rows instead of deleting them");
assert.match(reconcileMigrationSql, /active_stage_count <> 109/i, "reconcile migration must guard the pre-state of 109 active stages");
assert.match(reconcileMigrationSql, /active_stage_count <> 94/i, "reconcile migration must guard the post-state of 94 active stages");

for (const id of legacyStageIdsToArchive) {
  const occurrences = reconcileMigrationSql.match(new RegExp(id, "g"))?.length ?? 0;
  assert.equal(occurrences, 1, `reconcile migration must include legacy stage ${id} exactly once`);
}

assert.ok(!reconcileMigrationSql.includes("2259cb96-c673-4eee-b1ca-cd5b3ad44d00', 'Reservas McParking', 'test8'"), "reconcile migration must not re-archive test8 as part of the 15 legacy stages");
assert.ok(!reconcileMigrationSql.includes("3ef009cc-cf96-475a-a33c-188d0f46203f', 'Cierre Operacional"), "reconcile migration must not re-archive aaaaaaa as part of the 15 legacy stages");


const restoreMigrationPath = path.join(rootDir, "supabase", "migrations", "20260811160000_restore_process_catalog_v2_active_stages.sql");
const restoreMigrationSql = fs.readFileSync(restoreMigrationPath, "utf8");

assert.match(restoreMigrationSql, /\bbegin;[\s\S]*\bcommit;\s*$/i, "restore migration must be transactional");
assert.doesNotMatch(restoreMigrationSql, /\bdelete\b|\btruncate\b|drop\s+table|alter\s+table/i, "restore migration must not delete, truncate, drop, or alter tables");
assert.match(restoreMigrationSql, /update public\.subprocesses sp\s+set status = 'active'::public\.record_status/i, "restore migration must only restore subprocess status to active");
assert.match(restoreMigrationSql, /active_subprocess_count <> 0/i, "restore migration must guard the accidental zero-active pre-state");
assert.match(restoreMigrationSql, /active_subprocess_count <> 94/i, "restore migration must guard the 94-active post-state");
assert.match(restoreMigrationSql, /archived_subprocess_count <> 17/i, "restore migration must guard the 17-archived post-state");

for (const process of processes) {
  for (const stage of process.stages) {
    assert.ok(restoreMigrationSql.includes(process.name), `restore migration must include process ${process.name}`);
    assert.ok(restoreMigrationSql.includes(stage.name), `restore migration must include stage ${process.name} / ${stage.name}`);
  }
}


assert.match(restoreMigrationSql, /create temporary table _process_catalog_v2_uuid_to_restore/i, "restore migration must restore by exact UUID set");
assert.match(restoreMigrationSql, /where sp.id = v2.id/i, "restore migration update must match by UUID");
assert.match(restoreMigrationSql, /intersection_count <> 0/i, "restore migration must guard V2/excluded UUID intersection");
assert.doesNotMatch(restoreMigrationSql, /join public.processes ps+on p.name = target.process_name[sS]*update public.subprocesses/i, "restore migration must not depend on process/stage names for update");

const ownerAlignmentMigrationPath = path.join(rootDir, "supabase", "migrations", "20260811193000_align_process_owners_with_official_roles.sql");
const ownerAlignmentMigrationSql = fs.readFileSync(ownerAlignmentMigrationPath, "utf8");

assert.match(ownerAlignmentMigrationSql, /\bbegin;[\s\S]*\bcommit;\s*$/i, "owner alignment migration must be transactional");
assert.doesNotMatch(ownerAlignmentMigrationSql, /\bdelete\b|\btruncate\b|drop\s+table|alter\s+table/i, "owner alignment migration must not remove rows or alter tables");
assert.match(ownerAlignmentMigrationSql, /Expected 20 active processes before owner alignment/i, "owner alignment migration must guard 20 active processes before applying");
assert.match(ownerAlignmentMigrationSql, /Expected 19 active processes after owner alignment/i, "owner alignment migration must guard 19 active processes after applying");
assert.match(ownerAlignmentMigrationSql, /Expected 94 active subprocesses after owner alignment/i, "owner alignment migration must preserve 94 active subprocesses");
assert.match(ownerAlignmentMigrationSql, /status = 'archived'::public\.record_status/i, "owner alignment migration must archive test1 by status");
assert.match(ownerAlignmentMigrationSql, /process_roles row count changed unexpectedly/i, "owner alignment migration must preserve process_roles row count");

const ownerAlignmentExpectedSnippets = [
  "75ed7877-db45-41e5-bc12-f3a616eb0eae",
  "41eb1c42-7707-4f17-89c5-827725d81f9d",
  "ce2bfa79-102d-42a3-b8d0-3977831d04f8",
  "4d09da28-e81c-4b0e-9bb5-a237445b043f",
  "bad04303-dea5-4db7-9b1b-6ec875e6e9c3",
  "d5aeb1c1-d306-415b-be7f-1cc5397ae7c1",
  "56347ff9-295e-40e9-9f67-9cac155605bf",
  "b6e8fc21-4fd0-4993-abd6-cecd89424844",
  "bc9176e9-e97c-4739-9b7e-c183d17e3123",
  "a062ec7d-1af6-42b7-adda-28ad71b4323f",
];

for (const snippet of ownerAlignmentExpectedSnippets) {
  assert.ok(ownerAlignmentMigrationSql.includes(snippet), `owner alignment migration must include ${snippet}`);
}

assert.match(ownerAlignmentMigrationSql, /v_updated <> 6/i, "owner alignment migration must update 6 Revenue owner rows");
assert.equal(ownerAlignmentMigrationSql.match(/v_updated <> 5/g)?.length, 2, "owner alignment migration must update two groups of 5 owner rows");
assert.match(ownerAlignmentMigrationSql, /pr\.role_id not in \(/i, "owner alignment migration must reject non-official owner roles after applying");

console.log("process-catalog-v2: 19/19 OK");
