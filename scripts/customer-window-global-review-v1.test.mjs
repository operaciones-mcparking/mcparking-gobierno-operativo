import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929140000_add_customer_window_global_review_v1.sql",
  "utf8",
);
const identityContactEvidenceMigration = readFileSync(
  "supabase/migrations/20261001190000_extend_customer_window_global_review_identity_contact_evidence.sql",
  "utf8",
);
const consolidatedIdentityMigration = readFileSync(
  "supabase/migrations/20261002120000_consolidate_customer_window_global_review_identity_contacts.sql",
  "utf8",
);
const optimizedIdentityMigration = readFileSync(
  "supabase/migrations/20261002160000_optimize_global_review_identity_mcp_eap_contacts.sql",
  "utf8",
);
const representation = readFileSync("src/lib/customer-window/customer-representations-v2.ts", "utf8");
const customer360 = readFileSync("src/lib/customer-window/customer-360-v1.ts", "utf8");
const globalContract = readFileSync("src/lib/customer-window/customer-360-global-review-v1.ts", "utf8");
const identityPreview = readFileSync("src/lib/customer-window/identity-decision-preview.ts", "utf8");
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

test("global review identity evidence preserves contact values for contact matches", () => {
  assert.match(identityContactEvidenceMigration, /create or replace function public\.customer_window_360_v1_get_global_review_identity\(p_locator jsonb\)/);
  assert.match(identityContactEvidenceMigration, /contact\.type, contact\.normalized_value, contact\.display_value/);
  assert.match(identityContactEvidenceMigration, /'phone'::text,[\s\S]*mcp\.phone_raw[\s\S]*okp\.phone_normalized/);
  assert.match(identityContactEvidenceMigration, /'email'::text,[\s\S]*mcp\.email_raw[\s\S]*okp\.email_normalized/);
  assert.match(identityContactEvidenceMigration, /'same_phone_history'::text relation_reason,[\s\S]*contact\.type contact_type, contact\.display_value, contact\.normalized_value/);
  assert.match(identityContactEvidenceMigration, /'same_email_history'::text,[\s\S]*contact\.type, contact\.display_value, contact\.normalized_value/);
  assert.match(identityContactEvidenceMigration, /'contactType', contact_type/);
  assert.match(identityContactEvidenceMigration, /'displayValue', display_value/);
  assert.match(identityContactEvidenceMigration, /'normalizedValue', normalized_value/);
  assert.match(identityContactEvidenceMigration, /jsonb_strip_nulls/);
  assert.match(identityContactEvidenceMigration, /null::text contact_type, null::text display_value, null::text normalized_value/);
  assert.match(identityContactEvidenceMigration, /grant execute on function public\.customer_window_360_v1_get_global_review_identity\(jsonb\) to customer_window_360_reader/);
  assert.doesNotMatch(identityContactEvidenceMigration, /grant execute on function public\.customer_window_360_v1_get_global_review_identity\(jsonb\) to service_role/);
});

test("global review identity exposes consolidated related contacts and canonical email evidence", () => {
  assert.match(consolidatedIdentityMigration, /create or replace function public\.customer_window_360_v1_get_global_review_identity\(p_locator jsonb\)/);
  assert.match(consolidatedIdentityMigration, /'relatedContacts', coalesce\(\(select value from related_contacts\)/);
  assert.match(consolidatedIdentityMigration, /nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(coalesce\(mcp\.email_normalized, okp\.email_normalized\)\)\), ''\)/);
  assert.match(consolidatedIdentityMigration, /same_phone_contacts as materialized/);
  assert.match(consolidatedIdentityMigration, /same_email_contacts as materialized/);
  assert.match(consolidatedIdentityMigration, /partition by contact\.type, contact\.normalized_value/);
  assert.match(consolidatedIdentityMigration, /reason_code = 'contradictory_phone_email' and normalized_contradiction is false[\s\S]*then 'requires_review'/);
  assert.match(consolidatedIdentityMigration, /'emailsForPhone', emails_for_phone/);
  assert.match(consolidatedIdentityMigration, /'phonesForEmail', phones_for_email/);
  assert.match(consolidatedIdentityMigration, /grant execute on function public\.customer_window_360_v1_get_global_review_identity\(jsonb\) to customer_window_360_reader/);
  assert.doesNotMatch(consolidatedIdentityMigration, /grant execute on function public\.customer_window_360_v1_get_global_review_identity\(jsonb\) to service_role/);
  assert.doesNotMatch(consolidatedIdentityMigration, /\b(?:insert|update|delete|merge|truncate)\b/i);
});

