import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260925160000_add_customer_360_boleta_analytics_v1.sql", import.meta.url),
  "utf8",
);
const harness = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_v1_reversible_test.sql", import.meta.url),
  "utf8",
);
const explain = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_v1_explain.sql", import.meta.url),
  "utf8",
);
const incrementalExplain = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_v1_incremental_selectors_explain.sql", import.meta.url),
  "utf8",
);
const concurrencyProtocol = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_v1_watermark_concurrency_runtime_protocol.sql", import.meta.url),
  "utf8",
);
const loginCreate = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_runner_login_create.sql", import.meta.url),
  "utf8",
);
const loginPostcheck = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_runner_login_postcheck.sql", import.meta.url),
  "utf8",
);
const loginProbe = readFileSync(
  new URL("../supabase/debug/customer_window_360_boleta_analytics_runner_login_psql_test.sql", import.meta.url),
  "utf8",
);

test("boleta analytics uses a separate materialized read model", () => {
  assert.match(migration, /create table public\.customer_profile_boleta_analytics/);
  assert.match(migration, /customer_id uuid primary key references public\.customer_profiles\(id\) on delete cascade/);
  assert.match(migration, /create table public\.customer_profile_boleta_discount_codes/);
  assert.doesNotMatch(migration, /alter table public\.customer_profile_metrics/);
  assert.match(migration, /calculation_version = 'CUSTOMER_360_BOLETA_ANALYTICS_V1'/);
});

