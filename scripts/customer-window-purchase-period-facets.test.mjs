import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const originalMigration = readFileSync(
  "supabase/migrations/20260907120000_add_customer_window_purchase_period_facets.sql",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260907130000_expand_customer_window_purchase_period_facets.sql",
  "utf8",
);
const listing = readFileSync(
  "supabase/migrations/20260904160000_add_customer_window_purchase_period_listing.sql",
  "utf8",
);
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const helperSource = readFileSync("src/lib/customer-window/customer-period-metrics.ts", "utf8");
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString("base64")}`);

const originalFields = [
  "totalCustomers", "newCustomers", "frequentCustomers", "packCustomers", "nonPackCustomers",
  "onlyMcpEapCustomers", "onlyOkpCustomers", "migratedToMcpEapCustomers",
  "migratedToOkpCustomers", "alternatingCustomers",
];
const breakdownFields = [
  "newMcpEapOnlyCustomers", "newOkpOnlyCustomers", "newBothCustomers",
  "frequentMcpEapOnlyCustomers", "frequentOkpOnlyCustomers", "frequentBothCustomers",
  "packMcpEapOnlyCustomers", "packOkpOnlyCustomers", "packBothCustomers",
  "nonPackMcpEapOnlyCustomers", "nonPackOkpOnlyCustomers", "nonPackBothCustomers",
];

test("120000 preserves the exact original ten-counter contract", () => {
  for (const field of originalFields) assert.match(originalMigration, new RegExp(`'${field}'`));
  for (const field of breakdownFields) assert.doesNotMatch(originalMigration, new RegExp(field));
  assert.match(originalMigration, /period_customers as materialized \([\s\S]*select distinct customer_id/);
  assert.doesNotMatch(originalMigration, /has_mcp_eap|has_okp|bool_or/);
});

test("130000 replaces the existing function without changing its signature", () => {
  assert.match(migration, /create or replace function public\.customer_window_get_purchase_period_facets\(/);
  assert.match(migration, /p_from date,[\s\S]*p_to date,[\s\S]*p_lifecycle_status text default null,[\s\S]*p_tier text default null,[\s\S]*p_pack_status text default null,[\s\S]*p_brand_behavior text default null/);
  assert.doesNotMatch(migration, /drop function|drop[\s\S]*cascade/i);
  for (const field of originalFields) assert.match(migration, new RegExp(`'${field}'`));
  for (const field of breakdownFields) assert.match(migration, new RegExp(`'${field}'`));
});

test("creates the non-PII purchase-period facets RPC with the approved signature", () => {
  assert.match(migration, /customer_window_get_purchase_period_facets\([\s\S]*p_from date[\s\S]*p_to date[\s\S]*p_lifecycle_status text default null[\s\S]*p_tier text default null[\s\S]*p_pack_status text default null[\s\S]*p_brand_behavior text default null/);
  for (const field of [
    "totalCustomers", "newCustomers", "frequentCustomers", "packCustomers", "nonPackCustomers",
    "newMcpEapOnlyCustomers", "newOkpOnlyCustomers", "newBothCustomers",
    "frequentMcpEapOnlyCustomers", "frequentOkpOnlyCustomers", "frequentBothCustomers",
    "packMcpEapOnlyCustomers", "packOkpOnlyCustomers", "packBothCustomers",
    "nonPackMcpEapOnlyCustomers", "nonPackOkpOnlyCustomers", "nonPackBothCustomers",
    "onlyMcpEapCustomers", "onlyOkpCustomers", "migratedToMcpEapCustomers",
    "migratedToOkpCustomers", "alternatingCustomers",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.doesNotMatch(migration, /identity_value_normalized|phone|email|plate|source_total_amount|amount|revenue/i);
});

test("facets use the same inclusive confirmed-purchase universe as the listing", () => {
  for (const source of [migration, listing]) {
    assert.match(source, /source_created_at >= p_from::timestamp without time zone/g);
    assert.match(source, /source_created_at < \(p_to \+ 1\)::timestamp without time zone/g);
    assert.match(source, /link\.status = 'active'/g);
    assert.match(source, /booking\.status_raw = 'PAGADA'[\s\S]*booking\.status_raw = 'REEMPLAZADA'/);
    assert.match(source, /booking\.booking_status in \(1, 8\)/);
  }
});

test("facets count each customer once across MCP EAP and OKP", () => {
  assert.match(migration, /'OKP'::text as family[\s\S]*union all[\s\S]*'MCP_EAP'::text/);
  assert.match(migration, /period_customers as materialized \([\s\S]*bool_or\(family = 'MCP_EAP'\)[\s\S]*bool_or\(family = 'OKP'\)[\s\S]*group by customer_id/);
  assert.match(migration, /'totalCustomers', count\(\*\)::bigint/);
  assert.doesNotMatch(migration, /p_family/);
});

test("facets apply all official persisted classification filters", () => {
  assert.match(migration, /metrics\.lifecycle_status = p_lifecycle_status/);
  assert.match(migration, /metrics\.tier = p_tier/);
  assert.match(migration, /metrics\.pack_status = p_pack_status/);
  assert.match(migration, /metrics\.brand_behavior = p_brand_behavior/);
  assert.match(migration, /Invalid lifecycle status[\s\S]*Invalid tier[\s\S]*Invalid pack status[\s\S]*Invalid brand behavior/);
});

test("facet partitions expose lifecycle pack and every official behavior", () => {
  assert.match(migration, /lifecycle_status = 'NEW'[\s\S]*lifecycle_status = 'FREQUENT'/);
  assert.match(migration, /pack_status = 'PACK'[\s\S]*pack_status = 'NO_PACK'/);
  for (const behavior of ["ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]) {
    assert.match(migration, new RegExp(`brand_behavior = '${behavior}'`));
  }
  for (const classification of ["lifecycle_status = 'NEW'", "lifecycle_status = 'FREQUENT'", "pack_status = 'PACK'", "pack_status = 'NO_PACK'"]) {
    assert.match(migration, new RegExp(`${classification}[\\s\\S]*has_mcp_eap and not has_okp`));
    assert.match(migration, new RegExp(`${classification}[\\s\\S]*has_okp and not has_mcp_eap`));
    assert.match(migration, new RegExp(`${classification}[\\s\\S]*has_mcp_eap and has_okp`));
  }
});

test("facets remain service-role only with a fixed empty search path", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("period metrics endpoint is admin-only validates inputs and stays no-store", () => {
  assert.ok(route.indexOf("getActiveAdminUser()") < route.indexOf('action === "period-metrics"'));
  assert.match(route, /action === "period-metrics"[\s\S]*isValidDateValue\(from\)[\s\S]*from > to/);
  assert.match(route, /lifecycleStatus === undefined[\s\S]*tier === undefined[\s\S]*packStatus === undefined[\s\S]*brandBehavior === undefined/);
  assert.match(route, /getCustomerWindowPurchasePeriodMetrics/);
  assert.match(route, /NextResponse\.json\(result\.data, \{ headers: noStoreHeaders \}\)/);
});

test("service role remains behind the existing server helper", () => {
  assert.match(admin, /customer_window_get_purchase_period_facets/);
  for (const parameter of ["p_from", "p_to", "p_lifecycle_status", "p_tier", "p_pack_status", "p_brand_behavior"]) {
    assert.match(admin, new RegExp(`${parameter}:`));
  }
  assert.doesNotMatch(route + view, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.rpc\(/);
});

test("client loads metrics independently from paginated family rows", () => {
  const metricsBlock = view.slice(view.indexOf("const loadPeriodMetrics"), view.indexOf("const closeCustomerDrawer"));
  assert.match(metricsBlock, /action: "period-metrics"/);
  assert.doesNotMatch(metricsBlock, /mcpList|okpList|\.items|mcpPage|okpPage|pageSize/);
  assert.match(metricsBlock, /periodMetricsController\.current !== controller/);
  assert.match(metricsBlock, /AbortError/);
  assert.match(metricsBlock, /\[brandBehavior, lifecycleStatus, packStatus, periodRange\.from, periodRange\.to, tier\]/);
  assert.match(view, /CustomerCommercialMetrics[\s\S]*CustomerPeriodTable/);
  const abortBlock = view.slice(view.indexOf("function abortFamilyRequests"), view.indexOf("function applyPeriod"));
  assert.match(abortBlock, /periodMetricsController\.current\?\.abort\(\)[\s\S]*setPeriodMetrics\(null\)/);
});

test("mini-dashboard renders compact totals partitions percentages and isolated errors", () => {
  const dashboard = view.slice(view.indexOf("function CustomerMetricSplit"), view.indexOf("function CustomerPeriodTable"));
  assert.match(dashboard, /Resumen comercial del período/);
  assert.match(dashboard, /Clientes[\s\S]*Nuevos \/ Frecuentes[\s\S]*Pack \/ Boleta[\s\S]*Comportamiento/);
  assert.match(dashboard, /Solo MCP\/EAP[\s\S]*Solo OKP[\s\S]*Ambos/);
  for (const field of [
    "newMcpEapOnlyCustomers", "newOkpOnlyCustomers", "newBothCustomers",
    "frequentMcpEapOnlyCustomers", "frequentOkpOnlyCustomers", "frequentBothCustomers",
    "packMcpEapOnlyCustomers", "packOkpOnlyCustomers", "packBothCustomers",
    "nonPackMcpEapOnlyCustomers", "nonPackOkpOnlyCustomers", "nonPackBothCustomers",
  ]) assert.match(dashboard, new RegExp(field));
  assert.match(dashboard, /formatCustomerMetricPercentage/g);
  assert.match(dashboard, /lg:grid-cols-5[\s\S]*text-xl[\s\S]*del período/);
  assert.match(dashboard, /role="alert"[\s\S]*Las tablas siguen disponibles/);
});

test("tier labels are title case while filter enums remain uppercase", () => {
  assert.equal(helper.formatCustomerTierLabel("DIAMOND"), "Diamond");
  assert.equal(helper.formatCustomerTierLabel("PLATINUM"), "Platinum");
  assert.equal(helper.formatCustomerTierLabel("IRON"), "Iron");
  assert.match(view, /<TierBadge value=\{customer\.tier\}/);
  assert.match(view, /<option key=\{value\} value=\{value\}>\{value\[0\] \+ value\.slice\(1\)\.toLowerCase\(\)\}/);
  for (const tier of ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"]) {
    assert.match(route + migration, new RegExp(`"${tier}"|'${tier}'`));
  }
});

test("metric presentation preserves zero and formats percentages with at most one decimal", () => {
  assert.equal(helper.formatCustomerMetricPercentage(0, 0), "0%");
  assert.equal(helper.formatCustomerMetricPercentage(0, 182), "0%");
  assert.equal(helper.formatCustomerMetricPercentage(34, 182), "18,7%");
  assert.equal(helper.formatCustomerMetricPercentage(91, 182), "50%");

  const valid = {
    alternatingCustomers: 6,
    frequentBothCustomers: 12,
    frequentCustomers: 148,
    frequentMcpEapOnlyCustomers: 80,
    frequentOkpOnlyCustomers: 56,
    migratedToMcpEapCustomers: 18,
    migratedToOkpCustomers: 12,
    newBothCustomers: 3,
    newCustomers: 34,
    newMcpEapOnlyCustomers: 14,
    newOkpOnlyCustomers: 17,
    nonPackBothCustomers: 13,
    nonPackCustomers: 121,
    nonPackMcpEapOnlyCustomers: 62,
    nonPackOkpOnlyCustomers: 46,
    onlyMcpEapCustomers: 92,
    onlyOkpCustomers: 54,
    packBothCustomers: 7,
    packCustomers: 61,
    packMcpEapOnlyCustomers: 32,
    packOkpOnlyCustomers: 22,
    totalCustomers: 182,
  };
  assert.deepEqual(helper.normalizeCustomerPeriodMetrics(valid), valid);
  assert.equal(valid.newMcpEapOnlyCustomers + valid.newOkpOnlyCustomers + valid.newBothCustomers, valid.newCustomers);
  assert.equal(valid.frequentMcpEapOnlyCustomers + valid.frequentOkpOnlyCustomers + valid.frequentBothCustomers, valid.frequentCustomers);
  assert.equal(valid.packMcpEapOnlyCustomers + valid.packOkpOnlyCustomers + valid.packBothCustomers, valid.packCustomers);
  assert.equal(valid.nonPackMcpEapOnlyCustomers + valid.nonPackOkpOnlyCustomers + valid.nonPackBothCustomers, valid.nonPackCustomers);
  assert.equal(helper.normalizeCustomerPeriodMetrics({ ...valid, totalCustomers: null }), null);
});
