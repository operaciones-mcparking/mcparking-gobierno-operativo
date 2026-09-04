import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260903120000_add_customer_profile_metrics_read_model.sql",
  "utf8",
);
const tierRefinementMigration = readFileSync(
  "supabase/migrations/20260903130000_refine_customer_profile_metrics_tiers.sql",
  "utf8",
);
const refreshOptimizationMigration = readFileSync(
  "supabase/migrations/20260903140000_optimize_customer_profile_metrics_refresh.sql",
  "utf8",
);
const candidateMigration = readFileSync(
  "supabase/migrations/20260903150000_add_customer_profile_metrics_candidate_rpc.sql",
  "utf8",
);
const bootstrapCandidateMigration = readFileSync(
  "supabase/migrations/20260903160000_add_customer_profile_metrics_bootstrap_candidates.sql",
  "utf8",
);
const bootstrapStateMigration = readFileSync(
  "supabase/migrations/20260903170000_add_customer_profile_metrics_bootstrap_state.sql",
  "utf8",
);
const incrementalCandidatesMigration = readFileSync(
  "supabase/migrations/20260904110000_add_customer_profile_metrics_incremental_candidates.sql",
  "utf8",
);
const incrementalWatermarksMigration = readFileSync(
  "supabase/migrations/20260904120000_add_customer_profile_metrics_incremental_watermarks.sql",
  "utf8",
);
const incrementalIndexesMigration = readFileSync(
  "supabase/migrations/20260904121000_add_customer_profile_metrics_incremental_indexes.sql",
  "utf8",
);