test("canonical source rules retain existing validity and exclude packs", () => {
  assert.match(migration, /booking\.booking_status in \(1, 8\)/);
  assert.match(migration, /booking\.status_raw = 'PAGADA'[\s\S]*booking\.status_raw = 'REEMPLAZADA'/);
  assert.match(migration, /boletas as materialized \([\s\S]*where is_pack is false/);
  assert.match(migration, /booking\.paying_status = 1[\s\S]*booking\.is_pack is false/);
  assert.match(migration, /booking\.is_paid is true[\s\S]*booking\.is_pack is false/);
});

test("source reads remain link-driven through the complete source row key", () => {
  const completeKeyJoins = migration.match(
    /on booking\.source = link\.source\s+and booking\.source_row_id = link\.source_row_id\s+and link\.source = '(?:MCP_EAP|OKP)'/g,
  ) ?? [];
  assert.equal(completeKeyJoins.length, 4);
  assert.equal(completeKeyJoins.filter((join) => join.endsWith("'MCP_EAP'")).length, 2);
  assert.equal(completeKeyJoins.filter((join) => join.endsWith("'OKP'")).length, 2);
  assert.doesNotMatch(
    migration,
    /on link\.source = '(?:MCP_EAP|OKP)' and booking\.source_row_id = link\.source_row_id/,
  );
  assert.match(migration, /selected_links as materialized \([\s\S]*where link\.status = 'active'/);
  assert.match(explain, /^begin transaction read only;/m);
  assert.match(explain, /explain \(verbose, costs, settings\)/);
  assert.doesNotMatch(explain, /analyze/i);
  assert.match(explain, /7ddecd4b-6e5d-459d-a968-1c030141209a/);
  assert.equal((explain.match(/on booking\.source = link\.source/g) ?? []).length, 2);
  assert.match(explain, /rollback;/);
});

test("economic, stay, cadence, lead and pattern formulas are weighted and explicit", () => {
  assert.match(migration, /percentile_cont\(0\.5\) within group \(order by gap_days\)/);
  assert.match(migration, /percentile_cont\(0\.5\) within group \(order by paid_amount\)/);
  assert.match(migration, /sum\(paid_amount\) \/ nullif\(sum\(economic_days\), 0\) as paid_adr/);
  assert.match(migration, /planned_departure_at::date - booking\.planned_arrival_at::date \+ 1/);
  assert.match(migration, /planned_arrival_at::date - booking\.source_created_at::date/);
  assert.match(migration, /extract\(isodow from planned_arrival_at\)/);
  assert.match(migration, /generate_series\(1, 12\)/);
  assert.match(migration, /pg_catalog\.jsonb_array_length\(arrival_month_counts\) = 12/);
});

test("null and zero semantics are preserved", () => {
  assert.match(migration, /coalesce\(econ\.sample_size, 0\)/);
  assert.match(migration, /econ\.paid_amount, econ\.list_amount, econ\.discount_amount/);
  assert.doesNotMatch(migration, /coalesce\(econ\.paid_amount, 0\)/);
  assert.match(migration, /total_economic_days bigint,/);
  assert.doesNotMatch(migration, /total_economic_days bigint not null/);
  assert.match(migration, /stay_days_sample_size = 0 and total_economic_days is null/);
  assert.match(migration, /stay_days_sample_size > 0 and total_economic_days is not null and total_economic_days >= 0/);
  assert.match(migration, /stay\.total_value, stay\.average_value/);
  assert.doesNotMatch(migration, /coalesce\(stay\.total_value, 0\)/);
  assert.match(migration, /case when total_booking_count = 0 then null::numeric/);
  assert.match(migration, /'currency', case when v_analytics\.economic_eligible_boleta_count > 0 then 'CLP' else null end/);
  assert.match(migration, /case when v_analytics\.last_boleta_purchase_at is null then null/);
});

test("month counting and calculator volatility use unambiguous PostgreSQL semantics", () => {
  assert.doesNotMatch(migration, /pg_catalog\.extract\(/);
  assert.match(migration, /count\(boleta\.source_row_id\) filter/);
  assert.doesNotMatch(migration, /count\(boleta\.\*\)/);
  assert.match(migration, /pg_catalog\.statement_timestamp\(\)/);
  assert.doesNotMatch(migration, /clock_timestamp\(\)/);
  assert.match(migration, /language sql\s+stable\s+security definer/);
});

test("refresh is bounded, stale-aware and idempotent", () => {
  const refreshBlock = migration.slice(
    migration.indexOf("create or replace function public.customer_window_refresh_boleta_analytics_v1_m2m"),
    migration.indexOf("create or replace function public.customer_window_boleta_analytics_v1_refresh_status_m2m"),
  );
  assert.match(migration, /p_limit integer default 500/);
  assert.match(migration, /p_mode text default 'auto'/);
  assert.match(migration, /p_limit < 1 or p_limit > 500/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create table public\.customer_profile_boleta_analytics_incremental_state/);
  for (const stream of ["customer_profiles", "booking_links", "mcp_eap", "okp", "bootstrap", "selector"]) {
    assert.match(migration, new RegExp(`'${stream}'`));
  }
  for (const cursor of [
    "v_profiles_cursor_at",
    "v_links_cursor_at",
    "v_mcp_eap_cursor_at",
    "v_okp_cursor_at",
  ]) {
    assert.doesNotMatch(refreshBlock, new RegExp(`${cursor} is null\\s+or`));
    assert.equal((refreshBlock.match(new RegExp(`if ${cursor} is null then`, "g")) ?? []).length, 2);
  }
  assert.match(migration, /\(profile\.updated_at, profile\.id\) > \(v_profiles_cursor_at, v_profiles_cursor_id\)/);
  assert.match(migration, /\(link\.updated_at, link\.id\) > \(v_links_cursor_at, v_links_cursor_id\)/);
  assert.match(migration, /\(booking\.updated_at, booking\.source_row_id\) > \(v_mcp_eap_cursor_at, v_mcp_eap_cursor_id\)/);
  assert.match(migration, /\(booking\.updated_at, booking\.source_row_id\) > \(v_okp_cursor_at, v_okp_cursor_id\)/);
  assert.doesNotMatch(migration, /updated_at > analytics\.computed_at/);
  assert.equal((refreshBlock.match(/limit v_profiles_quota \+ 1/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/limit v_links_quota \+ 1/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/limit v_mcp_eap_quota \+ 1/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/limit v_okp_quota \+ 1/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/order by profile\.updated_at, profile\.id/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/order by link\.updated_at, link\.id/g) ?? []).length, 2);
  assert.equal((refreshBlock.match(/order by booking\.updated_at, booking\.source_row_id/g) ?? []).length, 4);
  assert.match(migration, /v_rotation := \(v_cycle % 6\)::integer/);
  assert.match(migration, /v_safe_upper_bound timestamptz := pg_catalog\.statement_timestamp\(\) - interval '5 minutes'/);
  assert.doesNotMatch(refreshBlock, /source_synced_at/);
  assert.ok((migration.match(/updated_at <= v_safe_upper_bound/g) ?? []).length >= 18);
  assert.ok((migration.match(/updated_at <= pg_catalog\.statement_timestamp\(\) - interval '5 minutes'/g) ?? []).length >= 4);
  assert.match(migration, /stream_complete = not v_bootstrap_more/);
  assert.match(migration, /Re-open the bounded profile sweep once per Chilean day/);
  assert.match(migration, /v_bootstrap_last_succeeded_at is null/);
  assert.match(migration, /v_bootstrap_quota > 0 and not v_bootstrap_complete/);
  assert.match(migration, /v_profiles_ids \|\| v_links_ids \|\| v_mcp_eap_ids \|\| v_okp_ids \|\| v_bootstrap_ids \|\| v_as_of_ids/);
  assert.match(migration, /'mode', v_mode, 'processedProfiles', 0, 'removedProfiles', 0, 'hasMore', v_has_more/);
  assert.match(migration, /analytics\.as_of_date < pg_catalog\.timezone\('America\/Santiago'/);
  assert.match(migration, /order by analytics\.as_of_date, analytics\.customer_id/);
  assert.match(migration, /not exists \([\s\S]*customer_profile_boleta_analytics analytics[\s\S]*exists \([\s\S]*customer_booking_profile_links link/);
  assert.match(migration, /on conflict \(customer_id\) do update set/);
  assert.match(migration, /delete from public\.customer_profile_boleta_discount_codes where customer_id = any\(v_ids\)/);
  assert.match(migration, /where stream_key = 'customer_profiles'/);
  assert.match(migration, /where stream_key = 'booking_links'/);
  assert.match(migration, /where stream_key = 'mcp_eap'/);
  assert.match(migration, /where stream_key = 'okp'/);
  for (const rows of ["v_profiles_rows", "v_links_rows", "v_mcp_eap_rows", "v_okp_rows"]) {
    assert.match(refreshBlock, new RegExp(`if ${rows} > 0 then[\\s\\S]*?watermark_updated_at =`));
  }
  assert.match(migration, /previous owner is reconciled by the daily as-of branch/);
  assert.match(incrementalExplain, /^begin transaction read only;/m);
  assert.equal((incrementalExplain.match(/statement_timestamp\(\) - interval '5 minutes'/g) ?? []).length, 10);
  assert.equal((incrementalExplain.match(/updated_at <= pg_catalog\.statement_timestamp\(\) - interval '5 minutes'/g) ?? []).length, 10);
  assert.equal((incrementalExplain.match(/explain \(verbose, costs, buffers false\)/g) ?? []).length, 15);
  assert.doesNotMatch(incrementalExplain, /explain \([^)]*analyze/i);
  assert.equal((incrementalExplain.match(/limit 85/g) ?? []).length, 10);
  assert.equal((incrementalExplain.match(/limit 501/g) ?? []).length, 2);
  assert.match(incrementalExplain, /A1\. customer_profiles initial stream branch/);
  assert.match(incrementalExplain, /A2\. customer_profiles incremental stream branch/);
  assert.match(incrementalExplain, /B1\. booking links initial stream branch/);
  assert.match(incrementalExplain, /B2\. booking links incremental stream branch/);
  assert.match(incrementalExplain, /C1\. MCP\/EAP initial source branch/);
  assert.match(incrementalExplain, /C2\. MCP\/EAP incremental source branch/);
  assert.match(incrementalExplain, /D1\. OKP initial source branch/);
  assert.match(incrementalExplain, /D2\. OKP incremental source branch/);
  assert.match(incrementalExplain, /G\. Dedicated bootstrap mode uses the complete p_limit/);
  assert.match(incrementalExplain, /H\. Dedicated as_of mode uses the complete p_limit/);
  assert.match(incrementalExplain, /I\. Cheap status path/);
  assert.match(incrementalExplain, /J\. Opt-in expensive status proxies/);
  assert.doesNotMatch(incrementalExplain, /watermark_updated_at is null\s+or/i);
  assert.match(incrementalExplain, /\(profile\.updated_at, profile\.id\) > \(/);
  assert.match(incrementalExplain, /\(link\.updated_at, link\.id\) > \(/);
  assert.equal((incrementalExplain.match(/\(booking\.updated_at, booking\.source_row_id\) > \(/g) ?? []).length, 2);
  assert.match(incrementalExplain, /rollback;/);
  assert.match(concurrencyProtocol, /NON-PRODUCTION TWO-SESSION PROTOCOL/);
  assert.match(concurrencyProtocol, /fixture_is_still_hot/);
  assert.match(concurrencyProtocol, /cursor_has_not_crossed_fixture/);
  assert.match(concurrencyProtocol, /late_commit_was_consumed/);
});

test("refresh exposes explicit operational modes without changing auto fairness", () => {
  const refreshBlock = migration.slice(
    migration.indexOf("create or replace function public.customer_window_refresh_boleta_analytics_v1_m2m"),
    migration.indexOf("create or replace function public.customer_window_boleta_analytics_v1_refresh_status_m2m"),
  );
  assert.match(refreshBlock, /v_mode not in \('auto', 'bootstrap', 'as_of'\)/);
  assert.match(refreshBlock, /raise exception 'invalid_refresh_mode'/);
  assert.match(refreshBlock, /raise exception 'customer_ids_require_auto_mode'/);
  assert.match(refreshBlock, /if v_mode = 'auto' then[\s\S]*v_rotation := \(v_cycle % 6\)::integer/);
  assert.match(refreshBlock, /elsif v_mode = 'bootstrap' then[\s\S]*v_bootstrap_quota := p_limit;[\s\S]*v_as_of_quota := 0/);
  assert.match(refreshBlock, /else[\s\S]*v_bootstrap_quota := 0;[\s\S]*v_as_of_quota := p_limit/);
  assert.match(refreshBlock, /if v_mode = 'auto' and v_profiles_quota = 0/);
  assert.match(refreshBlock, /if v_mode = 'auto' and v_as_of_quota = 0/);
  assert.match(refreshBlock, /if v_mode = 'auto' then[\s\S]*where stream_key = 'selector'/);
  assert.match(refreshBlock, /v_safe_upper_bound timestamptz := pg_catalog\.statement_timestamp\(\) - interval '5 minutes'/);
  assert.match(refreshBlock, /stream_complete = not v_bootstrap_more/);
});

test("refresh status separates cheap metadata from opt-in exact counts", () => {
  const statusBlock = migration.slice(
    migration.indexOf("create or replace function public.customer_window_boleta_analytics_v1_refresh_status_m2m"),
    migration.indexOf("create or replace function public.customer_window_360_v1_get_boleta_analytics"),
  );
  assert.match(statusBlock, /p_include_counts boolean default false/);
  assert.match(statusBlock, /language sql\s+stable\s+security definer\s+set search_path = ''/);
  for (const field of [
    "calculationVersion", "asOfDate", "streams", "bootstrapComplete",
    "analyticsMaterializedCount", "analyticsStaleCount", "activeEligibleWithoutAnalyticsCount",
  ]) assert.match(statusBlock, new RegExp(`'${field}'`));
  assert.match(statusBlock, /'countsCost', case when coalesce\(p_include_counts, false\) then 'potentially_expensive'/);
  assert.match(statusBlock, /case when coalesce\(p_include_counts, false\) then/);
  assert.match(statusBlock, /analytics\.as_of_date < pg_catalog\.timezone\('America\/Santiago'/);
  assert.match(statusBlock, /profile\.updated_at <= pg_catalog\.statement_timestamp\(\) - interval '5 minutes'/);
});

test("read boundary is confirmed-only and reads materialized rows", () => {
  assert.match(migration, /customer_window_360_v1_get_boleta_analytics\(p_locator jsonb\)/);
  assert.match(migration, /customer_window_360_v1_resolve_locator\(p_locator\)/);
  assert.match(migration, /representationType' <> 'confirmed_customer'/);
  assert.match(migration, /boleta_analytics_confirmed_only/);
  assert.match(migration, /from public\.customer_profile_boleta_analytics analytics/);
  assert.doesNotMatch(
    migration.slice(migration.indexOf("create or replace function public.customer_window_360_v1_get_boleta_analytics")),
    /customer_source_bookings_|customer_window_bookings_v/,
  );
});

test("warnings follow the approved thresholds", () => {
  assert.match(migration, /eligible_boleta_booking_count < 3 then 'LOW_SAMPLE_SIZE'/);
  assert.match(migration, /economic_eligible_boleta_count < v_analytics\.eligible_boleta_booking_count then 'ECONOMICS_PARTIAL'/);
  assert.match(migration, /booking_lead_sample_size < v_analytics\.eligible_boleta_booking_count then 'LEAD_TIME_PARTIAL'/);
  assert.match(migration, /arrival_month_sample_size < 3 or v_analytics\.distinct_arrival_years < 2 then 'SEASONALITY_LOW_SAMPLE'/);
  assert.match(migration, /gap_interval_count < 2 then 'GAP_LOW_SAMPLE'/);
});

test("discount codes are source-namespaced and capped only at read time", () => {
  assert.match(migration, /primary key \(customer_id, source, code_type, code\)/);
  assert.match(migration, /code_type in \('promotion', 'coupon'\)/);
  assert.match(migration, /partition by code\.source, code\.code_type/);
  assert.match(migration, /from ranked where rank <= 10/);
});

test("ACL keeps tables, incremental state and internal calculators private", () => {
  for (const table of [
    "customer_profile_boleta_analytics",
    "customer_profile_boleta_discount_codes",
    "customer_profile_boleta_analytics_incremental_state",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(migration, /revoke all on function public\.customer_window_calculate_boleta_analytics_v1\(uuid\[\]\)/);
  assert.match(migration, /grant execute on function public\.customer_window_refresh_boleta_analytics_v1_m2m\(uuid\[\], integer, text\) to service_role/);
  assert.match(migration, /revoke all on function public\.customer_window_boleta_analytics_v1_refresh_status_m2m\(boolean\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.customer_window_boleta_analytics_v1_refresh_status_m2m\(boolean\) to service_role/);
  assert.match(migration, /grant execute on function public\.customer_window_360_v1_get_boleta_analytics\(jsonb\) to service_role/);
  assert.match(migration, /create role customer_360_boleta_analytics_runner\s+nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/);
  assert.match(migration, /grant connect on database %I to customer_360_boleta_analytics_runner/);
  assert.match(migration, /grant usage on schema public to customer_360_boleta_analytics_runner/);
  assert.match(migration, /grant execute on function public\.customer_window_refresh_boleta_analytics_v1_m2m\(uuid\[\], integer, text\)[\s\S]*to customer_360_boleta_analytics_runner/);
  assert.match(migration, /grant execute on function public\.customer_window_boleta_analytics_v1_refresh_status_m2m\(boolean\)[\s\S]*to customer_360_boleta_analytics_runner/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)[\s\S]{0,120}customer_360_boleta_analytics_runner/i);
});

test("dedicated login provisioning contains no credential and postchecks least privilege", () => {
  assert.match(loginCreate, /password null/);
  assert.doesNotMatch(loginCreate, /password\s+'[^']+'/i);
  assert.match(loginCreate, /with inherit true, set false, admin false/);
  assert.match(loginPostcheck, /member\.inherit_option/);
  assert.match(loginPostcheck, /member\.set_option/);
  assert.match(loginPostcheck, /database_temp_not_explicit/);
  assert.match(loginPostcheck, /database_temp_via_public/);
  assert.match(loginProbe, /customer_window_boleta_analytics_v1_refresh_status_m2m\(false\)/);
  assert.match(loginProbe, /pg_try_advisory_lock/);
  assert.match(loginProbe, /pg_advisory_unlock/);
  assert.match(loginProbe, /customer_source_bookings_mcp_eap/);
  assert.match(loginProbe, /privilege_type = 'TEMPORARY'/);
  assert.match(loginProbe, /customer_related_review_%/);
  assert.match(loginPostcheck, /related_review_execute_denied/);
});

test("reversible harness covers fixtures and cleanup", () => {
  assert.match(harness, /^begin;/m);
  assert.match(harness, /MCP_ONLY|EAP_ONLY|OKP_ONLY|CROSS_SOURCE/);
  for (const marker of [
    "PACK_EXCLUDED", "MISSING_DURATION", "MISSING_AMOUNT", "NEGATIVE_LEAD",
    "FUTURE_BOOKING", "BRAND_PARKING_TIE", "MONTHLY_TIE", "MEDIAN_TICKET",
    "MEDIAN_GAP", "WEIGHTED_ADR", "NULL_VS_ZERO", "WARNINGS", "Incremental selector",
  ]) assert.match(harness, new RegExp(marker));
  assert.match(harness, /rollback;/i);
  assert.match(harness, /analytics_table_absent/);
  assert.match(harness, /read_rpc_absent/);
  assert.match(harness, /incremental_state_table_absent/);
  assert.match(harness, /watermark advanced after rollback/);
  assert.match(harness, /bounded rotating selector failed/);
  assert.match(harness, /bootstrap completion state failed/);
  assert.match(harness, /daily bootstrap reconciliation failed/);
  assert.match(harness, /safety lag allowed a hot row or advanced its watermark/);
  assert.match(harness, /same-timestamp first tiebreaker failed/);
  assert.match(harness, /same-timestamp second tiebreaker failed/);
  assert.doesNotMatch(harness, /max\(profile\.id\)/);
  assert.match(harness, /v_result ->> 'hasMore'\)::boolean is not false/);
  assert.match(harness, /invalid mode accepted/);
  assert.match(harness, /explicit ids with dedicated mode accepted/);
  assert.match(harness, /refresh status cheap contract failed/);
  assert.match(harness, /refresh_status_rpc_absent/);
});

test("reversible harness embeds the exact migration body", () => {
  const migrationBody = migration.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim();
  const embeddedStart = harness.indexOf("-- Capability only. Provision the dedicated LOGIN and password separately.");
  const embeddedEnd = harness.indexOf("\n-- MCP_ONLY / EAP_ONLY / OKP_ONLY / CROSS_SOURCE");
  assert.notEqual(embeddedStart, -1);
  assert.notEqual(embeddedEnd, -1);
  assert.equal(harness.slice(embeddedStart, embeddedEnd).trim(), migrationBody);
});