test("global review identity optimization keeps MCP EAP evidence while avoiding slow contact scans", () => {
  assert.match(optimizedIdentityMigration, /create or replace function public\.customer_window_360_v1_get_global_review_identity\(p_locator jsonb\)/);
  assert.match(optimizedIdentityMigration, /customer_window_global_review_v1_resolve_locator\(p_locator\)/);
  assert.match(optimizedIdentityMigration, /'relatedContacts', coalesce\(\(select value from related_contacts\)/);
  assert.match(optimizedIdentityMigration, /'relatedMcpEapEvidence'/);
  assert.match(optimizedIdentityMigration, /contact_phone_related_evidence as materialized/);
  assert.match(optimizedIdentityMigration, /contact_email_related_evidence as materialized/);
  assert.match(optimizedIdentityMigration, /on contact\.type = 'phone' and booking\.phone_normalized = contact\.normalized_value/);
  assert.match(optimizedIdentityMigration, /on contact\.type = 'email' and booking\.email_normalized = contact\.normalized_value/);
  assert.doesNotMatch(optimizedIdentityMigration, /nullif\(pg_catalog\.lower\(pg_catalog\.btrim\((?:okp|mcp|booking)\.email_normalized\)\), ''\) =/);
  assert.doesNotMatch(optimizedIdentityMigration, /join public\.customer_source_bookings_mcp_eap booking[\s\S]{0,260}\bor\b[\s\S]{0,260}customer_analytical_booking_assignments/);
  assert.match(optimizedIdentityMigration, /grant execute on function public\.customer_window_360_v1_get_global_review_identity\(jsonb\) to customer_window_360_reader/);
  assert.doesNotMatch(optimizedIdentityMigration, /\b(insert|update|delete|merge|truncate|create index|alter table)\b/i);
});

test("global review identity normalizer accepts contact evidence without breaking legacy payloads", () => {
  assert.match(globalContract, /contactType\?: "email" \| "phone"/);
  assert.match(globalContract, /displayValue\?: string/);
  assert.match(globalContract, /normalizedValue\?: string/);
  assert.match(globalContract, /const hasContactFields = value\.contactType !== undefined/);
  assert.match(globalContract, /if \(!hasContactFields\) return value as GlobalReviewRelatedEvidence/);
  assert.match(globalContract, /value\.evidenceSource !== "contact_match"/);
  assert.match(globalContract, /value\.relationReason === "same_email_history" && value\.contactType !== "email"/);
  assert.match(globalContract, /value\.relationReason === "same_phone_history" && value\.contactType !== "phone"/);
  assert.match(globalContract, /value\.relationReason === "profile_membership"/);
  assert.match(globalContract, /relatedContacts: \{/);
  assert.match(globalContract, /normalizeRelatedContacts\(value\.relatedContacts \?\? \{ emails: \[\], phones: \[\] \}\)/);
  assert.match(globalContract, /new Set\(contacts\.map\(\(contact\) => contact\.value\.trim\(\)\.toLowerCase\(\)\)\)\.size === contacts\.length/);
});

test("global review identity UI shows related email or phone values and keeps read-only policy", () => {
  const panel = view.slice(
    view.indexOf("function Customer360RelatedReviewEvidenceGroups"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(panel, /Evidencia de revisión/);
  assert.match(panel, /Grupos históricos relacionados utilizados como evidencia/);
  assert.match(panel, /Email relacionado/);
  assert.match(panel, /Teléfono relacionado/);
  assert.match(panel, /item\.displayValue/);
  assert.match(panel, /break-all text-xs font-medium text-navy/);
  assert.match(panel, /Grupo \{abbreviatedIdentifier\(group\.groupId\)\}/);
  assert.match(panel, /buildRelatedReviewEvidenceGroups\(evidence\)/);
  assert.match(panel, /group\.hasProfileMembership/);
  assert.doesNotMatch(panel, /Confirmar misma identidad|Unificar|Fusionar|Campaña/);
  assert.match(view, /relatedContacts/);
  assert.match(representation, /value: string/);
});

test("global review related review evidence is grouped by group with visual dedupe", () => {
  const grouping = view.slice(
    view.indexOf("type RelatedReviewEvidenceGroup"),
    view.indexOf("function identityResolutionEvidenceText"),
  );
  const panel = view.slice(
    view.indexOf("function Customer360RelatedReviewEvidenceGroups"),
    view.indexOf("function Customer360GlobalReviewIdentityPanel"),
  );
  assert.match(grouping, /emails: GlobalReviewRelatedEvidence\[\]/);
  assert.match(grouping, /phones: GlobalReviewRelatedEvidence\[\]/);
  assert.match(grouping, /hasProfileMembership: boolean/);
  assert.match(grouping, /evidence\.normalizedValue \|\| evidence\.displayValue \|\| ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(grouping, /evidence\.normalizedValue \|\| evidence\.displayValue/);
  assert.match(grouping, /emailKeys: new Set<string>\(\)/);
  assert.match(grouping, /phoneKeys: new Set<string>\(\)/);
  assert.match(grouping, /item\.relationReason === "profile_membership"/);
  assert.match(grouping, /left\.groupId\.localeCompare\(right\.groupId\)/);
  assert.match(panel, /relatedReviewEvidenceCountLabel\(group\.emails\.length, "email relacionado", "emails relacionados"\)/);
  assert.match(panel, /relatedReviewEvidenceCountLabel\(group\.phones\.length, "teléfono relacionado", "teléfonos relacionados"\)/);
  assert.match(panel, /Perfil presente en el grupo/);
  assert.doesNotMatch(panel, /Confirmar misma identidad|Unificar|Fusionar|Campaña/);
});

test("global review identity UI shows observed OKP identity without inventing RUT", () => {
  const panel = view.slice(
    view.indexOf("function Customer360RelatedReviewEvidenceGroups"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(panel, /overview: Customer360Overview \| null/);
  assert.match(panel, /observedIdentity: \{ emails: string\[\] \| null; phones: string\[\] \| null \}/);
  assert.match(view, /Identidad observada/);
  assert.match(view, /label="Emails"/);
  assert.match(view, /label="Teléfonos"/);
  assert.match(panel, /contacts\.emailPreview/);
  assert.match(panel, /contacts\.phonePreview/);
  assert.match(panel, /uniqueObservedValues/);
  assert.match(panel, /buildConsolidatedIdentityContacts/);
  assert.doesNotMatch(panel, /RUT:\s*[—-]/);
});

test("global review observed identity consolidates contacts without visual duplicates", () => {
  const consolidation = view.slice(
    view.indexOf("function visualEmailKey"),
    view.indexOf("function Customer360GlobalReviewIdentityPanel"),
  );
  const panel = view.slice(
    view.indexOf("function Customer360RelatedReviewEvidenceGroups"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(consolidation, /value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(consolidation, /options\.normalizedValue \|\| value/);
  assert.match(consolidation, /current\?\.kind === "observed" \|\| options\.kind === "observed" \? "observed" : "related"/);
  assert.match(consolidation, /for \(const evidence of relatedEvidence \?\? \[\]\)/);
  assert.match(consolidation, /relatedContacts\?\.emails/);
  assert.match(consolidation, /relatedContacts\?\.phones/);
  assert.match(consolidation, /evidence\.contactType === "email"/);
  assert.match(consolidation, /evidence\.contactType === "phone"/);
  assert.match(view, /displayValue: string/);
  assert.match(consolidation, /ValueBadge tone=\{contact\.kind === "observed" \? "warning" : "neutral"\}/);
  assert.match(consolidation, /contact\.kind === "observed" \? "Observado" : "Relacionado"/);
  assert.match(panel, /relatedContacts: detail\.relatedContacts/);
  assert.match(panel, /relatedEvidence: detail\.relatedMcpEapEvidence/);
  assert.match(panel, /<Customer360ObservedIdentityContacts contacts=\{consolidatedContacts\} \/>/);
});

test("global review identity UI exposes review reason safely", () => {
  const panel = view.slice(
    view.indexOf("function Customer360GlobalReviewIdentityPanel"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(view, /contradictory_phone_email: "El teléfono y el email entregan señales contradictorias de identidad."/);
  assert.match(view, /function globalReviewReasonLabel\(reason: string\)/);
  assert.match(view, /GLOBAL_REVIEW_REASON_LABELS\[reason\] \?\? "Se requieren más señales para confirmar la identidad."/);
  assert.match(panel, /Motivo de revisión/);
  assert.match(panel, /detail\.events\.map\(\(event\) => event\.reason\)/);
  assert.match(panel, /globalReviewReasonLabel\(reason\)/);
});

test("global review identity UI explains observed signals using backend contacts and matching counters", () => {
  const signals = view.slice(
    view.indexOf("function buildIdentityObservedSignals"),
    view.indexOf("function identityResolutionEvidenceSignature"),
  );
  const panel = view.slice(
    view.indexOf("function Customer360GlobalReviewIdentityPanel"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(view, /function CustomerIdentityObservedSignals/);
  assert.match(signals, /emailsForPhone/);
  assert.match(signals, /phonesForEmail/);
  assert.match(signals, /visibleEmailCount/);
  assert.match(signals, /visiblePhoneCount/);
  assert.match(signals, /rawEmailsForPhone !== null && counts\.visibleEmailCount !== undefined/);
  assert.match(signals, /emailBookingCount/);
  assert.match(signals, /phoneBookingCount/);
  assert.match(signals, /Reservas involucradas/);
  assert.match(signals, /Links candidate \/ conflict/);
  assert.match(panel, /<CustomerIdentityObservedSignals items=\{observedSignals\} \/>/);
  assert.match(panel, /visibleEmailCount: consolidatedContacts\.filter\(\(contact\) => contact\.type === "email"\)\.length/);
  assert.match(panel, /visiblePhoneCount: consolidatedContacts\.filter\(\(contact\) => contact\.type === "phone"\)\.length/);
  assert.doesNotMatch(signals, /displayValue|normalizedValue|contact\.value|emailPreview|phonePreview/);
});

test("global review identity restores non destructive decision preview buttons", () => {
  const panel = view.slice(
    view.indexOf("function Customer360GlobalReviewIdentityPanel"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(view, /function CustomerIdentityDecisionPreviewOptions/);
  assert.match(view, /Posibles decisiones · Solo vista previa/);
  for (const label of ["Confirmar misma identidad", "Mantener relacionados", "Mantener separados", "Cuenta compartida / terceros"]) {
    assert.match(identityPreview, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(panel, /useState<CustomerIdentityDecision \| null>\(null\)/);
  assert.match(panel, /<CustomerIdentityDecisionPreviewOptions decisionPreview=\{null\}/);
  assert.match(view, /Esta ficha no ejecuta cambios ni llama operaciones de escritura\./);
  assert.doesNotMatch(panel, /fetch\(|getJson\(|postJson\(|rpc\(|confirm_same_identity|merge|campaign/i);
});

test("global review identity panel reuses loaded overview and remains read-only", () => {
  const drawer = view.slice(view.indexOf("function Customer360Drawer"), view.indexOf("function RelatedReviewDrawer"));
  const panel = view.slice(
    view.indexOf("function Customer360RelatedReviewEvidenceGroups"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(drawer, /<Customer360GlobalReviewIdentityPanel detail=\{globalIdentity\} observedIdentity=\{globalObservedIdentity\} overview=\{overview\} \/>/);
  assert.match(drawer, /loadCompleteGlobalObservedIdentity/);
  assert.match(drawer, /contacts\.emailCount <= contacts\.emailPreview\.length/);
  assert.match(drawer, /customer-window\/360\/contacts/);
  assert.match(drawer, /normalizeCustomer360ObservedContacts/);
  assert.match(panel, /No existe relación certificada con un grupo MCP\/EAP activo/);
  assert.match(panel, /item\.displayValue/);
  assert.doesNotMatch(panel, /Unificar|Fusionar|Campaña|Elegir principal|Principal automático/);
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
