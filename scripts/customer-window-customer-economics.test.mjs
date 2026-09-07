import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907160000_add_customer_window_customer_economics.sql",
  "utf8",
);
const expandedMigration = readFileSync(
  "supabase/migrations/20260907180000_expand_customer_window_customer_economics.sql",
  "utf8",
);
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const indexes = readFileSync(
  "supabase/migrations/20260903140000_optimize_customer_profile_metrics_refresh.sql",
  "utf8",
);

test("adds one dedicated customer economics RPC without rebuilding data", () => {
  assert.match(migration, /create or replace function public\.customer_window_get_customer_economics\(p_customer_id uuid\)/);
  assert.doesNotMatch(migration, /create\s+table|alter\s+table|drop\s+|delete\s+from|insert\s+into/i);
});

test("RPC reads only the requested active customer", () => {
  assert.match(migration, /profile\.id = p_customer_id[\s\S]*profile\.status = 'active'/);
  assert.match(migration, /from public\.customer_window_bookings_v booking[\s\S]*booking\.customer_id = p_customer_id/);
  assert.match(migration, /customer_not_found/);
});

test("eligible boletas exclude packs and require both economics flags", () => {
  assert.match(migration, /booking\.is_pack is false/);
  assert.match(migration, /booking\.economic_eligible is true/);
  assert.match(migration, /booking\.economics_available is true/);
});

test("paid total is a sum of eligible booking paid amounts", () => {
  assert.match(migration, /sum\(booking\.paid_amount\)::numeric\(18,2\) as paid_amount/);
});

test("list total is a sum of eligible booking list amounts", () => {
  assert.match(migration, /sum\(booking\.list_amount\)::numeric\(18,2\) as list_amount/);
});

test("discount total is a sum of eligible booking discounts", () => {
  assert.match(migration, /sum\(booking\.discount_amount\)::numeric\(18,2\) as discount_amount/);
});

test("economic days are summed instead of inferred in the client", () => {
  assert.match(migration, /sum\(booking\.economic_days\)::bigint as economic_days/);
  assert.doesNotMatch(view, /reduce\([^)]*(?:paidAmount|economicDays|discountAmount)/);
});

