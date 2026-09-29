import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const migration = readFileSync("supabase/migrations/20260929130000_add_customer_window_v2_operational_source_lists.sql", "utf8");
const contracts = readFileSync("src/lib/customer-window/customer-representations-v2.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const contractJavaScript = ts.transpileModule(contracts, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(contractJavaScript).toString("base64")}`
);

const confirmed = {
  contactSummary: {
    emailCount: 1,
    phoneCount: 1,
    semantics: "direct",
    singleEmail: "confirmed@example.com",
    singlePhone: "+56911111111",
  },
  customerId: "11111111-1111-4111-8111-111111111111",
  firstPurchaseAt: "2026-01-01T10:00:00",
  lastBookingAtInPeriod: "2026-09-21T10:00:00",
  lastPurchaseAt: "2026-09-21T10:00:00",
  metricScope: "all_confirmed_sources",
  relatedGroupId: null,
  representationId: "11111111-1111-4111-8111-111111111111",
  representationKey: "confirmed_customer:11111111-1111-4111-8111-111111111111",
  representationType: "confirmed_customer",
  reservationsInPeriod: 2,
  totalReservations: 4,
};

const related = {
  contactSummary: {
    emailCount: 1,
    phoneCount: 2,
    semantics: "observed",
    singleEmail: "observed@example.com",
    singlePhone: null,
  },
  customerId: null,
  firstPurchaseAt: "2026-01-02T10:00:00",
  lastBookingAtInPeriod: "2026-09-21T11:00:00",
  lastPurchaseAt: "2026-09-21T11:00:00",
  metricScope: "mcp_eap_active_snapshot",
  relatedGroupId: "a".repeat(64),
  representationId: "a".repeat(64),
  representationKey: `related_review:${"a".repeat(64)}`,
  representationType: "related_review",
  reservationsInPeriod: 1,
  totalReservations: 2,
};

test("adds one source-scoped paginated read RPC without table writes", () => {
  assert.match(migration, /create or replace function public\.customer_window_v2_list_operational_representations_by_purchase_period\([\s\S]*p_family text[\s\S]*p_page integer[\s\S]*p_page_size integer/);
  assert.match(migration, /language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|alter table|create table)\b/i);
  assert.match(migration, /p_family not in \('OKP', 'MCP_EAP'\)/);
});

test("OKP contains confirmed active profiles only and MCP EAP preserves related review", () => {
  assert.match(migration, /customer_source_bookings_okp[\s\S]*customer_booking_profile_links[\s\S]*link\.status = 'active'[\s\S]*where p_family = 'OKP'/);
  assert.match(migration, /customer_window_mcp_eap_representations_v2[\s\S]*where p_family = 'MCP_EAP'/);
  assert.match(migration, /representation_type = 'related_review'[\s\S]*customer_analytical_booking_assignments/);
  assert.doesNotMatch(migration.slice(migration.indexOf("select\n      v_snapshot_id"), migration.indexOf("union all")), /related_review/);
});

test("quantity and BOLETA PACK are counted from source rows rather than global pack status", () => {
  assert.match(migration, /count\(\*\)::bigint as source_reservations/);
  assert.match(migration, /count\(\*\) filter \(where source_row\.is_pack is false\)::bigint as boleta_reservations/);
  assert.match(migration, /count\(\*\) filter \(where source_row\.is_pack is true\)::bigint as pack_reservations/);
  assert.doesNotMatch(migration, /profile_metrics\.pack_status/);
  assert.match(contracts, /sourceReservations[\s\S]*boletaReservations[\s\S]*packReservations/);
  assert.match(contracts, /sourceReservations\)[\s\S]*boletaReservations\) \+ countAsBigInt\(item\.packReservations\)/);
});

test("trajectory reuses confirmed metrics and scopes related groups to MCP EAP", () => {
  assert.match(migration, /when 'confirmed_customer' then profile_metrics\.brand_behavior[\s\S]*else 'ONLY_MCP_EAP'/);
  assert.match(migration, /when 'confirmed_customer' then 'confirmed_identity'[\s\S]*else 'related_group'/);
  for (const value of ["ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]) {
    assert.match(contracts, new RegExp(value));
  }
  assert.match(contracts, /trajectoryScope !== "related_group"[\s\S]*commercialTrajectory !== "ONLY_MCP_EAP"/);
});

test("RPC remains service-role only and keeps temporal fields for future consumers", () => {
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  for (const field of ["firstPurchaseAt", "lastPurchaseAt", "lastBookingAtInPeriod"]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
});

test("server validates one request per family and the UI paginates them independently", () => {
  assert.match(route, /action === "operational-list-v2"[\s\S]*allowedFamilies\.has\(family\)/);
  assert.match(admin, /customer_window_v2_list_operational_representations_by_purchase_period[\s\S]*normalizeCustomerWindowOperationalRepresentationListV2/);
  assert.match(view, /title="Clientes OKP"/);
  assert.match(view, /title="MCP \/ EAP"/);
  assert.match(view, /onPageChange=\{setOkpPage\}/);
  assert.match(view, /onPageChange=\{setMcpEapPage\}/);
  assert.match(view, /xl:grid-cols-2/);
  assert.doesNotMatch(view.slice(view.indexOf("function CustomerOperationalRepresentationTable"), view.indexOf("function searchMatchLabel")), /Primera compra|Última compra|Última reserva del período/);
});

test("list rendering is bounded and opens the existing Customer 360 selection path", () => {
  const loader = view.slice(view.indexOf("const loadOperationalRepresentations"), view.indexOf("const loadPeriodFacets"));
  assert.equal((loader.match(/getCustomerWindowJsonWithRetry\(/g) ?? []).length, 1);
  assert.doesNotMatch(loader, /items\.map|Promise\.all/);
  assert.match(view, /onSelectRepresentation=\{selectRepresentation\}/);
  assert.match(view, /setSelectedRepresentation\(representation\)/);
});

test("runtime contract accepts source-scoped counts and certified trajectories", () => {
  const normalized = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "MCP_EAP",
    items: [
      {
        ...confirmed,
        boletaReservations: 3,
        commercialTrajectory: "MIGRATED_TO_MCP_EAP",
        packReservations: 1,
        sourceReservations: 4,
        trajectoryScope: "confirmed_identity",
      },
      {
        ...related,
        boletaReservations: 1,
        commercialTrajectory: "ONLY_MCP_EAP",
        packReservations: 1,
        sourceReservations: 2,
        trajectoryScope: "related_group",
      },
    ],
    page: 1,
    pageSize: 25,
    total: 2,
  });
  assert.ok(normalized);
  assert.equal(normalized.items.length, 2);
});

test("runtime contract rejects cross-source attribution and inconsistent counts", () => {
  const okpRelated = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    items: [{
      ...related,
      boletaReservations: 2,
      commercialTrajectory: "ONLY_MCP_EAP",
      packReservations: 0,
      sourceReservations: 2,
      trajectoryScope: "related_group",
    }],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  assert.equal(okpRelated, null);

  const mismatchedCounts = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    items: [{
      ...confirmed,
      boletaReservations: 2,
      commercialTrajectory: "ONLY_OKP",
      packReservations: 1,
      sourceReservations: 4,
      trajectoryScope: "confirmed_identity",
    }],
    page: 1,
    pageSize: 25,
    total: 1,
  });
  assert.equal(mismatchedCounts, null);
});
