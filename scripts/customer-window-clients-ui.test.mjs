import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/orquestador/page.tsx", "utf8");
const tabs = readFileSync("src/app/orquestador/orchestrator-view-tabs.tsx", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const panel = readFileSync("src/components/dashboard/panel.tsx", "utf8");

test("navigation adds Customer Window without changing the default dashboard", () => {
  assert.match(tabs, /Dashboard[\s\S]*Customer Window[\s\S]*Centro de Control/);
  assert.match(page, /requestedView === "control" \|\| requestedView === "customer-window"/);
  assert.match(view, /Clientes[\s\S]*Campañas[\s\S]*Próximamente/);
});

test("legacy typed point search stays removed while v2 unified search is server-side", () => {
  assert.doesNotMatch(view, /Buscar cliente específico|Busca por una identidad|searchCustomers|searchOptions/);
  assert.doesNotMatch(view, /customer-search-type|customer-search-value|normalizeCustomerSearchValue/);
  assert.doesNotMatch(view, /searchType|setSearchType|setResults/);
  assert.match(view, /customer-window-v2-search/);
  assert.match(view, /action: "search-v2"/);
  assert.match(view, /normalizeCustomerWindowRepresentationSearchV2/);
});

test("customer controls and operational summary use the compact responsive layout", () => {
  assert.match(view, /aria-label="Controles de clientes"[\s\S]*<CustomerPeriodSelector[\s\S]*htmlFor="customer-window-v2-search"/);
  assert.match(view, /lg:grid-cols-\[minmax\(340px,auto\)_minmax\(320px,1fr\)\]/);
  assert.match(view, /lg:items-start/);
  assert.match(view, /<span className="text-xs leading-4 text-slate-600">Periodo<[\s\S]*<span className="text-xs leading-4 text-slate-600">Rango seleccionado<[\s\S]*className="block text-xs font-medium leading-4 text-slate-600"/);
  assert.doesNotMatch(view, /aria-label="Buscar representaciones"|aria-label="Filtros de clientes"/);
  assert.match(view, /aria-label="Estado de actualización de Customer Window"[\s\S]*mt-3[\s\S]*gap-x-5[\s\S]*Frecuencia esperada:/);
  assert.match(view, /aria-label="Resumen de representaciones del período" className="mt-3/);
  assert.match(view, /rows\.map\(\(row\) => <div className="px-4 py-2\.5"/);
});

test("search selections carry their own related authority while period rows keep the health fallback", () => {
  assert.match(view, /selectSearchRepresentation[\s\S]*authoritySnapshotId: null[\s\S]*authoritySnapshotId: item\.authoritySnapshotId/);
  assert.match(view, /resolvedAuthoritySnapshotId = representation\?\.representationType === "related_review"[\s\S]*representation\.authoritySnapshotId \?\? activeSnapshotId/);
  assert.match(view, /customer360LocatorFromRepresentation\(\{[\s\S]*activeSnapshotId: resolvedAuthoritySnapshotId/);
  assert.doesNotMatch(view.slice(view.indexOf("function selectSearchRepresentation"), view.indexOf("async function changeTimelinePage")), /refreshHealth/);
  assert.doesNotMatch(view.slice(view.indexOf("function normalizeRepresentationListForUi"), view.indexOf("function displayOptionalCount")), /authoritySnapshotId/);
  assert.match(view, /<Customer360Drawer activeSnapshotId=\{refreshHealth\?\.activeSnapshotId \?\? null\}/);
});

test("admin-only endpoint rejects invalid inputs and caps page size", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /isCustomerSearchType\(type\)/);
  assert.match(route, /uuidPattern\.test\(customerId\)/);
  assert.match(route, /boundedInteger\(request\.nextUrl\.searchParams\.get\("pageSize"\), 20, 100\)/);
  assert.match(route, /action === "criteria"/);
  assert.match(route, /action === "search-v2"/);
  assert.match(route, /action === "search"[\s\S]*action === "summary"[\s\S]*action === "bookings"/);
});

test("client remains demand-driven and paginates timeline by twenty", () => {
  assert.match(view, /const TIMELINE_PAGE_SIZE = 20/);
  const drawerStart = view.indexOf("function Customer360Drawer");
  const drawerBlock = view.slice(drawerStart, view.indexOf("\nfunction CustomerDetailDrawer", drawerStart));
  assert.equal((drawerBlock.match(/\/api\/orquestador\/customer-window\/360\/overview/g) ?? []).length, 1);
  assert.equal((drawerBlock.match(/\/api\/orquestador\/customer-window\/360\/bookings/g) ?? []).length, 1);
  assert.match(drawerBlock, /params\.set\("page", String\(bookingsPage\)\)/);
  assert.match(drawerBlock, /setBookingsPage\(\(page\) => Math\.max\(1, page - 1\)\)/);
  assert.match(drawerBlock, /setBookingsPage\(\(page\) => page \+ 1\)/);
});

test("unvalidated commercial amount metrics are not rendered", () => {
  assert.doesNotMatch(view, /totalSpend|averageTicket|source_total_amount/);
  assert.match(view, /Reservas históricas/);
  assert.match(view, /Historial de compras/);
});

test("service role remains in the server-only admin module", () => {
  assert.match(admin, /customer_window_search_customers/);
  assert.match(admin, /customer_window_get_customer_summary/);
  assert.match(admin, /customer_window_list_customer_bookings/);
  assert.match(admin, /customer_window_get_classification_criteria/);
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.rpc\(/);
});

test("client imports only the presentation panel and never the server shell", () => {
  assert.match(view, /Panel \} from "@\/components\/dashboard\/panel"/);
  assert.doesNotMatch(view, /components\/dashboard\/shell|lib\/auth\/access|server-only/);
  assert.doesNotMatch(panel, /lib\/auth\/access|auth-server|server-only/);
});
