import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const {
  normalizeCustomer360ObservedContacts,
  normalizeCustomer360Overview,
} = await import("../src/lib/customer-window/customer-360-v1.ts");
const {
  normalizeCustomerWindowIdentityResolutionDetailV2,
} = await import("../src/lib/customer-window/customer-representations-v2.ts");

const migration = readFileSync(new URL("../supabase/migrations/20260925140000_add_customer_window_360_v1_reads.sql", import.meta.url), "utf8");
const observedContactsMigration = readFileSync(new URL("../supabase/migrations/20260925150000_extend_customer_window_360_v1_observed_contacts.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../src/lib/customer-window/customer-360-v1.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/lib/orquestador/supabase-admin.ts", import.meta.url), "utf8");
const http = readFileSync(new URL("../src/lib/customer-window/customer-360-http.ts", import.meta.url), "utf8");
const overviewRoute = readFileSync(new URL("../src/app/api/orquestador/customer-window/360/overview/route.ts", import.meta.url), "utf8");
const bookingsRoute = readFileSync(new URL("../src/app/api/orquestador/customer-window/360/bookings/route.ts", import.meta.url), "utf8");
const contactsRoute = readFileSync(new URL("../src/app/api/orquestador/customer-window/360/contacts/route.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/app/orquestador/customer-window-view.tsx", import.meta.url), "utf8");
const request = readFileSync(new URL("../src/lib/customer-window/customer-request-retry.ts", import.meta.url), "utf8");
const identityPreview = readFileSync(new URL("../src/lib/customer-window/identity-decision-preview.ts", import.meta.url), "utf8");
const harness = readFileSync(new URL("../supabase/debug/customer_window_360_v1_reversible_test.sql", import.meta.url), "utf8");

const relatedLocator = {
  authoritySnapshotId: "30000000-0000-4000-8000-000000000001",
  customerUniverse: "MCP_EAP",
  representationId: "f".repeat(64),
  representationKey: `related_review:${"f".repeat(64)}`,
  representationType: "related_review",
};

function relatedOverview(contacts) {
  return {
    contractVersion: "CUSTOMER_360_V1",
    identity: {
      contactability: "observed_only",
      contacts,
      customerId: null,
      relatedGroupId: "f".repeat(64),
      relatedReviewSummary: { candidateCount: 1, conflictCount: 0, profileCount: 1, v1BookingCount: 0, v2BookingCount: 1 },
      status: "related_review",
    },
    locator: relatedLocator,
    moduleAvailability: {
      advancedMetrics: { status: "unavailable" }, attribution: { status: "unavailable" },
      bookings: { status: "available" }, commercialEvents: { status: "unavailable" },
      communications: { status: "unavailable" },
    },
    ok: true,
    representation: { authorityStatus: "active_snapshot", readOnly: true },
    sourceCoverage: [{ bookingCount: 1, source: "MCP_EAP" }],
    summary: { firstBookingAt: "2026-09-21T11:00:00Z", lastBookingAt: "2026-09-21T11:00:00Z", totalBookings: 1 },
  };
}

