import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("src/app/api/orquestador/source-connection-check/route.ts", "utf8");
const control = readFileSync("src/app/orquestador/source-connection-check-control.tsx", "utf8");
const page = readFileSync("src/app/orquestador/page.tsx", "utf8");
const admin = readFileSync("src/lib/orquestador/auth.ts", "utf8");
const supabaseAdmin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const types = readFileSync("src/lib/orquestador/types.ts", "utf8");

test("source connection endpoint is admin-only", () => {
  assert.match(route, /getActiveAdminUser/);
  assert.match(admin, /app_role !== "admin"/);
  assert.match(admin, /profile\.status !== "active"/);
});

test("source connection endpoint rejects useful body and query params", () => {
  assert.match(route, /request\.nextUrl\.searchParams\.size > 0/);
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /body\.trim\(\)\.length > 0/);
  assert.match(route, /La solicitud no debe incluir contenido/);
  assert.doesNotMatch(route, /request\.json\(/);
  assert.doesNotMatch(route, /request\.formData\(/);
});

test("source connection creation uses fixed job type and payload", () => {
  assert.match(supabaseAdmin, /p_job_type: "source_connection_check"/);
  assert.match(supabaseAdmin, /p_payload: \{\}/);
  assert.match(supabaseAdmin, /p_requested_source: "web"/);
  assert.match(supabaseAdmin, /p_target_worker_id: null/);
  assert.match(supabaseAdmin, /p_priority: 100/);
  assert.doesNotMatch(route, /body\.(source_key|host|port|database|user|password|sql|command|action|args)/);
  assert.doesNotMatch(route, /p_(source_key|host|port|database|user|password|sql|command|action|args)/);
});

test("source connection endpoint validates job type enabled before creating", () => {
  assert.match(route, /getOrchestratorJobType\(sourceConnectionJobType\)/);
  assert.match(route, /!jobType\.data/);
  assert.match(route, /!jobType\.data\.enabled/);
  assert.match(route, /La prueba de conexion esta deshabilitada/);
  assert.ok(route.indexOf("getOrchestratorJobType(sourceConnectionJobType)") < route.indexOf("createSourceConnectionCheckJob(admin.user.id)"));
});

test("UI disables source connection control when enabled is false", () => {
  assert.match(page, /sourceConnectionJobType\?\.enabled === true/);
  assert.match(control, /disabled=\{!enabled \|\| isSubmitting\}/);
  assert.match(control, /if \(isSubmitting \|\| !enabled\)/);
  assert.match(control, /La prueba esta registrada, pero deshabilitada por seguridad/);
});

test("source connection UI has independent state and endpoint", () => {
  assert.match(control, /useState<CreatedJob \| null>/);
  assert.match(control, /\/api\/orquestador\/source-connection-check/);
  assert.doesNotMatch(control, /\/api\/orquestador\/health-check/);
  assert.match(control, /source_connection_check/);
  assert.doesNotMatch(control, /health_check_result/);
});

test("source connection UI exposes only safe success fields", () => {
  assert.match(types, /source_connection_result/);
  assert.match(types, /source_key: safeString\(result\.source_key\)/);
  assert.match(types, /checked_at: safeString\(result\.checked_at\)/);
  assert.match(types, /duration_ms: safeNumber\(result\.duration_ms\)/);
  assert.match(types, /read_only: safeBoolean\(result\.read_only\)/);
  assert.match(types, /worker_id: safeString\(result\.worker_id\)/);
  assert.match(control, /Solo lectura confirmado/);
  assert.match(control, /Duracion/);
  assert.match(control, /Fecha\/hora de comprobacion/);
});

test("source connection failed state never displays raw error", () => {
  assert.match(control, /No fue posible verificar la fuente restringida/);
  assert.doesNotMatch(control, /error_message/);
});

test("source connection polling is abortable and bounded", () => {
  assert.match(control, /AbortController/);
  assert.match(control, /abortControllerRef\.current\?\.abort\(\)/);
  assert.match(control, /document\.visibilityState/);
  assert.match(control, /attempt < 30/);
});