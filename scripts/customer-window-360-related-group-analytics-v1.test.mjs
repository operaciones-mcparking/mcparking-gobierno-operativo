import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929120000_add_customer_window_360_related_group_analytics_v1.sql",
  "utf8",
);
const builder = readFileSync("scripts/customer-window-related-review-mcp-eap-v1-build.mjs", "utf8");
const readyAudit = readFileSync(
  "scripts/customer-window-related-review-mcp-eap-v1-ready-audit-core.mjs",
  "utf8",
);
const contract = readFileSync(
  "src/lib/customer-window/customer-360-related-group-analytics-v1.ts",
  "utf8",
);
const route = readFileSync(
  "src/app/api/orquestador/customer-window/360/analytics/route.ts",
  "utf8",
);
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const harness = readFileSync(
  "supabase/debug/customer_window_360_related_group_analytics_v1_reversible_test.sql",
  "utf8",
);
const explain = readFileSync(
  "supabase/debug/customer_window_360_related_group_analytics_v1_explain.sql",
  "utf8",
);

test("snapshot tables are compact, private, indexed by the logical key and cascade", () => {
  assert.match(migration, /create table public\.customer_related_review_group_analytics/);
  assert.match(migration, /create table public\.customer_related_review_contact_candidates/);
  assert.match(migration, /primary key \(snapshot_id, group_id\)/);
  assert.match(migration, /primary key \(snapshot_id, group_id, type, normalized_value\)/);
  assert.match(migration, /references public\.customer_related_review_groups\(snapshot_id, group_id\)[\s\S]*on delete cascade/g);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on table public\.customer_related_review_group_analytics[\s\S]*service_role/);
  assert.doesNotMatch(migration, /customer_identity_links[\s\S]*(?:insert|update|delete)/i);
});

test("builder materializes only snapshot MCP EAP assignments and audits both models", () => {
  assert.match(builder, /GROUP_ANALYTICS_INSERT_SQL[\s\S]*rr_source[\s\S]*rr_hmac/);
  assert.match(builder, /customer_source_bookings_mcp_eap/);
  assert.match(builder, /booking\.is_pack is false/);
  assert.match(builder, /customer_window_parking_family_rules/);
  assert.match(builder, /CONTACT_CANDIDATES_INSERT_SQL[\s\S]*observed_in_group/);
  assert.match(builder, /phase = "group_analytics_insert"/);
  assert.match(builder, /phase = "contact_candidates_insert"/);
  assert.match(builder, /contact_candidate_coverage_mismatch/);
  assert.doesNotMatch(builder.slice(builder.indexOf("GROUP_ANALYTICS_INSERT_SQL"), builder.indexOf("EXPECTED_GROUPS_SQL")), /customer_source_bookings_okp/);
  assert.match(readyAudit, /groups_analytics/);
  assert.match(readyAudit, /bad_contact_candidate_keys/);
});

