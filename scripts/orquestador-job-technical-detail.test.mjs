import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const helperPath = "src/lib/orquestador/job-technical-detail.ts";
const routePath = "src/app/api/orquestador/jobs/[jobId]/detail/route.ts";
const buttonPath = "src/app/orquestador/job-technical-detail-button.tsx";
const recentProcessesPath = "src/app/orquestador/recent-processes.tsx";
const pagePath = "src/app/orquestador/page.tsx";
const controlCenterPath = "src/app/orquestador/orchestrator-control-center.tsx";
const supabaseAdminPath = "src/lib/orquestador/supabase-admin.ts";
const migrationPath = "supabase/migrations/20260730120000_create_orchestrator_job_technical_detail_rpc.sql";
const authPath = "src/lib/orquestador/auth.ts";
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });

const helper = readFileSync(helperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const button = readFileSync(buttonPath, "utf8");
const recentProcesses = readFileSync(recentProcessesPath, "utf8");
const page = readFileSync(pagePath, "utf8");
const controlCenter = readFileSync(controlCenterPath, "utf8");
const supabaseAdmin = readFileSync(supabaseAdminPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");
const auth = readFileSync(authPath, "utf8");
const clientSources = [button, page, recentProcesses].join("\n");
const serverSources = [helper, route, supabaseAdmin].join("\n");
const phoneCandidatePatternForTest = /(?<![\d:])\+?\d[\d\s().-]{7,}\d(?![\d:])/g;

function shouldSanitizePhoneCandidateForTest(value) {
  if (value.includes(":")) return false;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(trimmed) || /^\d{2}-\d{2}-\d{2,4}(?:\s|$)/.test(trimmed)) return false;
  return /^\+?56/.test(trimmed) || /^56/.test(digits) || /^9/.test(digits) || digits.length >= 10;
}

function sanitizeLikeTechnicalText(value) {
  if (/\b(password|passwd|secret|token|api[_-]?key|service[_-]?role|connection string|dsn)\b/i.test(value)) return null;
  const withoutEmail = value
    .replace(/\b[A-Z]:\\[^\s"'<>]+/gi, "[ruta local]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]");
  return withoutEmail.replace(phoneCandidatePatternForTest, (candidate) => (shouldSanitizePhoneCandidateForTest(candidate) ? "[telefono]" : candidate));
}

test("A. endpoint de ficha tecnica existe", () => {
  assert.equal(existsSync(routePath), true);
  assert.match(route, /export async function GET/);
  assert.match(route, /\/api\/orquestador\/jobs\/\$\{jobId\}\/detail|params/);
});

test("B. endpoint exige admin activo", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(auth, /profile\.app_role !== "admin"/);
  assert.match(auth, /profile\.status !== "active"/);
  assert.match(route, /401/);
  assert.match(route, /403/);
});

test("C. endpoint valida UUID", () => {
  assert.match(route, /uuidPattern/);
  assert.match(route, /!uuidPattern\.test\(jobId\)/);
  assert.match(route, /Job no encontrado/);
});

test("D. endpoint maneja 404 y errores seguros", () => {
  assert.match(route, /detail\.error/);
  assert.match(route, /!detail\.data/);
  assert.match(route, /No fue posible consultar el detalle tecnico del job/);
  assert.doesNotMatch(route, /error\.message|stack|details/);
});

test("E. backend lee un solo job mediante RPC publica", () => {
  assert.match(supabaseAdmin, /rpc\("orchestrator_get_job_technical_detail"/);
  assert.match(supabaseAdmin, /p_job_id: jobId/);
  assert.match(supabaseAdmin, /normalizeJobTechnicalDetailRpcResult\(data\)/);
  assert.match(supabaseAdmin, /typeof data\.id !== "string"/);
  assert.match(supabaseAdmin, /!isJsonRecordOrNull\(data\.result\)/);
  assert.doesNotMatch(supabaseAdmin, /schema\("ops_orchestrator"\)/);
  assert.doesNotMatch(supabaseAdmin, /from\("orchestrator_jobs"\)/);
  assert.doesNotMatch(supabaseAdmin, /\.maybeSingle\(\)/);
});

test("F. migracion define RPC jsonb de solo lectura para detalle tecnico", () => {
  assert.match(migration, /create or replace function public\.orchestrator_get_job_technical_detail\(p_job_id uuid\)/);
  assert.match(migration, /returns jsonb/);
  assert.match(migration, /language sql/);
  assert.match(migration, /stable/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /from ops_orchestrator\.orchestrator_jobs as j/);
  assert.match(migration, /where j\.id = p_job_id/);
});

test("F2. contrato RPC no incluye payload ni campos operativos crudos", () => {
  assert.match(migration, /'result', j\.result/);
  assert.doesNotMatch(migration, /'payload'|j\.payload|command_preview|stdout|stderr|metadata/);
  assert.match(supabaseAdmin, /mapJobTechnicalDetail\(row\)/);
});

test("F3. permisos RPC quedan restringidos a service_role", () => {
  assert.match(migration, /revoke all on function public\.orchestrator_get_job_technical_detail\(uuid\) from public/);
  assert.match(migration, /revoke execute on function public\.orchestrator_get_job_technical_detail\(uuid\) from anon/);
  assert.match(migration, /revoke execute on function public\.orchestrator_get_job_technical_detail\(uuid\) from authenticated/);
  assert.match(migration, /grant execute on function public\.orchestrator_get_job_technical_detail\(uuid\) to service_role/);
});

test("G. DTO seguro definido", () => {
  assert.match(helper, /export type JobTechnicalDetailViewModel/);
  assert.doesNotMatch(helper, /payload: JsonRecord/);
  for (const field of ["short_id", "job_label", "duration_seconds", "returncode", "timed_out", "execution_mode", "safe_error", "operational_summary", "safe_log_lines", "technical_output_available"]) {
    assert.match(helper, new RegExp(`${field}:`));
  }
});

test("H. no expone payload result crudo ni command preview", () => {
  assert.doesNotMatch(route, /payload\s*:/);
  assert.doesNotMatch(route, /result\s*:/);
  assert.doesNotMatch(button, /payload|stdout|stderr|command_preview|raw/i);
  assert.doesNotMatch(serverSources, /command_preview/);
});

test("I. parser encuentra JSON en logs alrededor", () => {
  assert.match(helper, /function collectJsonCandidatesFromText/);
  assert.match(helper, /JSON\.parse\(value\.slice\(start, index \+ 1\)\)/);
  assert.match(helper, /findJsonObjects/);
});

test("J. parser extrae metricas de Reservas", () => {
  for (const token of ["datos", "modo", "fecha_desde", "duracion_segundos", "total_validas", "insertadas", "actualizadas", "sin_cambios", "errores", "MCP", "MCP_BORRADOR", "OKP"]) {
    assert.match(helper, new RegExp(token));
  }
});

test("K. parser tolera faltantes y stdout sin JSON", () => {
  assert.match(helper, /return hasMetric \? summary : null/);
  assert.match(helper, /return \[\]/);
  assert.match(helper, /catch \{/);
});

test("L. sanitiza rutas emails telefonos secretos y limita lineas", () => {
  assert.match(helper, /localPathPattern/);
  assert.match(helper, /emailPattern/);
  assert.match(helper, /phoneCandidatePattern/);
  assert.match(helper, /shouldSanitizePhoneCandidate/);
  assert.match(helper, /sensitiveLinePattern/);
  assert.match(helper, /slice\(0, 40\)/);
  assert.match(helper, /maxLength - 3/);
});

test("M. Procesos recientes reemplaza Ultimos jobs sin columna tecnica", () => {
  assert.match(controlCenter, /RecentProcesses/);
  assert.match(controlCenter, /title="Procesos recientes"/);
  assert.doesNotMatch(controlCenter, /title="Ultimos jobs"|<DataTableHeaderCell>ID<\/DataTableHeaderCell>|<DataTableHeaderCell>Detalle<\/DataTableHeaderCell>|<JobTechnicalDetailButton jobId=\{job\.id\}/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Proceso<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Estado<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Equipo<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Intentos<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Creado<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Inicio<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Fin<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell>Error<\/DataTableHeaderCell>/);
  assert.match(recentProcesses, /<DataTableHeaderCell align="center"><span className="sr-only">Abrir ficha tecnica<\/span><\/DataTableHeaderCell>/);
  assert.doesNotMatch(recentProcesses, /<DataTableHeaderCell>ID<\/DataTableHeaderCell>|<DataTableHeaderCell>Detalle<\/DataTableHeaderCell>|Ver detalle/);
});

test("M1. Procesos recientes traduce tipos estados worker intentos y fechas", () => {
  for (const [jobType, label] of [
    ["banco_reservas_actualizar", "Actualizar Banco de Reservas"],
    ["banco_packs_actualizar", "Actualizar Banco de Packs"],
    ["banco_packs_actualizar_sin_consumos", "Actualizar Banco de Packs"],
    ["dashboard_actualizar_metricas", "Actualizar metricas del Dashboard"],
    ["dashboard_actualizar", "Actualizar Dashboard"],
    ["banco_personas_actualizar", "Actualizar Banco de Personas"],
    ["healthcheck_worker", "Probar equipo"],
    ["healthcheck_supabase", "Probar conexion"],
  ]) {
    assert.match(recentProcesses, new RegExp(`${jobType}: "${label}"`));
  }
  for (const label of ["Completado", "Error", "En ejecucion", "Pendiente", "Cancelado", "Estado no disponible"]) {
    assert.match(recentProcesses, new RegExp(label));
  }
  assert.match(recentProcesses, /return "Sin asignar"/);
  assert.match(recentProcesses, /\.replace\(\/\\bpc\\b\/i, "PC"\)/);
  assert.match(recentProcesses, /return `\$\{attempts\}\/\$\{maxAttempts\}`/);
  assert.match(recentProcesses, /day: "2-digit"/);
  assert.match(recentProcesses, /month: "2-digit"/);
  assert.match(recentProcesses, /year: "numeric"/);
  assert.match(recentProcesses, /hourCycle: "h23"/);
  assert.match(recentProcesses, /timeZone: "America\/Santiago"/);
  assert.match(recentProcesses, /formatToParts/);
  assert.doesNotMatch(recentProcesses, /dateStyle|timeStyle|a\. m\.|p\. m\.|second:/);
});

test("M2. fila y tarjeta completas abren ficha tecnica reutilizando el componente", () => {
  assert.match(recentProcesses, /role="button"/);
  assert.match(recentProcesses, /tabIndex=\{0\}/);
  assert.match(recentProcesses, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(recentProcesses, /focus-visible:outline/);
  assert.match(recentProcesses, /ChevronRight/);
  assert.match(recentProcesses, /aria-label=\{openDetailLabel\(job\)\}/);
  assert.match(recentProcesses, /<JobTechnicalDetailButton autoOpenKey=\{openToken\} hideTrigger jobId=\{selectedJobId\} \/>/);
  assert.match(button, /autoOpenKey/);
  assert.match(button, /hideTrigger/);
  assert.match(button, /void loadDetail\(\)/);
  assert.equal([...recentProcesses.matchAll(/fetch\(`/g)].length, 0);
  assert.equal([...button.matchAll(/fetch\(`\/api\/orquestador\/jobs\/\$\{jobId\}\/detail`/g)].length, 1);
});

test("M3. mobile usa tarjetas y no tabla horizontal", () => {
  assert.match(recentProcesses, /className="mt-5 hidden lg:block"/);
  assert.match(recentProcesses, /className="mt-5 grid gap-3 lg:hidden"/);
  assert.match(recentProcesses, /function RecentProcessMobileCard/);
  assert.match(recentProcesses, /<button[\s\S]*aria-label=\{openDetailLabel\(job\)\}[\s\S]*onClick=\{\(\) => onOpen\(job\)\}/);
  assert.match(recentProcesses, /Inicio/);
  assert.match(recentProcesses, /Duracion/);
  assert.match(recentProcesses, /Intentos \{formatAttempts\(job\.attempts, job\.max_attempts\)\}/);
});


test("N. UI abre modal accesible", () => {
  assert.match(button, /role="dialog"/);
  assert.match(button, /aria-modal="true"/);
  assert.match(button, /job-technical-detail-title/);
  assert.match(button, /Escape/);
});

test("O. UI muestra secciones esperadas", () => {
  for (const label of ["Resumen", "Ejecucion", "Resultado operacional", "Log tecnico sanitizado", "Return code", "Timeout", "Requested source"]) {
    assert.match(button, new RegExp(label));
  }
});

test("P. UI colapsa log por defecto", () => {
  assert.match(button, /isLogOpen/);
  assert.match(button, /Mostrar log/);
  assert.match(button, /Ocultar log/);
});

test("Q. UI es responsive y no fuerza overflow grave", () => {
  assert.match(button, /max-h-\[92vh\]/);
  assert.match(button, /w-full max-w-4xl/);
  assert.match(button, /overflow-y-auto/);
  assert.match(button, /sm:grid-cols-2|lg:grid-cols-3/);
});

test("R. cliente usa solo GET del endpoint seguro", () => {
  assert.match(button, /fetch\(`\/api\/orquestador\/jobs\/\$\{jobId\}\/detail`/);
  assert.doesNotMatch(button, /method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/);
  assert.doesNotMatch(clientSources, /createClient|\.rpc\(|SUPABASE_SERVICE_ROLE_KEY|schema\("ops_orchestrator"\)/);
});

test("S. no muestra stdout stderr crudos", () => {
  assert.match(helper, /safeTechnicalLogLines/);
  assert.match(helper, /safe_log_lines/);
  assert.doesNotMatch(button, /detail\.stdout|detail\.stderr|responseBody\.result/);
});

test("T. no crea jobs ni ejecuta POST", () => {
  assert.doesNotMatch(route + button, /orchestrator_create_job|createCompositeJobStep|method:\s*"POST"/);
});

test("U. no altera controles existentes", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/worker-health-check-button\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/source-connection-check-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-reservas-last-week-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/banco-packs-update-control\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/orquestador\/dashboard-last-month-control\.tsx$/m);
});

test("V. no toca recuperacion", () => {
  assert.doesNotMatch(diffNames, /^src\/app\/recuperacion|^src\/app\/api\/recuperacion|^scripts\/recovery|^supabase\/migrations/m);
});

test("W. sanitizador conserva horas y timestamps", () => {
  assert.equal(sanitizeLikeTechnicalText("12:01:20"), "12:01:20");
  assert.equal(sanitizeLikeTechnicalText("01:20"), "01:20");
  assert.equal(sanitizeLikeTechnicalText("2026-07-30T12:01:20"), "2026-07-30T12:01:20");
  assert.equal(sanitizeLikeTechnicalText("2026-07-30 12:01:20"), "2026-07-30 12:01:20");
  assert.equal(sanitizeLikeTechnicalText("30-07-26, 12:01 p. m."), "30-07-26, 12:01 p. m.");
  assert.equal(sanitizeLikeTechnicalText("2026-07-30T12:01:20-04:00"), "2026-07-30T12:01:20-04:00");
});

test("X. sanitizador oculta telefonos ficticios sin romper fecha/hora", () => {
  assert.equal(sanitizeLikeTechnicalText("Contacto +56 9 1234 5678"), "Contacto [telefono]");
  assert.equal(sanitizeLikeTechnicalText("Contacto 56912345678"), "Contacto [telefono]");
  assert.equal(sanitizeLikeTechnicalText("Contacto 9 1234 5678"), "Contacto [telefono]");
  assert.equal(sanitizeLikeTechnicalText("2026-07-30 12:01:20 contacto +56 9 1234 5678"), "2026-07-30 12:01:20 contacto [telefono]");
});

test("Y. sanitizador sigue ocultando emails rutas y secretos", () => {
  assert.equal(sanitizeLikeTechnicalText("correo prueba@example.test"), "correo [email]");
  assert.equal(sanitizeLikeTechnicalText("ruta C:\\Temp\\archivo.txt"), "ruta [ruta local]");
  assert.equal(sanitizeLikeTechnicalText("token ficticio"), null);
});

test("Z. helper server-side ya no registra diagnostico temporal", () => {
  assert.doesNotMatch(supabaseAdmin, /console\.error|operation: "getOrchestratorJobTechnicalDetail"|invalidResponseShape|unexpectedException|error\.code|error\.details|error\.hint/);
});