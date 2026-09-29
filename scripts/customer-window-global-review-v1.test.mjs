import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929140000_add_customer_window_global_review_v1.sql",
  "utf8",
);
const representation = readFileSync("src/lib/customer-window/customer-representations-v2.ts", "utf8");
const customer360 = readFileSync("src/lib/customer-window/customer-360-v1.ts", "utf8");
const globalContract = readFileSync("src/lib/customer-window/customer-360-global-review-v1.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const analyticsRoute = readFileSync("src/app/api/orquestador/customer-window/360/analytics/route.ts", "utf8");
const identityRoute = readFileSync("src/app/api/orquestador/customer-window/360/identity/route.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const harness = readFileSync(
  "supabase/debug/customer_window_global_review_v1_reversible_test.sql",
  "utf8",
);

test("global review key is stable, profile-scoped and fail-closed", () => {
  assert.match(migration, /representationKey', ''\) <> 'global_review:' \|\| coalesce\(p_locator ->> 'representationId'/);
  assert.match(migration, /customerUniverse' <> 'GLOBAL_REVIEW'/);
  assert.match(migration, /authoritySnapshotId' is distinct from 'null'::jsonb/);
  assert.match(migration, /profile\.needs_review is true/);
  assert.match(migration, /link\.status = 'active'[\s\S]*representation_contract_unavailable/);
  assert.match(migration, /link\.status in \('candidate', 'conflict'\)/);
});

test("read model is link-driven and adds no storage objects", () => {
  assert.match(migration, /customer_booking_profile_links/);
  assert.match(migration, /customer_source_bookings_mcp_eap/);
  assert.match(migration, /customer_source_bookings_okp/);
  assert.doesNotMatch(migration, /\bcreate\s+(?:table|index|materialized\s+view)\b/i);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|merge|truncate)\b/i);
  assert.match(migration, /group by representation_type, profile_id/);
  assert.match(migration, /l\.source = 'OKP' and l\.source_row_id = b\.source_row_id/);
  assert.match(migration, /l\.source = 'MCP_EAP' and l\.source_row_id = b\.source_row_id/);
});

test("one booking link resolves to one operational representation", () => {
  assert.match(migration, /case row\.link_status when 'active' then 'confirmed_customer' else 'global_review' end/);
  assert.match(migration, /row\.link_status = 'active'[\s\S]*row\.link_status in \('candidate', 'conflict'\)/);
  assert.match(migration, /not exists \([\s\S]*active_link\.profile_id = row\.profile_id[\s\S]*active_link\.status = 'active'/);
  assert.doesNotMatch(migration, /global_review:[^']*snapshot/i);
  assert.doesNotMatch(migration, /pending_identity/i);
});

test("operational reconciliation separates stable authority from hot pending rows", () => {
  assert.match(migration, /snapshot\.captured_at - interval '30 minutes' as is_stable/);
  assert.match(migration, /where row\.is_stable/);
  assert.match(migration, /'validReservations', reconciliation\.valid_reservations/);
  assert.match(migration, /'stableReservations', reconciliation\.stable_reservations/);
  assert.match(migration, /'representedConfirmedReservations', reconciliation\.represented_confirmed_reservations/);
  assert.match(migration, /'representedReviewReservations', reconciliation\.represented_review_reservations/);
  assert.match(migration, /'hotPendingReservations', reconciliation\.hot_pending_reservations/);
  assert.match(migration, /'unrepresentedStableReservations', reconciliation\.stable_reservations/);
  assert.match(representation, /validReservations[\s\S]*stableReservations[\s\S]*hotPendingReservations/);
  assert.match(representation, /unrepresentedStableReservations\) !== BigInt\(0\)/);
  assert.match(view, /reservas recientes pendientes de estabilizar identidad/);
});

test("MCP related groups remain evidence and never become merge authority", () => {
  assert.match(migration, /relatedMcpEapEvidence/);
  assert.match(migration, /profile_membership/);
  assert.match(migration, /same_phone_history/);
  assert.match(migration, /same_email_history/);
  assert.match(migration, /union[\s\S]*contact_related_evidence/);
  assert.equal((migration.match(/having count\(\*\) = 1/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /\b(?:merge|merged_into_profile_id\s*=|update\s+public\.customer_profiles)\b/i);
});

test("RPCs are private, stable and service-role-only", () => {
  const publicFunctions = [
    "customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)",
    "customer_window_v2_search_global_v1(text,text,text,bigint,text,integer)",
    "customer_window_360_v1_get_global_review_overview(jsonb)",
    "customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)",
    "customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)",
    "customer_window_360_v1_get_global_review_analytics(jsonb)",
    "customer_window_360_v1_get_global_review_identity(jsonb)",
  ];
  for (const signature of publicFunctions) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to service_role`));
  }
  assert.equal((migration.match(/\bstable\b/g) ?? []).length >= 7, true);
  assert.equal((migration.match(/security definer/g) ?? []).length >= 7, true);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length >= 8, true);
});

test("invalid input helper is not immutable or planner-foldable", () => {
  assert.match(
    migration,
    /customer_window_global_review_v1_invalid\(p_reason text\)[\s\S]*?language plpgsql\s+stable\s+set search_path = ''/,
  );
  assert.doesNotMatch(
    migration,
    /customer_window_global_review_v1_invalid\(p_reason text\)[\s\S]*?language plpgsql\s+immutable/,
  );
});

test("Customer 360 supports global review without weakening confirmed or related", () => {
  assert.match(customer360, /"confirmed_customer" \| "global_review" \| "related_review"/);
  assert.match(customer360, /customerUniverse: "GLOBAL_REVIEW"/);
  assert.match(representation, /"global_review_profile"/);
  assert.match(globalContract, /automationEnabled: false/);
  assert.match(globalContract, /status: "BLOCKED" \| "REVIEW"/);
  assert.doesNotMatch(globalContract, /ELIGIBLE/);
  assert.match(admin, /customer_window_360_v1_get_global_review_overview/);
  assert.match(admin, /customer_window_360_v1_list_global_review_bookings/);
  assert.match(admin, /customer_window_360_v1_list_global_review_contacts/);
  assert.match(analyticsRoute, /getCustomerWindow360GlobalReviewAnalytics/);
  assert.match(identityRoute, /representationType !== "global_review"/);
});

test("source tables use the same yellow review semantics and explicit QTY", () => {
  assert.match(view, /total \{list\.family === "OKP" \? "OKP" : "MCP\/EAP"\}/);
  assert.match(view, /en período/);
  assert.match(view, /Actividad cross-source/);
  assert.match(view, /Alcance: perfil global en revisión/);
  assert.match(view, /Revisión global · Solo lectura/);
  assert.match(view, /badgeTone=\{review \? "warning" : "success"\}/);
  assert.match(migration, /review_counts\.has_mcp_eap and review_counts\.has_okp then 'ACTIVITY_CROSS_SOURCE'/);
  assert.match(migration, /p_page::bigint - 1/);
  assert.match(representation, /\["ACTIVITY_CROSS_SOURCE", "ACTIVITY_MCP_EAP", "ACTIVITY_OKP"\]/);
  assert.doesNotMatch(representation, /global_review[\s\S]{0,500}MIGRATED_TO/);
});

test("global analytics and identity are lazy, read-only and preserve no-campaign policy", () => {
  const drawer = view.slice(view.indexOf("function Customer360Drawer"), view.indexOf("function RelatedReviewDrawer"));
  assert.match(drawer, /customer-window\/360\/analytics/);
  assert.match(drawer, /customer-window\/360\/identity/);
  assert.match(drawer, /normalizeCustomer360GlobalReviewAnalytics/);
  assert.match(drawer, /normalizeCustomer360GlobalReviewIdentity/);
  assert.match(view, /No están habilitados para campañas automáticas/);
  assert.doesNotMatch(drawer, /Confirmar misma identidad|Unificar|Fusionar|Campaña/);
});

test("global search and operational list share the same representation authority", () => {
  assert.match(admin, /customer_window_v2_list_operational_global_v1/);
  assert.match(admin, /customer_window_v2_search_global_v1/);
  assert.match(migration, /'representationKey', selected\.representation_type \|\| ':' \|\| selected\.profile_id::text/);
  assert.match(migration, /'reviewProfileId', case when selected\.representation_type = 'global_review'/);
  assert.match(representation, /item\.authoritySnapshotId !== null/);
  assert.match(representation, /"observed_in_review_profile"/);
  assert.match(migration, /selected\.match_type in \('exact_booking', 'exact_source_row'\) then 'booking'/);
  assert.match(migration, /selected\.match_type = 'exact_source_customer' then 'source_customer'/);
  for (const identityType of ["email", "phone", "plate", "source_customer_id"]) {
    assert.match(migration, new RegExp(`identity\\.identity_type = '${identityType}'`));
  }
  assert.doesNotMatch(migration.slice(migration.indexOf("identity_candidates as materialized"), migration.indexOf("all_matches as materialized")), /identity_type = 'email'[\s\S]*\sor\s/);
});

test("reversible harness embeds the exact migration and restores a clean baseline", () => {
  const migrationBody = migration
    .replaceAll("\r\n", "\n")
    .replace(/^begin;\s*/i, "")
    .replace(/\s*commit;\s*$/i, "")
    .trim();
  assert.ok(harness.includes(migrationBody));
  assert.match(harness, /global_review_harness_requires_clean_baseline/);
  assert.match(harness, /valid=% confirmed=% review=% unrepresented=% duplicates=%/);
  assert.match(harness, /if v_valid <> 28 or v_confirmed <> 22 or v_review <> 6/);
  assert.match(harness, /mcp_eap_stable_reconciliation_failed/);
  assert.doesNotMatch(harness, /v_valid <> 115|v_stable <> 74|v_hot <> 41/);
  assert.doesNotMatch(harness, /v_confirmed <> 52|v_review <> 22/);
  assert.match(harness, /v_valid <> v_stable \+ v_hot/);
  assert.match(harness, /v_stable <> v_confirmed \+ v_review/);
  assert.match(
    harness,
    /v_hot <> v_hot_without_link \+ v_hot_with_recent_link \+ v_hot_other/,
  );
  assert.match(harness, /booking_link_id is null/);
  assert.match(harness, /booking_link_id is not null and has_recent_link/);
  assert.match(harness, /v_unrepresented_stable <> 0/);
  assert.match(harness, /rollback;[\s\S]*global_review_rollback_cleanup_failed/);
});
