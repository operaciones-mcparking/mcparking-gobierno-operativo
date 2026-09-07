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

test("point search UI and its client-only state are removed", () => {
  assert.doesNotMatch(view, /Buscar cliente específico|Busca por una identidad|searchCustomers|searchOptions|SearchResult/);
  assert.doesNotMatch(view, /customer-search-type|customer-search-value|action=search|normalizeCustomerSearchValue/);
  assert.doesNotMatch(view, /searchType|setSearchType|setQuery|setResults/);
});

test("admin-only endpoint rejects invalid inputs and caps page size", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /isCustomerSearchType\(type\)/);
  assert.match(route, /uuidPattern\.test\(customerId\)/);
  assert.match(route, /boundedInteger\(request\.nextUrl\.searchParams\.get\("pageSize"\), 20, 100\)/);
  assert.match(route, /action === "criteria"/);
  assert.match(route, /action === "search"[\s\S]*action === "summary"[\s\S]*action === "bookings"/);
});

test("client remains demand-driven and paginates timeline by twenty", () => {
  assert.match(view, /const TIMELINE_PAGE_SIZE = 20/);
  assert.match(view, /Promise\.all\(\[[\s\S]*action=summary[\s\S]*action=bookings/);
  const pagingStart = view.indexOf("async function changeTimelinePage");
  const pagingBlock = view.slice(pagingStart, view.indexOf("\n\n  return (", pagingStart));
  assert.match(pagingBlock, /action=bookings/);
  assert.doesNotMatch(pagingBlock, /action=summary|action=search/);
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