test("RPC is exact-snapshot, service-role-only, additive, and read-only", () => {
  assert.match(migration, /customer_window_360_v1_resolve_locator\(p_locator\)/);
  assert.match(migration, /representationType' <> 'related_review'/);
  assert.match(migration, /language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.customer_window_360_v1_get_related_group_analytics\(jsonb\)[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.customer_window_360_v1_get_related_group_analytics\(jsonb\)[\s\S]*service_role/);
  const rpc = migration.slice(migration.indexOf("create or replace function public.customer_window_360_v1_get_related_group_analytics"));
  assert.doesNotMatch(rpc, /\b(?:insert|update|delete|merge)\b/i);
  assert.match(route, /getCustomerWindow360RelatedGroupAnalytics/);
  assert.match(admin, /customer_window_360_v1_get_related_group_analytics/);
});

test("contract accepts REVIEW and BLOCKED while rejecting any other state", () => {
  assert.match(contract, /status: "REVIEW" \| "BLOCKED"/);
  assert.match(contract, /value\.eligibility\.status !== "REVIEW"[\s\S]*value\.eligibility\.status !== "BLOCKED"/);
  assert.doesNotMatch(contract, /status: "ELIGIBLE"/);
  assert.match(migration, /eligibility_status in \('REVIEW', 'BLOCKED'\)/);
  assert.match(builder, /'AUTOMATION_NOT_AUTHORIZED_V1'/);
  assert.match(contract, /automationEnabled: false/);
  assert.match(contract, /detailSurface: "identity"/);
});

test("zero and null semantics remain distinct", () => {
  assert.match(migration, /economic_days_sample_size = 0 and total_economic_days is null/);
  assert.match(migration, /boleta_economic_sample_size = 0 and boleta_paid_amount is null/);
  assert.match(contract, /\(economicDays\.sampleSize === 0\) !== \(economicDays\.total === null\)/);
  assert.match(contract, /\(economics\.sampleSize === 0\) !== \(economics\.paidAmount === null\)/);
  assert.match(contract, /boletaBookings \+ packBookings !== totalValidBookings/);
});

test("related analytics tab is lazy, bounded and leaves confirmed analytics unchanged", () => {
  const drawer = view.slice(view.indexOf("function Customer360Drawer"), view.indexOf("function RelatedReviewDrawer"));
  assert.match(drawer, /\["summary", "history", "analytics", "identity"\]/);
  assert.match(drawer, /normalizeCustomer360RelatedGroupAnalytics/);
  assert.match(drawer, /related_group_analytics_not_materialized/);
  assert.match(drawer, /analyticsController\.current !== controller/);
  assert.match(view, /Analítica del grupo relacionado/);
  assert.match(view, /No representa una persona confirmada/);
  assert.match(view, /Esta versión no autoriza campañas automáticas/);
  assert.match(view, /slice\(0, RELATED_ANALYTICS_CONTACT_INITIAL_LIMIT\)/);
  assert.match(view, /Ver todos/);
  assert.match(view, /OKP puede aparecer como evidencia histórica en Identidad, no como reserva del grupo/);
  assert.match(drawer, /!related && activeView === "analytics"[\s\S]*Customer360BoletaAnalyticsPanel/);
  assert.doesNotMatch(drawer, /Enviar campaña/);
});

test("contactability badges explain REVIEW and BLOCKED accessibly without changing the contract", () => {
  const help = view.slice(
    view.indexOf("const RELATED_CONTACT_STATUS_HELP"),
    view.indexOf("function Customer360RelatedGroupAnalyticsPanel"),
  );
  assert.match(help, /BLOCKED:[\s\S]*No habilitado para campañas automáticas/);
  assert.match(help, /Este contacto pertenece a un grupo con identidad en revisión o señales ambiguas/);
  assert.match(help, /REVIEW:[\s\S]*Requiere revisión/);
  assert.match(help, /El contacto tiene evidencia útil, pero todavía no cumple las condiciones para uso automático/);
  assert.match(help, /AUTOMATION_NOT_AUTHORIZED_V1: "Automatización aún no habilitada"/);
  assert.match(help, /CURRENT_CONFLICT_LINK: "Identidad en conflicto"/);
  assert.match(help, /MULTIPLE_PROFILES_IN_GROUP: "Varios perfiles relacionados"/);
  assert.match(help, /MULTIPLE_PHONES_IN_GROUP: "Varios teléfonos asociados"/);
  assert.match(help, /onMouseEnter=\{\(\) => setOpen\(true\)\}/);
  assert.match(help, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(help, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(help, /aria-describedby=\{open \? descriptionId : undefined\}/);
  assert.match(help, /aria-expanded=\{open\}/);
  assert.match(help, /role="tooltip"/);
  assert.match(help, /event\.key === "Escape"/);
  assert.match(help, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.doesNotMatch(help, /reasonCodes\.join/);
  assert.match(contract, /status: "REVIEW" \| "BLOCKED"/);
  assert.doesNotMatch(contract, /status: "ELIGIBLE"/);
  assert.doesNotMatch(help, /Enviar campaña/);
});

test("large contactability lists stay summarized and paginate twenty candidates at a time", () => {
  const panel = view.slice(
    view.indexOf("function Customer360RelatedGroupAnalyticsPanel"),
    view.indexOf("function Customer360Drawer"),
  );
  assert.match(view, /RELATED_ANALYTICS_CONTACT_INITIAL_LIMIT = 5/);
  assert.match(view, /RELATED_CONTACT_PAGE_SIZE = 20/);
  assert.match(panel, /allCandidates\.slice\([\s\S]*contactPage - 1[\s\S]*RELATED_CONTACT_PAGE_SIZE/);
  assert.match(panel, /allCandidates\.slice\(0, RELATED_ANALYTICS_CONTACT_INITIAL_LIMIT\)/);
  assert.match(panel, /Alta ambigüedad/);
  assert.match(panel, /contactos asociados/);
  assert.match(panel, /Sin candidato único/);
  assert.match(panel, /Evidencia observada:/);
  assert.match(panel, /Página \{displayCount\(contactPage\)\} de \{displayCount\(contactPageCount\)\}/);
  assert.match(panel, /Paginación de candidatos de contacto/);
  assert.match(panel, />Anterior</);
  assert.match(panel, />Siguiente</);
  assert.match(panel, /candidateCount > RELATED_ANALYTICS_CONTACT_INITIAL_LIMIT/);
  assert.match(panel, /contactPageCount > 1/);
  assert.match(panel, /\[analytics\.locator\.representationKey, candidateCount\]/);
  assert.match(panel, /primaryEmail !== null \|\| primaryPhone !== null/);
  assert.match(panel, /candidate\.eligibility\.status === "BLOCKED"/);
  assert.doesNotMatch(panel, /ELIGIBLE/);
  assert.doesNotMatch(panel, /Enviar campaña/);
});

test("storage estimate and performance contracts stay explicit", () => {
  assert.match(migration, /primary key \(snapshot_id, group_id\)/);
  assert.match(migration, /primary key \(snapshot_id, group_id, type, normalized_value\)/);
  assert.match(builder, /order by base\.group_id/);
  assert.match(builder, /order by summary\.group_id, summary\.type, summary\.normalized_value/);
  assert.match(migration, /historicalEvidence[\s\S]*'materialized', false/);
  assert.match(explain, /explain \(verbose, costs, buffers false\)/g);
  assert.doesNotMatch(explain, /explain\s*\(\s*analyze/i);
  assert.match(explain, /customer_related_review_group_analytics[\s\S]*snapshot_id[\s\S]*group_id/);
  assert.match(explain, /customer_related_review_contact_candidates[\s\S]*snapshot_id[\s\S]*group_id/);
});

test("reversible harness embeds the migration contract and restores the baseline", () => {
  const migrationCore = migration.slice(
    migration.indexOf("create table public.customer_related_review_group_analytics"),
    migration.lastIndexOf("commit;"),
  );
  assert.ok(harness.includes(migrationCore));
  assert.match(harness, /zero_one_multiple_candidates_ok/);
  assert.match(harness, /stale_locator_was_accepted/);
  assert.match(harness, /eligible_status_was_accepted/);
  assert.match(harness, /rollback;[\s\S]*analytics_table_absent_after_rollback/);
});
