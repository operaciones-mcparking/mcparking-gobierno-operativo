import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const migration = readFileSync("supabase/migrations/20260929130000_add_customer_window_v2_operational_source_lists.sql", "utf8");
const okpHotStabilityMigration = readFileSync("supabase/migrations/20261002150000_fix_okp_operational_hot_stability.sql", "utf8");
const periodPurchaseMixMigration = readFileSync("supabase/migrations/20261002170000_add_operational_period_purchase_mix.sql", "utf8");
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
  periodBoletaReservations: 1,
  periodPackReservations: 1,
  periodSourceReservations: 2,
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
  periodBoletaReservations: 1,
  periodPackReservations: 0,
  periodSourceReservations: 1,
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

test("operational list exposes period purchase mix separately from historical totals", () => {
  assert.match(periodPurchaseMixMigration, /period_counts as materialized/);
  assert.match(periodPurchaseMixMigration, /count\(\*\)::bigint as period_source_reservations/);
  assert.match(periodPurchaseMixMigration, /count\(\*\) filter \(where is_pack is false\)::bigint as period_boleta_reservations/);
  assert.match(periodPurchaseMixMigration, /count\(\*\) filter \(where is_pack is true\)::bigint as period_pack_reservations/);
  assert.match(periodPurchaseMixMigration, /'periodSourceReservations', period_counts\.period_source_reservations/);
  assert.match(periodPurchaseMixMigration, /'periodBoletaReservations', period_counts\.period_boleta_reservations/);
  assert.match(periodPurchaseMixMigration, /'periodPackReservations', period_counts\.period_pack_reservations/);
  assert.match(periodPurchaseMixMigration, /'totalReservations'[\s\S]*metrics\.total_reservations/);
  assert.match(periodPurchaseMixMigration, /join period_counts using \(representation_key\)/);
  assert.doesNotMatch(periodPurchaseMixMigration, /\b(?:insert|update|delete|merge|truncate|alter table|create table)\b/i);
  assert.match(contracts, /periodSourceReservations[\s\S]*periodBoletaReservations[\s\S]*periodPackReservations/);
  assert.match(contracts, /reservationsInPeriod\)[\s\S]*periodSourceReservations/);
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
  const postgrestRpcName = "customer_window_v2_list_operational_global_v1";
  assert.equal(Buffer.byteLength(postgrestRpcName, "utf8") <= 63, true);
  assert.match(admin, new RegExp(`${postgrestRpcName}[\\s\\S]*normalizeCustomerWindowOperationalRepresentationListV2`));
  assert.doesNotMatch(admin, /\.rpc\(\s*"customer_window_v2_list_operational_representations_by_purchase_period"/);
  assert.match(view, /title="Clientes OKP"/);
  assert.match(view, /title="MCP \/ EAP"/);
  assert.match(view, /onPageChange=\{setOkpPage\}/);
  assert.match(view, /onPageChange=\{setMcpEapPage\}/);
  assert.match(view, /xl:grid-cols-2/);
  assert.match(view, /mcpEapList\.hotPendingReservations[\s\S]*reservas MCP\/EAP recientes pendientes de estabilización[\s\S]*title="Clientes OKP"[\s\S]*title="MCP \/ EAP"/);
  assert.doesNotMatch(view, /Resumen de representaciones del período|REPRESENTACIONES|CONFIRMADOS|RELACIONADOS \/ REVISIÓN|RESERVAS DEL PERÍODO/);
  const tableBlock = view.slice(view.indexOf("function CustomerOperationalRepresentationTable"), view.indexOf("function searchMatchLabel"));
  assert.doesNotMatch(tableBlock, /hotPendingReservations|pendientes de estabilización/);
  assert.doesNotMatch(view.slice(view.indexOf("function CustomerOperationalRepresentationTable"), view.indexOf("function searchMatchLabel")), /Primera compra|Última compra|Última reserva del período/);
});

test("global operational list classifies recent OKP rows as hot pending before link stabilization", () => {
  assert.match(okpHotStabilityMigration, /create or replace function public\.customer_window_v2_list_operational_global_v1/);
  assert.match(okpHotStabilityMigration, /join public\.customer_source_bookings_okp b on guard\.valid and p_family = 'OKP'/);
  assert.match(okpHotStabilityMigration, /greatest\(\s*b\.created_at,\s*b\.updated_at,\s*b\.source_synced_at,\s*coalesce\(l\.created_at, '-infinity'::timestamptz\),\s*coalesce\(l\.updated_at, '-infinity'::timestamptz\)\s*\)\s*<= pg_catalog\.now\(\) - interval '30 minutes' as is_stable/);
  assert.match(okpHotStabilityMigration, /count\(\*\) filter \(where not is_stable\)::bigint as hot_pending_reservations/);
  assert.match(okpHotStabilityMigration, /'hotPendingReservations', reconciliation\.hot_pending_reservations/);
  assert.doesNotMatch(okpHotStabilityMigration, /true as is_stable/);
  assert.doesNotMatch(okpHotStabilityMigration, /\b(?:insert|update|delete|merge|truncate|alter table|create table)\b/i);
});