test("creates a persistent non-PII metrics read model", () => {
  assert.match(migration, /create table public\.customer_profile_metrics/);
  for (const field of [
    "first_purchase_at", "last_purchase_at", "previous_purchase_at", "total_reservations",
    "reservations_12m", "reservations_24m", "median_gap_days", "days_since_last_purchase",
    "lifecycle_status", "tier", "brand_behavior", "pack_status", "first_pack_purchase_at",
    "days_to_first_pack", "mcp_count", "eap_count", "okp_count", "okp_express_count",
    "okp_rio_clarillo_count", "okp_otros_count", "future_booking_count", "last_brand", "last_parking",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(migration, /total_spend|average_ticket|spend_by_|phone_normalized text|email_normalized text/);
});

test("centralizes the approved lifecycle and tier thresholds", () => {
  assert.match(migration, /CUSTOMER_CLASSIFICATION_V1/);
  assert.match(migration, /'CUSTOMER_CLASSIFICATION_V1', 2,[\s\S]*2, 3,[\s\S]*3, 3, 64,[\s\S]*4, 3, 20,[\s\S]*11, 6, 9,[\s\S]*3/);
  assert.match(migration, /DIAMOND[\s\S]*PLATINUM[\s\S]*GOLD[\s\S]*SILVER[\s\S]*IRON[\s\S]*BRONZE/);
  assert.match(migration, /last_purchase_at >= previous_purchase_at \+ pg_catalog\.make_interval/);
});

test("requires recent 24-month activity for historical-cadence GOLD", () => {
  assert.match(tierRefinementMigration, /add column gold_reservations_24m smallint not null default 2/);
  assert.match(tierRefinementMigration, /set gold_reservations_24m = 2/);
  assert.match(
    tierRefinementMigration,
    /total_reservations >= gold_historical_reservations[\s\S]*reservations_24m >= gold_reservations_24m[\s\S]*median_gap_days <= gold_median_gap_days/,
  );
  assert.match(tierRefinementMigration, /reservations_12m >= gold_reservations_12m[\s\S]*then 'GOLD'/);
});

test("keeps tier precedence and fallback classifications intact", () => {
  assert.match(
    tierRefinementMigration,
    /then 'DIAMOND'[\s\S]*then 'PLATINUM'[\s\S]*then 'GOLD'[\s\S]*then 'SILVER'[\s\S]*then 'IRON'[\s\S]*else 'BRONZE'/,
  );
  assert.match(tierRefinementMigration, /last_purchase_at >= previous_purchase_at \+ pg_catalog\.make_interval/);
});

test("covers historical and current tier boundaries", () => {
  const classifyTier = ({ total, last12m, last24m, medianGap }) => {
    if (last12m >= 11 || (last12m >= 6 && medianGap <= 9)) return "DIAMOND";
    if (last12m >= 4 || (last12m >= 3 && medianGap <= 20)) return "PLATINUM";
    if (last12m >= 3 || (total >= 3 && last24m >= 2 && medianGap <= 64)) return "GOLD";
    if (last12m >= 2 || last24m >= 3) return "SILVER";
    if (total === 1) return "IRON";
    return "BRONZE";
  };

  assert.equal(classifyTier({ total: 3, last12m: 0, last24m: 1, medianGap: 20 }), "BRONZE");
  assert.equal(classifyTier({ total: 3, last12m: 0, last24m: 2, medianGap: 64 }), "GOLD");
  assert.equal(classifyTier({ total: 3, last12m: 3, last24m: 3, medianGap: 100 }), "GOLD");
  assert.equal(classifyTier({ total: 4, last12m: 4, last24m: 4, medianGap: 100 }), "PLATINUM");
  assert.equal(classifyTier({ total: 11, last12m: 11, last24m: 11, medianGap: 100 }), "DIAMOND");
  assert.equal(classifyTier({ total: 1, last12m: 0, last24m: 0, medianGap: null }), "IRON");
  assert.equal(classifyTier({ total: 2, last12m: 0, last24m: 1, medianGap: 90 }), "BRONZE");
});

test("publishes the refined GOLD criterion without rebuilding the read model", () => {
  assert.match(tierRefinementMigration, /create or replace function public\.customer_window_calculate_profile_metrics/);
  assert.match(
    migration,
    /customer_window_get_classification_criteria[\s\S]*pg_catalog\.to_jsonb\(rules\)/,
  );
  assert.doesNotMatch(tierRefinementMigration, /drop table|drop[\s\S]+cascade|create table public\.customer_profile_metrics/);
  assert.match(tierRefinementMigration, /security definer[\s\S]*set search_path = ''/);
});

test("bounds every automatic stale candidate branch before combining them", () => {
  for (const branch of [
    "missing_metrics",
    "expired_metrics",
    "changed_links",
    "changed_okp",
    "changed_mcp_eap",
    "removable_metrics",
  ]) {
    assert.match(
      refreshOptimizationMigration,
      new RegExp(`${branch} as \\([\\s\\S]*?limit p_limit \\+ 1[\\s\\S]*?\\n    \\)`),
    );
  }
  assert.match(
    refreshOptimizationMigration,
    /candidate_pool as materialized \([\s\S]*union all[\s\S]*stale as \([\s\S]*select distinct profile_id[\s\S]*limit p_limit \+ 1/,
  );
  assert.doesNotMatch(refreshOptimizationMigration, /stale_candidates as/);
});

test("starts calendar expiry from the persisted metrics read model", () => {
  assert.match(
    refreshOptimizationMigration,
    /expired_metrics as \([\s\S]*from public\.customer_profile_metrics metrics[\s\S]*metrics\.as_of_date < params\.today[\s\S]*limit p_limit \+ 1/,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_profile_metrics_as_of_date_idx[\s\S]*\(as_of_date, customer_id\)/,
  );
});

test("does not repeatedly select missing metrics for invalid source bookings", () => {
  assert.match(
    refreshOptimizationMigration,
    /missing_metrics as \([\s\S]*link\.source = 'OKP'[\s\S]*status_raw = 'PAGADA'[\s\S]*status_raw = 'REEMPLAZADA'[\s\S]*link\.source = 'MCP_EAP'[\s\S]*booking_status in \(1, 8\)[\s\S]*limit p_limit \+ 1/,
  );
});

test("calculates each batch from active selected links and direct source joins", () => {
  assert.match(
    refreshOptimizationMigration,
    /selected_links as materialized \([\s\S]*link\.profile_id = any\(p_customer_ids\)[\s\S]*link\.status = 'active'/,
  );
  assert.match(
    refreshOptimizationMigration,
    /scoped as materialized \([\s\S]*customer_source_bookings_okp[\s\S]*union all[\s\S]*customer_source_bookings_mcp_eap/,
  );
  assert.doesNotMatch(
    refreshOptimizationMigration.match(/create or replace function public\.customer_window_calculate_profile_metrics[\s\S]*?\$\$;/)?.[0] ?? "",
    /customer_window_bookings_v/,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_booking_profile_links_active_profile_idx[\s\S]*\(profile_id, source, source_row_id\)[\s\S]*where status = 'active'/,
  );
});

test("keeps refresh set-based and preserves its public contract and security", () => {
  assert.equal(
    (refreshOptimizationMigration.match(/create or replace function public\.customer_window_refresh_profile_metrics_m2m\(/g) ?? []).length,
    1,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_window_refresh_profile_metrics_m2m\(\s*p_customer_ids uuid\[\] default null,\s*p_limit integer default 500/,
  );
  assert.doesNotMatch(refreshOptimizationMigration, /for\s+[^\n]+\s+in|loop\s*$/m);
  assert.match(refreshOptimizationMigration, /pg_advisory_xact_lock/);
  assert.match(refreshOptimizationMigration, /'processedProfiles'[\s\S]*'removedProfiles'[\s\S]*'hasMore'/);
  assert.match(
    refreshOptimizationMigration,
    /revoke all on function public\.customer_window_refresh_profile_metrics_m2m\(uuid\[\], integer\)[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to service_role/,
  );
});

test("preserves the refined GOLD rule and all metric families", () => {
  assert.match(
    refreshOptimizationMigration,
    /total_reservations >= gold_historical_reservations[\s\S]*reservations_24m >= gold_reservations_24m[\s\S]*median_gap_days <= gold_median_gap_days/,
  );
  for (const contract of [
    "lag(purchase_created_at)",
    "percentile_cont(0.5)",
    "reservations_12m",
    "reservations_24m",
    "first_pack_purchase_at",
    "brand_history",
    "future_booking_count",
    "parking_families",
  ]) {
    assert.match(refreshOptimizationMigration, new RegExp(contract.replace(/[().]/g, "\\$&")));
  }
  assert.doesNotMatch(refreshOptimizationMigration, /total_spend|average_ticket|phone_normalized|email_normalized/);
});

test("adds a bounded candidate-only M2M contract", () => {
  assert.match(
    candidateMigration,
    /customer_window_get_profile_metrics_candidates_m2m\(\s*p_limit integer default 100\s*\)/,
  );
  assert.match(candidateMigration, /p_limit is null or p_limit < 1 or p_limit > 500/);
  assert.match(
    candidateMigration,
    /'ok', true,[\s\S]*'customerIds'[\s\S]*'count'[\s\S]*'hasMore'/,
  );
  assert.doesNotMatch(candidateMigration, /customer_window_calculate_profile_metrics|insert into|update public|delete from/);
});

test("prioritizes and early-limits candidate branches", () => {
  assert.match(
    candidateMigration,
    /customer_booking_profile_links link[\s\S]*link\.status = 'active'[\s\S]*metrics\.customer_id is null[\s\S]*limit v_remaining \+ 1/,
  );
  assert.match(
    candidateMigration,
    /from public\.customer_profile_metrics metrics[\s\S]*metrics\.as_of_date < v_today[\s\S]*limit v_remaining \+ 1/,
  );
  assert.ok((candidateMigration.match(/limit v_remaining \+ 1/g) ?? []).length >= 6);
  assert.match(candidateMigration, /if not v_has_more and cardinality\(v_customer_ids\) < p_limit then/g);
  assert.doesNotMatch(candidateMigration, /stale_candidates|customer_window_bookings_v/);
});

test("candidate selection covers changes and removable profiles without PII", () => {
  assert.match(candidateMigration, /link\.updated_at > metrics\.updated_at/);
  assert.match(candidateMigration, /customer_source_bookings_okp[\s\S]*booking\.updated_at > metrics\.updated_at/);
  assert.match(candidateMigration, /customer_source_bookings_mcp_eap[\s\S]*booking\.updated_at > metrics\.updated_at/);
  assert.match(candidateMigration, /profile\.status <> 'active'[\s\S]*or not exists/);
  assert.doesNotMatch(
    candidateMigration,
    /phone|email|plate|identity_value|source_booking_code|source_customer_id/,
  );
});

test("candidate RPC is service-role-only and leaves refresh compatibility intact", () => {
  assert.match(candidateMigration, /language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(
    candidateMigration,
    /revoke all on function public\.customer_window_get_profile_metrics_candidates_m2m\(integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    candidateMigration,
    /grant execute on function public\.customer_window_get_profile_metrics_candidates_m2m\(integer\)[\s\S]*to service_role/,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_window_refresh_profile_metrics_m2m\(\s*p_customer_ids uuid\[\] default null,\s*p_limit integer default 500/,
  );
});

test("adds a cursor-paginated bootstrap candidate RPC", () => {
  assert.match(
    bootstrapCandidateMigration,
    /customer_window_get_profile_metrics_bootstrap_candidates_m2m\(\s*p_after_customer_id uuid default null,\s*p_limit integer default 100/,
  );
  assert.match(bootstrapCandidateMigration, /p_limit is null or p_limit < 1 or p_limit > 500/);
  assert.match(bootstrapCandidateMigration, /p_after_customer_id is null or profile\.id > p_after_customer_id/);
  assert.match(
    bootstrapCandidateMigration,
    /order by profile\.id[\s\S]*limit p_limit \+ 1/,
  );
});

test("bootstrap selects only active profiles with active links and no metrics", () => {
  assert.match(bootstrapCandidateMigration, /from public\.customer_profiles profile[\s\S]*profile\.status = 'active'/);
  assert.match(
    bootstrapCandidateMigration,
    /exists \([\s\S]*customer_booking_profile_links link[\s\S]*link\.profile_id = profile\.id[\s\S]*link\.status = 'active'/,
  );
  assert.match(
    bootstrapCandidateMigration,
    /not exists \([\s\S]*customer_profile_metrics metrics[\s\S]*metrics\.customer_id = profile\.id/,
  );
});

test("bootstrap returns a bounded cursor contract without incremental work", () => {
  assert.match(
    bootstrapCandidateMigration,
    /'customerIds'[\s\S]*'count'[\s\S]*'nextCursor'[\s\S]*'hasMore'/,
  );
  assert.match(
    bootstrapCandidateMigration,
    /v_has_more := cardinality\(v_candidate_ids\) > p_limit[\s\S]*v_next_cursor := v_customer_ids\[cardinality\(v_customer_ids\)\]/,
  );
  assert.doesNotMatch(
    bootstrapCandidateMigration,
    /customer_window_bookings_v|union|percentile|customer_window_calculate_profile_metrics|as_of_date|updated_at|stale_candidates/,
  );
  assert.doesNotMatch(
    bootstrapCandidateMigration,
    /phone|email|plate|identity_value|source_booking_code|source_customer_id/,
  );
});

test("bootstrap RPC is private and service-role only", () => {
  assert.match(
    bootstrapCandidateMigration,
    /language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(
    bootstrapCandidateMigration,
    /revoke all on function public\.customer_window_get_profile_metrics_bootstrap_candidates_m2m\(uuid, integer\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    bootstrapCandidateMigration,
    /grant execute on function public\.customer_window_get_profile_metrics_bootstrap_candidates_m2m\(uuid, integer\)[\s\S]*to service_role/,
  );
});

test("bootstrap leaves candidate and refresh RPCs unchanged", () => {
  assert.doesNotMatch(
    bootstrapCandidateMigration,
    /create or replace function public\.customer_window_get_profile_metrics_candidates_m2m|create or replace function public\.customer_window_refresh_profile_metrics_m2m/,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_window_refresh_profile_metrics_m2m\(\s*p_customer_ids uuid\[\] default null,\s*p_limit integer default 500/,
  );
});

test("creates one private bootstrap state row idempotently", () => {
  assert.match(bootstrapStateMigration, /create table public\.customer_window_profile_metrics_bootstrap_state/);
  for (const field of [
    "job_key text primary key",
    "cursor_customer_id uuid",
    "status text",
    "processed_profiles bigint",
    "last_batch_count integer",
    "last_started_at timestamptz",
    "last_succeeded_at timestamptz",
    "completed_at timestamptz",
    "last_error text",
    "updated_at timestamptz",
  ]) assert.match(bootstrapStateMigration, new RegExp(field));
  assert.match(bootstrapStateMigration, /job_key = 'customer_profile_metrics_bootstrap'/);
  assert.match(bootstrapStateMigration, /status in \('pending', 'running', 'completed', 'error'\)/);
  assert.match(bootstrapStateMigration, /on conflict \(job_key\) do nothing/);
  assert.match(bootstrapStateMigration, /enable row level security/);
});

test("exposes safe bootstrap state and start contracts", () => {
  assert.match(bootstrapStateMigration, /customer_window_get_profile_metrics_bootstrap_state_m2m\(\)/);
  assert.match(
    bootstrapStateMigration,
    /'cursorCustomerId'[\s\S]*'status'[\s\S]*'processedProfiles'[\s\S]*'lastBatchCount'[\s\S]*'completed'/,
  );
  assert.match(bootstrapStateMigration, /customer_window_start_profile_metrics_bootstrap_batch_m2m\(\)/);
  assert.match(
    bootstrapStateMigration,
    /set status = 'running',[\s\S]*last_started_at = pg_catalog\.clock_timestamp\(\)/,
  );
  const startFunction = bootstrapStateMigration.match(
    /create or replace function public\.customer_window_start_profile_metrics_bootstrap_batch_m2m[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  const startUpdate = startFunction.match(
    /update public\.customer_window_profile_metrics_bootstrap_state[\s\S]*?where job_key/,
  )?.[0] ?? "";
  assert.doesNotMatch(startUpdate, /cursor_customer_id\s*=|processed_profiles\s*=/);
});

test("commits progress only with cursor CAS after a successful refresh", () => {
  assert.match(
    bootstrapStateMigration,
    /customer_window_commit_profile_metrics_bootstrap_batch_m2m\(\s*p_expected_cursor uuid,\s*p_next_cursor uuid,\s*p_processed_profiles integer,\s*p_has_more boolean/,
  );
  assert.match(bootstrapStateMigration, /for update/);
  assert.match(
    bootstrapStateMigration,
    /cursor_customer_id is distinct from p_expected_cursor[\s\S]*'cursor_conflict'/,
  );
  assert.match(
    bootstrapStateMigration,
    /p_next_cursor <= v_state\.cursor_customer_id[\s\S]*'cursor_not_advanced'/,
  );
  assert.match(
    bootstrapStateMigration,
    /cursor_customer_id = case[\s\S]*processed_profiles = processed_profiles \+ p_processed_profiles[\s\S]*last_batch_count = p_processed_profiles/,
  );
  assert.match(
    bootstrapStateMigration,
    /where job_key = 'customer_profile_metrics_bootstrap'[\s\S]*cursor_customer_id is not distinct from p_expected_cursor/,
  );
});

test("marks completion without inventing cursor progress", () => {
  assert.match(
    bootstrapStateMigration,
    /status = case when p_has_more then 'pending' else 'completed' end/,
  );
  assert.match(
    bootstrapStateMigration,
    /completed_at = case when p_has_more then null else v_now end/,
  );
  assert.match(
    bootstrapStateMigration,
    /when p_processed_profiles > 0 then p_next_cursor[\s\S]*else cursor_customer_id/,
  );
  assert.match(bootstrapStateMigration, /'code', case when p_has_more then 'bootstrap_batch_committed' else 'bootstrap_completed' end/);
  assert.ok((bootstrapStateMigration.match(/v_state\.status = 'completed'/g) ?? []).length >= 3);
});

test("failure records a bounded error without advancing progress", () => {
  const failFunction = bootstrapStateMigration.match(
    /create or replace function public\.customer_window_fail_profile_metrics_bootstrap_batch_m2m[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
  assert.match(failFunction, /set status = 'error'/);
  assert.match(failFunction, /pg_catalog\.left\(pg_catalog\.btrim\(p_error\), 1000\)/);
  assert.doesNotMatch(failFunction, /set[\s\S]*cursor_customer_id\s*=|processed_profiles\s*=/);
  assert.match(failFunction, /'cursorCustomerId', v_state\.cursor_customer_id/);
});

test("bootstrap state contracts are locked and service-role only", () => {
  assert.ok((bootstrapStateMigration.match(/pg_advisory_xact_lock/g) ?? []).length >= 3);
  assert.ok((bootstrapStateMigration.match(/security definer/g) ?? []).length >= 4);
  assert.ok((bootstrapStateMigration.match(/set search_path = ''/g) ?? []).length >= 4);
  for (const signature of [
    "customer_window_get_profile_metrics_bootstrap_state_m2m\\(\\)",
    "customer_window_start_profile_metrics_bootstrap_batch_m2m\\(\\)",
    "customer_window_commit_profile_metrics_bootstrap_batch_m2m\\(uuid, uuid, integer, boolean\\)",
    "customer_window_fail_profile_metrics_bootstrap_batch_m2m\\(text\\)",
  ]) {
    assert.match(
      bootstrapStateMigration,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`),
    );
    assert.match(
      bootstrapStateMigration,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`),
    );
  }
  assert.match(
    bootstrapStateMigration,
    /revoke all on table public\.customer_window_profile_metrics_bootstrap_state[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("bootstrap state migration is operational only", () => {
  assert.doesNotMatch(
    bootstrapStateMigration,
    /create table public\.customer_profile_metrics|customer_window_classification_rules|customer_window_get_profile_metrics_bootstrap_candidates_m2m|phone|email|plate|identity_value/,
  );
  assert.doesNotMatch(bootstrapStateMigration, /delete from|drop table|drop[\s\S]+cascade/);
});

test("adds separate cursor-paginated incremental and daily candidate contracts", () => {
  for (const name of ["incremental", "daily"]) {
    assert.match(
      incrementalCandidatesMigration,
      new RegExp(`customer_window_get_profile_metrics_${name}_candidates_m2m\\(\\s*p_after_customer_id uuid default null,\\s*p_limit integer default 100`),
    );
  }
  assert.ok((incrementalCandidatesMigration.match(/p_limit is null or p_limit < 1 or p_limit > 500/g) ?? []).length === 2);
  assert.ok((incrementalCandidatesMigration.match(/limit p_limit \+ 1/g) ?? []).length >= 4);
  assert.ok((incrementalCandidatesMigration.match(/'nextCursor'/g) ?? []).length === 2);
  assert.ok((incrementalCandidatesMigration.match(/'hasMore'/g) ?? []).length === 2);
});

test("incremental candidates cover missing, changed, and removable metrics directly", () => {
  assert.match(incrementalCandidatesMigration, /missing_metrics as \([\s\S]*customer_profile_metrics metrics[\s\S]*metrics\.customer_id = profile\.id/);
  assert.match(incrementalCandidatesMigration, /link\.updated_at > metrics\.updated_at/);
  assert.match(incrementalCandidatesMigration, /customer_source_bookings_okp booking[\s\S]*booking\.updated_at > metrics\.updated_at/);
  assert.match(incrementalCandidatesMigration, /customer_source_bookings_mcp_eap booking[\s\S]*booking\.updated_at > metrics\.updated_at/);
  assert.match(incrementalCandidatesMigration, /profile\.id is null[\s\S]*profile\.status <> 'active'[\s\S]*or not exists/);
  assert.match(incrementalCandidatesMigration, /booking\.status_raw = 'PAGADA'[\s\S]*booking\.status_raw = 'REEMPLAZADA'/);
  assert.match(incrementalCandidatesMigration, /booking\.booking_status in \(1, 8\)/);
  assert.doesNotMatch(incrementalCandidatesMigration, /customer_window_bookings_v/);
});

test("daily candidates use the Santiago calendar and persisted as-of date", () => {
  assert.match(incrementalCandidatesMigration, /v_today date := pg_catalog\.timezone\('America\/Santiago', pg_catalog\.now\(\)\)::date/);
  assert.match(incrementalCandidatesMigration, /from public\.customer_profile_metrics metrics[\s\S]*metrics\.as_of_date < v_today/);
  assert.match(incrementalCandidatesMigration, /p_after_customer_id is null or metrics\.customer_id > p_after_customer_id/);
  assert.doesNotMatch(incrementalCandidatesMigration, /as_of_date\s*<=\s*v_today/);
});

test("candidate contracts only select non-PII IDs and leave refresh unchanged", () => {
  assert.doesNotMatch(
    incrementalCandidatesMigration,
    /customer_window_calculate_profile_metrics|customer_window_refresh_profile_metrics_m2m|insert into|update public|delete from|phone|email|plate|identity_value|source_booking_code|source_customer_id/,
  );
  assert.match(
    refreshOptimizationMigration,
    /customer_window_refresh_profile_metrics_m2m\(\s*p_customer_ids uuid\[\] default null,\s*p_limit integer default 500/,
  );
});

test("incremental candidate RPCs are stable and service-role only", () => {
  assert.ok((incrementalCandidatesMigration.match(/language plpgsql[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = ''/g) ?? []).length === 2);
  for (const name of ["incremental", "daily"]) {
    const signature = `customer_window_get_profile_metrics_${name}_candidates_m2m\\(uuid, integer\\)`;
    assert.match(
      incrementalCandidatesMigration,
      new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`),
    );
    assert.match(
      incrementalCandidatesMigration,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`),
    );
  }
  assert.doesNotMatch(incrementalCandidatesMigration, /grant execute[\s\S]*to (anon|authenticated)/);
});

test("creates private idempotent state for the four incremental streams", () => {
  assert.match(incrementalWatermarksMigration, /create table public\.customer_profile_metrics_incremental_state/);
  for (const stream of ["booking_links", "okp", "mcp_eap", "customer_profiles"]) assert.match(incrementalWatermarksMigration, new RegExp(`'${stream}'`));
  assert.match(incrementalWatermarksMigration, /watermark_updated_at timestamptz/);
  assert.match(incrementalWatermarksMigration, /watermark_tiebreaker text/);
  assert.match(incrementalWatermarksMigration, /on conflict \(stream_key\) do nothing/);
  assert.match(incrementalWatermarksMigration, /enable row level security/);
  assert.match(incrementalWatermarksMigration, /status text not null default 'uninitialized'/);
});

test("adds four source-row cursor readers with early limits", () => {
  for (const name of ["booking_link", "okp", "mcp_eap", "customer_profile"]) {
    assert.match(incrementalWatermarksMigration, new RegExp(`customer_window_get_profile_metrics_${name}_changes_m2m`));
  }
  assert.equal((incrementalWatermarksMigration.match(/limit p_limit \+ 1/g) ?? []).length, 4);
  assert.ok((incrementalWatermarksMigration.match(/'sourceRowCount'/g) ?? []).length === 4);
  assert.ok((incrementalWatermarksMigration.match(/'nextWatermarkUpdatedAt'/g) ?? []).length === 4);
  assert.ok((incrementalWatermarksMigration.match(/'nextWatermarkTiebreaker'/g) ?? []).length === 4);
  assert.ok((incrementalWatermarksMigration.match(/select distinct .*customer_id/g) ?? []).length >= 4);
});

test("uses typed compound cursors and source rows rather than customer IDs for progress", () => {
  assert.match(incrementalWatermarksMigration, /booking_link_changes_m2m\(\s*p_after_updated_at timestamptz, p_after_id uuid/);
  assert.match(incrementalWatermarksMigration, /okp_changes_m2m\(\s*p_after_updated_at timestamptz, p_after_source_row_id bigint/);
  assert.match(incrementalWatermarksMigration, /mcp_eap_changes_m2m\(\s*p_after_updated_at timestamptz, p_after_source_row_id bigint/);
  assert.match(incrementalWatermarksMigration, /customer_profile_changes_m2m\(\s*p_after_updated_at timestamptz, p_after_id uuid/);
  assert.ok((incrementalWatermarksMigration.match(/order by .*updated_at, .*id/g) ?? []).length >= 4);
  assert.doesNotMatch(incrementalWatermarksMigration, /order by customer_id limit p_limit \+ 1/);
});

test("source readers preserve unlinked progress and resolve linked profiles without PII", () => {
  assert.match(incrementalWatermarksMigration, /from public\.customer_source_bookings_okp booking[\s\S]*limit p_limit \+ 1[\s\S]*link\.source = 'OKP'/);
  assert.match(incrementalWatermarksMigration, /from public\.customer_source_bookings_mcp_eap booking[\s\S]*limit p_limit \+ 1[\s\S]*link\.source = 'MCP_EAP'/);
  assert.doesNotMatch(incrementalWatermarksMigration, /phone|email|plate|identity_value|source_booking_code|source_customer_id/);
});

test("initialization is explicit and never silently captures a maximum", () => {
  assert.match(incrementalWatermarksMigration, /customer_window_initialize_profile_metrics_incremental_watermark_m2m/);
  assert.match(incrementalWatermarksMigration, /p_watermark_updated_at timestamptz[\s\S]*p_watermark_tiebreaker text/);
  assert.match(incrementalWatermarksMigration, /status <> 'uninitialized'[\s\S]*stream_already_initialized/);
  assert.doesNotMatch(incrementalWatermarksMigration, /max\s*\(/i);
});

test("commits watermarks with locking, CAS, and strict forward progress", () => {
  assert.match(incrementalWatermarksMigration, /customer_window_commit_profile_metrics_incremental_watermark_m2m/);
  assert.match(incrementalWatermarksMigration, /pg_advisory_xact_lock/);
  assert.match(incrementalWatermarksMigration, /for update/);
  assert.match(incrementalWatermarksMigration, /watermark_updated_at is distinct from p_expected_updated_at[\s\S]*watermark_tiebreaker is distinct from p_expected_tiebreaker/);
  assert.match(incrementalWatermarksMigration, /watermark_not_advanced/);
  assert.match(incrementalWatermarksMigration, /processed_rows = processed_rows \+ p_processed_rows/);
  assert.doesNotMatch(incrementalWatermarksMigration, /customer_window_refresh_profile_metrics_m2m\s*\(/);
});

test("adds one justified range index for every stream", () => {
  for (const contract of [
    "customer_booking_profile_links_updated_cursor_idx[\\s\\S]*\\(updated_at, id\\)",
    "customer_source_bookings_okp_metrics_updated_cursor_idx[\\s\\S]*\\(updated_at, source_row_id\\)",
    "customer_source_bookings_mcp_eap_updated_cursor_idx[\\s\\S]*\\(updated_at, source_row_id\\)",
    "customer_profiles_updated_cursor_idx[\\s\\S]*\\(updated_at, id\\)",
  ]) assert.match(incrementalIndexesMigration, new RegExp(contract));
  assert.equal((incrementalIndexesMigration.match(/create index concurrently if not exists/g) ?? []).length, 4);
  assert.doesNotMatch(incrementalIndexesMigration, /\bbegin\s*;|\bcommit\s*;/i);
  assert.doesNotMatch(incrementalWatermarksMigration, /create index concurrently|updated_cursor_idx/);
});

test("all watermark contracts remain service-role only and leave existing jobs intact", () => {
  assert.ok((incrementalWatermarksMigration.match(/security definer/g) ?? []).length >= 7);
  assert.ok((incrementalWatermarksMigration.match(/set search_path = ''/g) ?? []).length >= 7);
  assert.ok((incrementalWatermarksMigration.match(/revoke all on function/g) ?? []).length === 7);
  assert.ok((incrementalWatermarksMigration.match(/grant execute on function/g) ?? []).length === 7);
  assert.doesNotMatch(incrementalWatermarksMigration, /grant execute[\s\S]*to (anon|authenticated)/);
  assert.doesNotMatch(incrementalWatermarksMigration, /customer_window_get_profile_metrics_daily_candidates_m2m|customer_window_profile_metrics_bootstrap_state|create or replace function public\.customer_window_refresh_profile_metrics_m2m/);
});

test("classifies brands globally and uses the last three confirmed purchases", () => {
  for (const value of ["ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]) {
    assert.match(migration, new RegExp(value));
  }
  assert.match(migration, /brand_history\[1:migration_recent_reservations\]/);
  assert.match(migration, /booking\.source = 'OKP'[\s\S]*booking\.brand in \('MCP', 'EAP'\)/);
});

test("implements PACK as any historical pack and derives first conversion", () => {
  assert.match(migration, /min\(purchase_created_at\) filter \(where is_pack is true\)/);
  assert.match(migration, /first_pack_purchase_at is null then 'NO_PACK' else 'PACK'/);
  assert.match(migration, /first_pack_purchase_at::date - first_purchase_at::date/);
  assert.doesNotMatch(migration, /MIXED/);
});

test("uses only the real canonical parking catalog and an explicit OKP fallback", () => {
  for (const value of [
    "MCPARKING", "MCPARKING VESPUCIO", "ESTACIONAMIENTO AEROPUERTO",
    "OKP_RC", "OKP_EXP", "OKP_PREMIUM", "OKP_FIDAE",
  ]) assert.match(migration, new RegExp(value));
  assert.match(migration, /'OKP_RC', 'OKP_RIO_CLARILLO'/);
  assert.match(migration, /'OKP_EXP', 'OKP_EXPRESS'/);
  assert.match(migration, /'OKP_PREMIUM', 'OKP_OTROS'/);
  assert.match(migration, /'OKP_FIDAE', 'OKP_OTROS'/);
  assert.match(migration, /booking\.source = 'OKP' then coalesce\(parking_rule\.parking_family, 'OKP_OTROS'\)/);
});

test("refresh is background-only, bounded, incremental, and calendar-aware", () => {
  assert.match(migration, /customer_window_refresh_profile_metrics_m2m/);
  assert.match(migration, /p_limit > 500/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /metrics\.as_of_date < pg_catalog\.timezone\('America\/Santiago'/);
  assert.match(migration, /link\.updated_at > metrics\.updated_at/);
  assert.match(migration, /source_booking\.updated_at > metrics\.updated_at/);
  assert.match(migration, /profile\.status <> 'active'[\s\S]*not exists \([\s\S]*customer_window_bookings_v/);
  assert.match(migration, /join public\.customer_profiles profile[\s\S]*profile\.status = 'active'/);
  assert.match(migration, /on conflict \(customer_id\) do update/);
  assert.match(migration, /'hasMore', v_has_more/);
});

test("future list contract is filtered, ordered, and paginated server-side", () => {
  assert.match(migration, /customer_window_list_profile_metrics/);
  assert.match(migration, /p_page_size > 100/);
  assert.match(migration, /p_tier[\s\S]*p_lifecycle_status[\s\S]*p_brand_behavior[\s\S]*p_pack_status[\s\S]*p_parking_family/);
  assert.match(migration, /p_order_by not in \('last_purchase_at', 'total_reservations', 'tier'\)/);
  assert.match(migration, /limit p_page_size offset \(p_page - 1\) \* p_page_size/);
  assert.match(migration, /'items'[\s\S]*'total'[\s\S]*'page'[\s\S]*'pageSize'/);
});

test("indexes support the approved filters without indexing every metric", () => {
  assert.match(migration, /customer_profile_metrics_last_purchase_idx/);
  assert.match(migration, /customer_profile_metrics_classification_idx/);
  assert.match(migration, /customer_profile_metrics_total_reservations_idx/);
  assert.match(migration, /customer_profile_metrics_parking_families_idx[\s\S]*using gin/);
  assert.equal((migration.match(/create index customer_profile_metrics_/g) ?? []).length, 4);
});

test("criteria and page identities remain server-only contracts", () => {
  assert.match(migration, /customer_window_get_classification_criteria/);
  assert.match(migration, /customer_window_get_page_identities\(p_customer_ids uuid\[\]\)/);
  assert.match(migration, /cardinality\(p_customer_ids\) > 100/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /identity_type in \('phone', 'email'\)/);
  assert.match(migration, /security definer/g);
  assert.match(migration, /set search_path = ''/g);
});

test("tables and callable RPCs are private and service-role only", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all on table public\.customer_profile_metrics from public, anon, authenticated, service_role/);
  for (const signature of [
    "customer_window_refresh_profile_metrics_m2m\\(uuid\\[\\], integer\\)",
    "customer_window_list_profile_metrics\\(integer, integer, text, text, text, text, text, text, text\\)",
    "customer_window_get_classification_criteria\\(\\)",
    "customer_window_get_page_identities\\(uuid\\[\\]\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (anon|authenticated)/);
});