test("historical migration remains the original three-function Customer 360 base", () => {
  assert.match(migration, /customer_window_360_v1_resolve_locator\(\s*p_locator jsonb/);
  assert.match(migration, /customer_window_360_v1_get_overview\(\s*p_locator jsonb/);
  assert.match(migration, /customer_window_360_v1_list_bookings\([\s\S]*p_page integer default 1[\s\S]*p_page_size integer default 25/);
  assert.equal((migration.match(/security definer/g) ?? []).length, 3);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 3);
  assert.match(migration, /revoke all on function public\.customer_window_360_v1_resolve_locator\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.customer_window_360_v1_resolve_locator/);
  assert.equal((migration.match(/grant execute on function public\.customer_window_360_v1_(?:get_overview|list_bookings)/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /list_observed_contacts|emailPreview|phonePreview|ranked_contact_values|contact_rank/);
});

test("incremental migration contains only the observed-contact extension", () => {
  assert.match(observedContactsMigration, /create or replace function public\.customer_window_360_v1_get_overview/);
  assert.match(observedContactsMigration, /customer_window_360_v1_list_observed_contacts\([\s\S]*p_contact_type text[\s\S]*p_page_size integer default 100/);
  assert.equal((observedContactsMigration.match(/security definer/g) ?? []).length, 2);
  assert.equal((observedContactsMigration.match(/set search_path = ''/g) ?? []).length, 2);
  assert.doesNotMatch(observedContactsMigration, /create table|alter table|insert into|update public\.|delete from/);
  const confirmedBranch = (sql) => {
    const overviewStart = sql.indexOf("create or replace function public.customer_window_360_v1_get_overview");
    const branchStart = sql.indexOf("  if v_representation_type = 'confirmed_customer' then", overviewStart);
    const branchEnd = sql.indexOf("  else\n    v_group_id :=", branchStart);
    return sql.slice(branchStart, branchEnd);
  };
  assert.equal(confirmedBranch(observedContactsMigration), confirmedBranch(migration));
});

test("locator is fail closed and confirmed scope is snapshot independent", () => {
  for (const code of ["invalid_locator_contract", "representation_not_found", "authority_not_found", "stale_representation", "representation_authority_unavailable", "representation_contract_unavailable"]) {
    assert.match(migration, new RegExp(code));
  }
  const confirmedBranch = migration.slice(migration.indexOf("if v_representation_type = 'confirmed_customer'"), migration.indexOf("v_authority_snapshot_id :="));
  assert.match(confirmedBranch, /customer_universe <> 'GLOBAL'/);
  assert.match(confirmedBranch, /authoritySnapshotId' <> 'null'::jsonb/);
  assert.doesNotMatch(confirmedBranch, /active_snapshot_authority_v2/);
  assert.match(migration, /v_active_snapshot_count <> 1/);
  assert.match(migration, /v_active_snapshot_id <> v_authority_snapshot_id/);
});

test("overview uses precalculated metrics and keeps future modules unavailable", () => {
  assert.match(migration, /metrics\.mcp_count \+ metrics\.eap_count/);
  assert.match(migration, /metrics\.okp_count/);
  assert.match(migration, /customer_related_review_metrics/);
  const relatedOverview = migration.slice(
    migration.indexOf("with observations as materialized"),
    migration.indexOf("  if v_result is null then"),
  );
  assert.match(relatedOverview, /customer_analytical_booking_assignments assignment[\s\S]*assignment\.snapshot_id = v_snapshot_id[\s\S]*assignment\.representation_type = 'related_review'[\s\S]*assignment\.related_group_id = v_group_id/);
  assert.match(relatedOverview, /cross join lateral[\s\S]*customer_source_bookings_mcp_eap[\s\S]*source_booking\.source_row_id = assignment\.source_row_id[\s\S]*limit 1/);
  assert.match(observedContactsMigration, /row_number\(\) over \(partition by identity_type order by normalized_value\)/);
  assert.match(observedContactsMigration, /contact_rank <= 5/);
  assert.match(observedContactsMigration, /'emailPreview', contacts\.email_preview/);
  assert.match(observedContactsMigration, /'phonePreview', contacts\.phone_preview/);
  assert.doesNotMatch(relatedOverview, /customer_related_review_members member/);
  assert.match(migration, /'contactability', 'direct'/);
  assert.match(migration, /'contactability', 'observed_only'/);
  assert.doesNotMatch(migration, /totalSpend|totalDays/);
  for (const reason of ["not_linked_v1", "read_contract_pending", "not_in_v1"]) assert.match(migration, new RegExp(reason));
});

test("bookings preserve the V1 multi-source and snapshot scopes", () => {
  const confirmed = migration.slice(
    migration.indexOf("with mcp_eap_links as materialized"),
    migration.indexOf("  else\n    v_group_id :=", migration.indexOf("with mcp_eap_links as materialized")),
  );
  assert.match(confirmed, /customer_booking_profile_links link[\s\S]*link\.profile_id = v_customer_id[\s\S]*link\.source = 'MCP_EAP'[\s\S]*link\.status = 'active'/);
  assert.match(confirmed, /customer_booking_profile_links link[\s\S]*link\.profile_id = v_customer_id[\s\S]*link\.source = 'OKP'[\s\S]*link\.status = 'active'/);
  assert.match(confirmed, /cross join lateral[\s\S]*customer_source_bookings_mcp_eap[\s\S]*source_booking\.source_row_id = link\.source_row_id[\s\S]*limit 1/);
  assert.match(confirmed, /cross join lateral[\s\S]*customer_source_bookings_okp[\s\S]*source_booking\.source_row_id = link\.source_row_id[\s\S]*limit 1/);
  assert.doesNotMatch(confirmed, /customer_window_bookings_v/);
  assert.match(migration, /customer_analytical_booking_assignments assignment[\s\S]*assignment\.snapshot_id = v_snapshot_id[\s\S]*assignment\.related_group_id = v_group_id/);
  assert.match(migration, /'sourceRowId', paged\.source_row_id::text/);
  assert.match(migration, /purchase_created_at desc nulls last, scoped\.source desc, scoped\.source_row_id desc/);
  assert.match(migration, /source_created_at desc nulls last, scoped\.source desc, scoped\.source_row_id desc/);
  assert.match(migration, /p_page_size < 1 or p_page_size > 100/);
  assert.match(migration, /'observedEmail', null/);
  assert.match(migration, /'observedEmail', paged\.observed_email/);
});

test("observed contacts are related-only, distinct, paginated and lazy", () => {
  const contactsRpc = observedContactsMigration.slice(
    observedContactsMigration.indexOf("create or replace function public.customer_window_360_v1_list_observed_contacts"),
  );
  assert.match(contactsRpc, /representationType' <> 'related_review'/);
  assert.match(contactsRpc, /select distinct on \(normalized_value\)/);
  assert.match(contactsRpc, /p_page_size > 100/);
  assert.match(contactsRpc, /'semantics', 'observed'/);
  assert.match(contract, /emailPreview: string\[\]/);
  assert.match(contract, /phonePreview: string\[\]/);
  assert.match(contract, /new Set\(value\)\.size === value\.length/);
  assert.match(contract, /Math\.min\(value\.emailCount as number, 5\)/);
  assert.match(contract, /value\.items\.length !== expectedItems/);
  assert.match(contract, /locator\.representationType !== "related_review"/);
});

test("observed contact normalizers cover zero one multiple preview and paging", () => {
  const zero = { emailCount: 0, emailPreview: [], phoneCount: 0, phonePreview: [], semantics: "observed", singleEmail: null, singlePhone: null };
  const one = { emailCount: 1, emailPreview: ["one@example.test"], phoneCount: 1, phonePreview: ["+56911111111"], semantics: "observed", singleEmail: "one@example.test", singlePhone: "+56911111111" };
  const many = { emailCount: 3, emailPreview: ["a@example.test", "b@example.test", "c@example.test"], phoneCount: 7, phonePreview: ["1", "2", "3", "4", "5"], semantics: "observed", singleEmail: null, singlePhone: null };
  assert.ok(normalizeCustomer360Overview(relatedOverview(zero)));
  assert.ok(normalizeCustomer360Overview(relatedOverview(one)));
  assert.ok(normalizeCustomer360Overview(relatedOverview(many)));
  assert.equal(normalizeCustomer360Overview(relatedOverview({ ...many, phonePreview: ["1", "1", "2", "3", "4"] })), null);
  assert.ok(normalizeCustomer360ObservedContacts({
    contactType: "phone", contractVersion: "CUSTOMER_360_V1", items: ["1", "2", "3", "4", "5"],
    locator: relatedLocator, ok: true,
    pagination: { hasNextPage: true, page: 1, pageSize: 5, total: 7 }, semantics: "observed",
  }));
  assert.ok(normalizeCustomer360ObservedContacts({
    contactType: "phone", contractVersion: "CUSTOMER_360_V1", items: ["6", "7"],
    locator: relatedLocator, ok: true,
    pagination: { hasNextPage: false, page: 2, pageSize: 5, total: 7 }, semantics: "observed",
  }));
});

test("HTTP routes authenticate, disable caching, and map safe statuses", () => {
  for (const route of [overviewRoute, bookingsRoute, contactsRoute]) {
    assert.match(route, /getActiveAdminUser\(\)/);
    assert.match(route, /Cache-Control": "no-store/);
    assert.match(route, /customer360LocatorFromRequest/);
  }
  assert.match(bookingsRoute, /pageSize[^\n]*100/);
  assert.match(contactsRoute, /locator\.representationType !== "related_review"/);
  assert.match(contactsRoute, /contactType !== "email" && contactType !== "phone"/);
  assert.match(admin, /customer_window_360_v1_get_overview/);
  assert.match(admin, /customer_window_360_v1_list_bookings/);
  assert.match(admin, /customer_window_360_v1_list_observed_contacts/);
  assert.match(http, /code === "stale_representation"\) return 409/);
  assert.doesNotMatch(overviewRoute + bookingsRoute, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("UI loads overview and bookings independently and renders stale safely", () => {
  assert.match(view, /function Customer360Drawer/);
  assert.match(view, /customer-window\/360\/overview/);
  assert.match(view, /customer-window\/360\/bookings/);
  assert.match(view, /customer-window\/360\/contacts/);
  assert.match(view, /setOverviewLoading/);
  assert.match(view, /setBookingsLoading/);
  assert.match(view, /Esta representación ya no está vigente\. Actualiza Customer Window\./);
  assert.match(view, /Revisión relacionada · Solo lectura/);
  assert.match(view, /Cobertura por fuente/);
  assert.match(view, /CustomerPurchaseTimeline/);
  assert.match(view, /function Customer360ObservedContactGroup/);
  assert.match(view, /count > 5/);
  assert.match(view, /Ver todos \(\$\{displayCount\(count\)\}\)/);
  assert.match(view, /Ver menos/);
  assert.match(view, /controller\.current\?\.abort\(\)/);
  assert.doesNotMatch(view.slice(view.indexOf("function Customer360ObservedContactGroup"), view.indexOf("function Customer360Drawer")), /Confirmado|Directo/);
  assert.match(request, /readonly code: string \| null/);
});

test("related Customer 360 restores lazy read-only identity tabs without changing confirmed", () => {
  const drawer = view.slice(view.indexOf("function Customer360Drawer"), view.indexOf("function RelatedReviewDrawer"));
  assert.match(drawer, /\["summary", "history", "identity"\]/);
  for (const label of ["Resumen", "Historial", "Identidad"]) assert.match(drawer, new RegExp(`"${label}"`));
  assert.match(drawer, /representation\.representationType !== "related_review"[\s\S]*return/);
  assert.match(drawer, /async function openCustomer360Identity\(\)[\s\S]*action: "identity-resolution-detail-v2"/);
  assert.match(drawer, /relatedGroupId: representation\.relatedGroupId/);
  assert.match(drawer, /nextDetail\.snapshotId !== expectedLocator\.authoritySnapshotId/);
  assert.match(drawer, /setIdentityDetailStale\(true\)/);
  assert.match(drawer, /stale_representation[\s\S]*Esta representación ya no está vigente\. Actualiza Customer Window\./);
  assert.match(drawer, /identityDetail \|\| identityDetailLoading \|\| identityDetailController\.current/);
  assert.match(drawer, /identityDetailController\.current\?\.abort\(\)/);
  assert.match(drawer, /setIdentityDetailError\("No fue posible cargar el detalle de identidad\."\)/);
  assert.match(drawer, /<CustomerIdentityResolutionPanel[\s\S]*group=\{null\}[\s\S]*timeline=\{null\}/);
  assert.doesNotMatch(drawer, /customer_window_confirm_same_identity_simple_v1_m2m|customer_window_preview_confirm_same_identity_simple_v1_m2m/);
  assert.match(view, /function RelatedReviewDrawer/);
  assert.match(view, /<RelatedReviewDrawer key="related-review-legacy-closed"/);
});

test("identity detail keeps observed and historical contacts distinct for the control group", () => {
  const detail = normalizeCustomerWindowIdentityResolutionDetailV2({
    events: [{
      createdAt: "2026-09-25T12:00:00Z",
      eventId: "11111111-1111-4111-8111-111111111111",
      eventType: "conflict",
      evidence: {
        contradictorySignals: true,
        emailBookingCount: 224,
        emailsForPhone: 2,
        phoneBookingCount: 254,
        phonesForEmail: 1,
      },
      profileId: "22222222-2222-4222-8222-222222222222",
      reason: "contradictory_phone_email",
      resolverVersion: "customer_identity_v2",
      source: "MCP_EAP",
      sourceRowId: 1,
    }],
    members: [{
      linkStatus: "conflict",
      profileId: "22222222-2222-4222-8222-222222222222",
      reason: "contradictory_phone_email",
      relationshipType: "EXACT_EMAIL",
      resolverVersion: "customer_identity_v2",
      source: "MCP_EAP",
      sourceRowId: 1,
    }],
    profiles: [{
      bookingCount: 1,
      firstBookingAt: "2026-09-25T11:00:00Z",
      lastBookingAt: "2026-09-25T11:00:00Z",
      mergedIntoProfileId: null,
      profileId: "22222222-2222-4222-8222-222222222222",
      resolverVersions: ["customer_identity_v2"],
      status: "active",
    }],
    relatedContacts: {
      emails: [{ bookingCode: "MCP500680", bookingCount: 1, firstSeenAt: "2026-09-25T11:00:00Z", lastSeenAt: "2026-09-25T11:00:00Z", observedAt: "2026-09-25T11:00:00Z", profileId: "22222222-2222-4222-8222-222222222222", relation: "observed_in_group", relationReason: null, source: "MCP_EAP", sourceCount: 1, sourceRowId: 806093, type: "email", value: "benjaponsr@gmail.com" }, { bookingCode: "25LJL1009", bookingCount: 1, firstSeenAt: "2025-06-02T12:39:39", lastSeenAt: "2025-06-02T12:39:39", observedAt: "2025-06-02T12:39:39", profileId: null, relation: "historically_related", relationReason: "same_phone_history", source: "OKP", sourceCount: 1, sourceRowId: 202921, type: "email", value: "iiii@okpe.cl" }],
      phones: [{ bookingCode: "MCP500680", bookingCount: 1, firstSeenAt: "2026-09-25T11:00:00Z", lastSeenAt: "2026-09-25T11:00:00Z", observedAt: "2026-09-25T11:00:00Z", profileId: "22222222-2222-4222-8222-222222222222", relation: "observed_in_group", relationReason: null, source: "MCP_EAP", sourceCount: 1, sourceRowId: 806093, type: "phone", value: "56982287983" }],
    },
    relatedGroupId: "ecb286114f10e203f5125bc35f65eb72663e817460ad03d5b6dfb17ad4018cb9",
    snapshotId: relatedLocator.authoritySnapshotId,
    summary: { bookingCount: 1, candidateCount: 0, conflictCount: 1, emailCount: 1, phoneCount: 1, profileCount: 1, sourceCustomerCount: 1, v1BookingCount: 0, v2BookingCount: 1 },
  });
  assert.ok(detail);
  assert.equal(detail.relatedContacts.emails.find((contact) => contact.relation === "observed_in_group")?.value, "benjaponsr@gmail.com");
  assert.equal(detail.relatedContacts.emails.find((contact) => contact.relation === "historically_related")?.value, "iiii@okpe.cl");
  assert.equal(detail.relatedContacts.emails.find((contact) => contact.relation === "historically_related")?.source, "OKP");
  assert.equal(detail.summary.emailCount, 1);
  assert.equal(detail.events[0].reason, "contradictory_phone_email");
  assert.equal(detail.events[0].evidence.emailsForPhone, 2);
  const contacts = view.slice(view.indexOf("function CustomerRelatedContacts"), view.indexOf("const CUSTOMER_IDENTITY_PREVIEW_STATUS"));
  assert.match(contacts, /contact\.relation === "observed_in_group"/);
  assert.match(contacts, /contact\.relation === "historically_related"/);
  assert.match(contacts, /Los históricos explican relaciones del caso; no confirman que pertenezcan a una misma persona\./);
  assert.match(view, /Mismo teléfono/);
  assert.match(view, /Fuente:/);
  assert.match(view, /Reserva:/);
});

test("identity panel keeps profiles members evidence and conceptual decisions bounded and read only", () => {
  const panel = view.slice(view.indexOf("function CustomerIdentityResolutionPanel"), view.indexOf("function CustomerEconomicsPanel"));
  for (const label of ["Composición de miembros", "Perfiles involucrados", "Historial de resolución", "Solo vista previa"]) assert.match(panel, new RegExp(label));
  for (const label of ["Confirmar misma identidad", "Mantener relacionados", "Mantener separados", "Cuenta compartida / terceros"]) assert.match(identityPreview, new RegExp(label));
  assert.match(panel, /IDENTITY_MEMBER_INITIAL_LIMIT/);
  assert.match(panel, /IDENTITY_PROFILE_INITIAL_LIMIT/);
  assert.match(panel, /IDENTITY_EVENT_GROUP_INITIAL_LIMIT/);
  assert.match(panel, /Relationship type[\s\S]*Link status[\s\S]*Resolver/);
  assert.match(view, /Detalle técnico de evidencia/);
  assert.doesNotMatch(panel, /fetch\(|getJson\(|confirm_same_identity_simple_v1_m2m/);
});

test("normalizers enforce the canonical locator and booking shape", () => {
  assert.match(contract, /representationKey !== `\$\{representationType\}:\$\{representationId\}`/);
  assert.match(contract, /customerUniverse !== "GLOBAL"/);
  assert.match(contract, /customerUniverse !== "MCP_EAP"/);
  assert.match(contract, /typeof value\.sourceRowId !== "string"/);
  assert.match(contract, /value\.amount === null[^\n]*value\.amountKind === null/);
  assert.match(contract, /items\.some\(\(item\) => item\?\.observedEmail !== null/);
});

test("reversible harness covers catalog ACL RLS stale rollback and large histories", () => {
  assert.match(harness, /never-existing group was accepted/);
  assert.match(harness, /merged confirmed representation was accepted/);
  assert.match(harness, /procedure\.provolatile = 's'/);
  assert.match(harness, /set local role service_role;[\s\S]*service_role RLS interaction failed[\s\S]*reset role;/);
  assert.match(harness, /generate_series\(1, 5000\)/);
  assert.match(harness, /generate_series\(1, 1000\)/);
  assert.match(harness, /observed contact preview\/pagination contract failed/);
  assert.match(harness, /jsonb_array_length\(v_overview #> '\{identity,contacts,phonePreview\}'\) <> 5/);
  assert.match(harness, /explain \(analyze, buffers, verbose\)/);
  assert.match(harness, /rollback;[\s\S]*fixtures_absent_after_rollback[\s\S]*baseline_functions_restored_after_rollback/);
});

test("reversible harness embeds exactly the incremental migration body", () => {
  const migrationBody = observedContactsMigration
    .replace(/^begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "")
    .trim();
  const embedded = harness.match(/-- BEGIN EMBEDDED 150000 BODY\s*([\s\S]*?)\s*-- END EMBEDDED 150000 BODY/);
  assert.ok(embedded);
  assert.equal(embedded[1].trim(), migrationBody);
});