test("paid ADR is weighted from aggregate paid amount and days", () => {
  assert.match(migration, /'paidAdr', total\.paid_amount \/ nullif\(total\.economic_days, 0\)/);
  assert.doesNotMatch(migration, /avg\s*\(\s*booking\.paid_adr/i);
});

test("list ADR is weighted from aggregate list amount and days", () => {
  assert.match(migration, /'listAdr', total\.list_amount \/ nullif\(total\.economic_days, 0\)/);
  assert.doesNotMatch(migration, /avg\s*\(\s*booking\.list_adr/i);
});

test("weighted discount uses aggregate discount divided by aggregate list", () => {
  assert.match(migration, /'weightedDiscountPct', total\.discount_amount \/ nullif\(total\.list_amount, 0\)/);
  assert.doesNotMatch(migration, /avg\s*\(\s*booking\.discount_percentage/i);
});

test("discount usage counts only positive discounts over eligible boletas", () => {
  assert.match(migration, /count\(\*\) filter \(where booking\.discount_amount > 0\)::bigint as discounted_boleta_count/);
  assert.match(migration, /discounted_boleta_count::numeric \/ nullif\(total\.boleta_count, 0\)/);
});

test("packs are counted but excluded from all boleta economy aggregates", () => {
  assert.match(migration, /'packCount',[\s\S]*booking\.is_pack is true/);
  assert.match(migration, /from eligible_boletas booking/);
});

test("empty eligible sets preserve null economics while retaining zero counts", () => {
  assert.doesNotMatch(migration, /coalesce\(\s*sum\(/i);
  assert.match(migration, /nullif\(total\.economic_days, 0\)/);
  assert.match(migration, /nullif\(total\.boleta_count, 0\)/);
});

test("corrective migration adds average boleta ticket without changing the original migration", () => {
  assert.match(expandedMigration, /create or replace function public\.customer_window_get_customer_economics\(p_customer_id uuid\)/);
  assert.match(expandedMigration, /'averageBoletaTicket', total\.paid_amount \/ nullif\(total\.boleta_count, 0\)/);
  assert.match(expandedMigration, /'averageBoletaTicket', economics\.paid_amount \/ nullif\(economics\.booking_count, 0\)/);
  assert.doesNotMatch(migration, /averageBoletaTicket/);
});

test("average boleta ticket excludes packs and unavailable economics", () => {
  assert.match(expandedMigration, /from bookings booking[\s\S]*booking\.is_pack is false[\s\S]*booking\.economic_eligible is true[\s\S]*booking\.economics_available is true/);
  assert.match(expandedMigration, /count\(\*\)::bigint as boleta_count/);
  assert.match(expandedMigration, /nullif\(total\.boleta_count, 0\)/);
});

test("MCP and EAP use canonical source brands", () => {
  assert.match(migration, /source = 'MCP_EAP' and booking\.brand = 'MCP' then 'MCP'/);
  assert.match(migration, /source = 'MCP_EAP' and booking\.brand = 'EAP' then 'EAP'/);
});

test("OKP breakdown accepts only the four canonical parking keys", () => {
  for (const key of ["OKP_RC", "OKP_EXP", "OKP_PREMIUM", "OKP_FIDAE"]) {
    assert.match(migration, new RegExp(`'${key}'`));
    assert.match(view, new RegExp(`"${key}"`));
  }
});

test("parking breakdown omits keys without eligible activity", () => {
  assert.match(migration, /from parking_economics economics/);
  assert.doesNotMatch(migration, /generate_series|values\s*\(\s*'MCP'/i);
  assert.match(view, /if \(!values\) return \[\]/);
});

test("each parking rollup includes counts sums ADR and discounts", () => {
  for (const key of [
    "bookingCount", "paidAmount", "listAmount", "discountAmount", "economicDays",
    "paidAdr", "listAdr", "weightedDiscountPct", "discountedBookingCount",
    "discountUsagePct",
  ]) assert.match(migration, new RegExp(`'${key}'`));
});

test("promotion and coupon codes remain source-specific and uninterpreted", () => {
  assert.match(migration, /when booking\.source = 'OKP' then booking\.coupon_code[\s\S]*else booking\.promotion_code/);
  assert.match(migration, /group by[\s\S]*booking\.source/);
  assert.doesNotMatch(migration + view, /Banco|BIN|Convenio|Campaña promocional/);
});

test("code history includes uses and last use without identity values", () => {
  assert.match(migration, /count\(\*\)::bigint as uses/);
  assert.match(migration, /max\(booking\.purchase_created_at\) as last_used_at/);
  assert.doesNotMatch(migration, /phone|email|plate|identity_value/i);
});

test("RPC is security definer with an empty search path", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
});

test("RPC execution is restricted to service role", () => {
  assert.match(migration, /revoke all on function public\.customer_window_get_customer_economics\(uuid\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.customer_window_get_customer_economics\(uuid\)[\s\S]*to service_role/);
});

test("existing active profile index supports per-customer view access", () => {
  assert.match(indexes, /customer_booking_profile_links_active_profile_idx[\s\S]*\(profile_id, source, source_row_id\)[\s\S]*where status = 'active'/);
  assert.doesNotMatch(migration, /create\s+index/i);
});

test("admin helper invokes the economics RPC server-side", () => {
  assert.match(admin, /getCustomerWindowEconomics\(customerId: string\)[\s\S]*\.rpc\("customer_window_get_customer_economics"[\s\S]*p_customer_id: customerId/);
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
});

test("admin-only route exposes validated economics action", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /uuidPattern\.test\(customerId\)[\s\S]*action === "economics"[\s\S]*getCustomerWindowEconomics\(customerId\)/);
});

test("drawer loads economics on demand without changing period list requests", () => {
  assert.match(view, /selectCustomer[\s\S]*action=economics&customerId=\$\{customerId\}/);
  const familyBlock = view.slice(view.indexOf("const loadFamily"), view.indexOf("const loadPeriodMetrics"));
  assert.doesNotMatch(familyBlock, /action=economics/);
});

test("economics failures remain local to the drawer section", () => {
  assert.match(view, /economicsError[\s\S]*No fue posible cargar la economía del cliente/);
  assert.match(view, /economicsController\.current\?\.abort\(\)/);
});

test("drawer renders totals parking rollups and source codes", () => {
  for (const label of [
    "Economía del cliente", "Gasto histórico", "ADR pagado", "ADR lista",
    "Descuento ponderado", "Boletas con descuento", "Días económicos",
    "Por estacionamiento", "Códigos utilizados",
  ]) assert.match(view, new RegExp(label));
  assert.match(view, /values\.discountedBookingCount/);
  assert.doesNotMatch(view, /values\.discountedBoletaCount/);
});

test("drawer keeps the approved summary and timeline around economics", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  const summaryPosition = drawerBlock.indexOf(">Resumen</h3>");
  const actionsPosition = drawerBlock.indexOf('aria-label="Acciones del detalle"');
  const timelinePosition = drawerBlock.indexOf(">Historial de compras</h3>");
  assert.ok(summaryPosition < actionsPosition);
  assert.ok(actionsPosition < timelinePosition);
  assert.match(drawerBlock, /setDetailView\("economics"\)[\s\S]*>Economía<\/button>/);
  assert.match(drawerBlock, /openInformation\(\)[\s\S]*>Más información<\/button>/);
  assert.match(drawerBlock, /aria-hidden=\{detailView !== "economics"\}[\s\S]*<CustomerEconomicsPanel/);
  assert.match(drawerBlock, /aria-hidden=\{detailView !== "information"\}[\s\S]*<CustomerInformationPanel/);
  assert.doesNotMatch(drawerBlock, />Economía del cliente<\/h3>[\s\S]*>Resumen<\/h3>/);
});

test("secondary drawer views animate within the original fixed width", () => {
  const drawerBlock = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  const economicsPanel = view.slice(view.indexOf("function CustomerEconomicsPanel"), view.indexOf("function IdentityList"));
  assert.match(drawerBlock, /overflow-hidden[\s\S]*md:max-w-2xl/);
  assert.doesNotMatch(drawerBlock, /md:max-w-4xl/);
  assert.match(drawerBlock, /transition-\[transform,opacity\] duration-200 ease-out motion-reduce:transition-none/g);
  assert.match(drawerBlock, /detailView === "main"[\s\S]*-translate-x-4 opacity-0/);
  assert.match(drawerBlock, /detailView === "economics"[\s\S]*translate-x-6 opacity-0/);
  assert.match(drawerBlock, /aria-hidden=\{detailView !== "economics"\}[\s\S]*inert=\{detailView !== "economics"\}/);
  assert.match(economicsPanel, /Por estacionamiento[\s\S]*className="mt-1\.5 grid gap-2"/);
  assert.doesNotMatch(economicsPanel, /lg:grid-cols-2/);
});