test("global operational list keeps MCP EAP snapshot stability semantics unchanged", () => {
  assert.match(okpHotStabilityMigration, /join public\.customer_source_bookings_mcp_eap b on guard\.valid and p_family = 'MCP_EAP'/);
  assert.match(okpHotStabilityMigration, /cross join active_snapshot snapshot/);
  assert.match(okpHotStabilityMigration, /<= snapshot\.captured_at - interval '30 minutes' as is_stable/);
  assert.match(okpHotStabilityMigration, /when p_family = 'MCP_EAP'[\s\S]*snapshot_authority/);
});

test("list rendering is bounded and opens the existing Customer 360 selection path", () => {
  const loader = view.slice(view.indexOf("const loadOperationalRepresentations"), view.indexOf("const loadRefreshHealth"));
  assert.equal((loader.match(/getCustomerWindowJsonWithRetry\(/g) ?? []).length, 1);
  assert.doesNotMatch(loader, /items\.map|Promise\.all/);
  assert.match(view, /onSelectRepresentation=\{selectRepresentation\}/);
  assert.match(view, /setSelectedRepresentation\(representation\)/);
});

test("runtime contract accepts source-scoped counts and certified trajectories", () => {
  const normalized = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "MCP_EAP",
    hotPendingReservations: 0,
    items: [
      {
        ...confirmed,
        boletaReservations: 3,
        commercialTrajectory: "MIGRATED_TO_MCP_EAP",
        packReservations: 1,
        periodBoletaReservations: 1,
        periodPackReservations: 1,
        periodSourceReservations: 2,
        sourceReservations: 4,
        trajectoryScope: "confirmed_identity",
      },
      {
        ...related,
        boletaReservations: 1,
        commercialTrajectory: "ONLY_MCP_EAP",
        packReservations: 1,
        periodBoletaReservations: 1,
        periodPackReservations: 0,
        periodSourceReservations: 1,
        sourceReservations: 2,
        trajectoryScope: "related_group",
      },
    ],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 2,
    representedReviewReservations: 1,
    stableReservations: 3,
    total: 2,
    unrepresentedStableReservations: 0,
    validReservations: 3,
  });
  assert.ok(normalized);
  assert.equal(normalized.items.length, 2);
});

test("runtime contract accepts OKP hot pending rows without weakening stable debt guard", () => {
  const hotPendingOkp = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    hotPendingReservations: 18,
    items: [{
      ...confirmed,
      boletaReservations: 3,
      commercialTrajectory: "ONLY_OKP",
      packReservations: 1,
      periodBoletaReservations: 1,
      periodPackReservations: 1,
      periodSourceReservations: 2,
      sourceReservations: 4,
      trajectoryScope: "confirmed_identity",
    }],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 76,
    representedReviewReservations: 0,
    stableReservations: 76,
    total: 1,
    unrepresentedStableReservations: 0,
    validReservations: 94,
  });
  assert.ok(hotPendingOkp);
  assert.equal(hotPendingOkp.hotPendingReservations, 18);

  const stableDebtOkp = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    hotPendingReservations: 0,
    items: [],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 76,
    representedReviewReservations: 0,
    stableReservations: 94,
    total: 0,
    unrepresentedStableReservations: 18,
    validReservations: 94,
  });
  assert.equal(stableDebtOkp, null);
});

test("runtime contract rejects cross-source attribution and inconsistent counts", () => {
  const okpRelated = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    hotPendingReservations: 0,
    items: [{
      ...related,
      boletaReservations: 2,
      commercialTrajectory: "ONLY_MCP_EAP",
      packReservations: 0,
      periodBoletaReservations: 1,
      periodPackReservations: 0,
      periodSourceReservations: 1,
      sourceReservations: 2,
      trajectoryScope: "related_group",
    }],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 0,
    representedReviewReservations: 2,
    stableReservations: 2,
    total: 1,
    unrepresentedStableReservations: 0,
    validReservations: 2,
  });
  assert.equal(okpRelated, null);

  const mismatchedCounts = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    hotPendingReservations: 0,
    items: [{
      ...confirmed,
      boletaReservations: 2,
      commercialTrajectory: "ONLY_OKP",
      packReservations: 1,
      periodBoletaReservations: 1,
      periodPackReservations: 1,
      periodSourceReservations: 2,
      sourceReservations: 4,
      trajectoryScope: "confirmed_identity",
    }],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 2,
    representedReviewReservations: 0,
    stableReservations: 2,
    total: 1,
    unrepresentedStableReservations: 0,
    validReservations: 2,
  });
  assert.equal(mismatchedCounts, null);

  const mismatchedPeriodCounts = contract.normalizeCustomerWindowOperationalRepresentationListV2({
    family: "OKP",
    hotPendingReservations: 0,
    items: [{
      ...confirmed,
      boletaReservations: 2,
      commercialTrajectory: "ONLY_OKP",
      packReservations: 1,
      periodBoletaReservations: 1,
      periodPackReservations: 0,
      periodSourceReservations: 2,
      sourceReservations: 3,
      trajectoryScope: "confirmed_identity",
    }],
    page: 1,
    pageSize: 25,
    representedConfirmedReservations: 2,
    representedReviewReservations: 0,
    stableReservations: 2,
    total: 1,
    unrepresentedStableReservations: 0,
    validReservations: 2,
  });
  assert.equal(mismatchedPeriodCounts, null);
});
