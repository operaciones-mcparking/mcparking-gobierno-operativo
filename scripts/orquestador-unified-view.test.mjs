import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const orquestadorPagePath = "src/app/orquestador/page.tsx";
const controlCenterPath = "src/app/orquestador/orchestrator-control-center.tsx";
const dashboardViewPath = "src/app/orquestador/orchestrator-dashboard-view.tsx";
const tabsPath = "src/app/orquestador/orchestrator-view-tabs.tsx";
const oldDashboardPagePath = "src/app/dashboard-operacional/page.tsx";
const dashboardClientPath = "src/app/dashboard-operacional/dashboard-operacional-client.tsx";
const dashboardEndpointPath = "src/app/api/dashboard/operacional/route.ts";
const shellPath = "src/components/dashboard/shell.tsx";
const panelPath = "src/components/dashboard/panel.tsx";
const customerWindowViewPath = "src/app/orquestador/customer-window-view.tsx";

const orquestadorPage = readFileSync(orquestadorPagePath, "utf8");
const controlCenter = readFileSync(controlCenterPath, "utf8");
const dashboardView = readFileSync(dashboardViewPath, "utf8");
const tabs = readFileSync(tabsPath, "utf8");
const oldDashboardPage = readFileSync(oldDashboardPagePath, "utf8");
const dashboardClient = readFileSync(dashboardClientPath, "utf8");
const dashboardEndpoint = readFileSync(dashboardEndpointPath, "utf8");
const shell = readFileSync(shellPath, "utf8");
const panel = readFileSync(panelPath, "utf8");
const customerWindowView = readFileSync(customerWindowViewPath, "utf8");
const diffNames = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" });
const allNewSources = [orquestadorPage, controlCenter, dashboardView, tabs, oldDashboardPage, dashboardClient].join("\n");

test("A. /orquestador sigue admin-only y force-dynamic", () => {
  assert.equal(existsSync(orquestadorPagePath), true);
  assert.match(orquestadorPage, /export const dynamic = "force-dynamic"/);
  assert.match(orquestadorPage, /requireAdminAccess\(\)/);
  assert.match(orquestadorPage, /DashboardShell/);
  assert.match(orquestadorPage, /activePath="\/orquestador"/);
});

test("B. dashboard es la vista por defecto y valores invalidos caen en dashboard", () => {
  assert.match(orquestadorPage, /function resolveView/);
  assert.match(orquestadorPage, /requestedView === "control" \|\| requestedView === "customer-window"/);
  assert.match(orquestadorPage, /return "dashboard"/);
  assert.match(orquestadorPage, /resolvedSearchParams\?\.view/);
});

test("C. las tres vistas se renderizan sin duplicar sus implementaciones", () => {
  assert.match(orquestadorPage, /activeView === "control" \? <OrchestratorControlCenter \/> : null/);
  assert.match(orquestadorPage, /activeView === "customer-window" \? <CustomerWindowView \/> : null/);
  assert.match(orquestadorPage, /activeView === "dashboard" \? <OrchestratorDashboardView \/> : null/);
  assert.match(controlCenter, /ActualizarDatosOperacionalesControl/);
  assert.match(controlCenter, /WorkerHealthCheckButton/);
  assert.match(controlCenter, /listOrchestratorWorkers/);
  assert.match(controlCenter, /listOrchestratorJobs/);
  assert.doesNotMatch(controlCenter, /DashboardShell|requireAdminAccess/);
});

test("D. dashboard reutiliza capa existente sin duplicar logica", () => {
  assert.match(dashboardView, /DashboardOperacionalClient/);
  assert.match(dashboardView, /getOperationalDashboardRpcData/);
  assert.match(dashboardView, /normalizeOperationalDashboardRpcResult/);
  assert.doesNotMatch(dashboardView, /<main|DashboardShell|\.from\(|schema\("ops_orchestrator"\)/);
});

test("E. selector mantiene /orquestador y query param view", () => {
  assert.match(tabs, /"use client"/);
  assert.match(tabs, /useRouter/);
  assert.match(tabs, /router\.replace\(`\/orquestador\?view=\$\{view\}`/);
  assert.match(tabs, /Dashboard/);
  assert.match(tabs, /Centro de Control/);
  assert.match(tabs, /aria-selected/);
  assert.doesNotMatch(tabs, /dashboard-operacional|method: "POST"|fetch\(/);
});

test("F. /dashboard-operacional redirige al dashboard dentro de /orquestador", () => {
  assert.match(oldDashboardPage, /redirect\("\/orquestador\?view=dashboard"\)/);
  assert.doesNotMatch(oldDashboardPage, /DashboardOperacionalClient|getOperationalDashboardRpcData|requireAdminAccess/);
});

test("G. menu lateral conserva solo item Operaciones hacia /orquestador", () => {
  assert.match(shell, /href: "\/orquestador"/);
  assert.match(shell, /label: "Operaciones"/);
  assert.doesNotMatch(shell, /dashboard-operacional/);
});

test("H. dashboard embebido no navega a /dashboard-operacional ni duplica encabezado", () => {
  assert.doesNotMatch(dashboardClient, /href="\/dashboard-operacional"/);
  assert.doesNotMatch(dashboardClient, /McParking Orquestador|Centro de Control|<main/);
  assert.match(dashboardClient, /requestDashboardRange\(range\)/);
  assert.match(dashboardClient, /requestOccupancyRange\(range\)/);
  assert.match(dashboardClient, /method: "GET"/);
});

test("I. no hay POST nuevo ni creacion de jobs en la unificacion", () => {
  assert.doesNotMatch(allNewSources, /method: "POST"|export async function POST|orchestrator_create_job|createCompositeJobStep/);
  assert.match(dashboardEndpoint, /export async function GET/);
});

test("J. separa Panel para clientes sin mover auth al browser ni cambiar navegacion", () => {
  assert.match(shell, /getCurrentAccessContext/);
  assert.match(shell, /export \{ Panel \} from "@\/components\/dashboard\/panel"/);
  assert.match(customerWindowView, /Panel \} from "@\/components\/dashboard\/panel"/);
  assert.doesNotMatch(customerWindowView + panel, /@\/lib\/auth\/access|server-only|createSupabaseAuthServerClient/);
  assert.doesNotMatch(diffNames, /^src\/components\/dashboard\/mobile-navigation\.tsx$/m);
  assert.doesNotMatch(diffNames, /^src\/app\/api\/recuperacion|^scripts\/recovery/m);
});
