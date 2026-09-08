import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("supabase/migrations/20260901120000_create_customer_identity_model.sql", "utf8");
const migration = readFileSync("supabase/migrations/20260908110000_add_customer_identity_v2.sql", "utf8");
const resolver = migration.slice(
  migration.indexOf("create or replace function public.customer_window_resolve_identity_batch"),
  migration.indexOf("create or replace function public.customer_window_merge_profiles_m2m"),
);

function reviewProfileFor(existing, booking) {
  const compatible = existing.filter((profile) => (
    profile.source === booking.source
    && profile.sourceCustomerId === booking.sourceCustomerId
    && profile.email === booking.email
    && profile.needsReview
  ));
  return compatible.find((profile) => profile.phones.includes(booking.phone))
    ?? compatible[0]
    ?? null;
}

test("identity v2 replaces the resolver without rewriting historical links", () => {
  assert.match(migration, /create or replace function public\.customer_window_resolve_identity_batch/);
  assert.match(migration, /v_resolver_version constant text := 'customer_identity_v2'/);
  assert.doesNotMatch(resolver, /update public\.customer_booking_profile_links/);
});

test("existing unambiguous active phone and email matching remains high confidence", () => {
  assert.match(migration, /link\.status = 'active'/);
  assert.match(migration, /phone_normalized is not null[\s\S]*email_normalized is not null[\s\S]*not v_conflict/);
  assert.match(migration, /'HIGH', 'active', v_resolver_version/);
  assert.match(migration, /exact_phone_and_email_without_contradiction/);
});

test("exact MCP review identity reuses the oldest compatible profile", () => {
  assert.match(migration, /source_link\.identity_type = 'source_customer_id'/);
  assert.match(migration, /email_link\.identity_type = 'email'/);
  assert.match(migration, /exact_phone\.identity_type = 'phone'/);
  assert.match(migration, /then 'exact_review_profile'/);
  assert.match(migration, /profile\.created_at,[\s\S]*profile\.id[\s\S]*limit 1/);
});

test("MCP source customer plus email reuses review for a phone variant", () => {
  const review = {
    id: "review-1",
    source: "MCP_EAP",
    sourceCustomerId: "237467",
    email: "same@example.test",
    phones: ["phone-main"],
    needsReview: true,
  };
  assert.equal(reviewProfileFor([review], {
    source: "MCP_EAP",
    sourceCustomerId: "237467",
    email: "same@example.test",
    phone: "phone-variant",
  })?.id, "review-1");
  assert.match(migration, /else 'source_customer_id_email_review'/);
  assert.match(migration, /'phoneVariant', v_review_match_rule = 'source_customer_id_email_review'/);
});

test("reused review bookings remain conflict and keep the profile reviewable", () => {
  assert.match(migration, /update public\.customer_profiles[\s\S]*set needs_review = true/);
  assert.match(migration, /case when v_conflict[\s\S]*then 'conflict' else 'candidate' end/);
  assert.match(migration, /'reusedReviewProfile', not v_profile_was_created/);
});

test("email or phone alone never selects a review profile", () => {
  const review = {
    id: "review-1",
    source: "MCP_EAP",
    sourceCustomerId: "237467",
    email: "same@example.test",
    phones: ["phone-main"],
    needsReview: true,
  };
  assert.equal(reviewProfileFor([review], {
    source: "MCP_EAP",
    sourceCustomerId: "different",
    email: "same@example.test",
    phone: "phone-main",
  }), null);
  assert.equal(reviewProfileFor([review], {
    source: "MCP_EAP",
    sourceCustomerId: "237467",
    email: "different@example.test",
    phone: "phone-main",
  }), null);
});

test("OKP cannot use an MCP source customer id review rule", () => {
  assert.match(migration, /if v_booking\.source = 'MCP_EAP'[\s\S]*v_booking\.source_customer_id is not null/);
  assert.doesNotMatch(migration, /v_booking\.source = 'OKP'[\s\S]{0,200}source_customer_id_email_review/);
});

test("known fragmented MCP regression converges on one review profile", () => {
  const initial = {
    id: "review-237467",
    source: "MCP_EAP",
    sourceCustomerId: "237467",
    email: "same@example.test",
    phones: ["phone-main"],
    needsReview: true,
  };
  for (const booking of [
    { sourceRowId: 800906, sourceCustomerId: "237467", phone: "phone-main" },
    { sourceRowId: 782978, sourceCustomerId: "237467", phone: "phone-main" },
    { sourceRowId: 756984, sourceCustomerId: "237467", phone: "phone-variant" },
    { sourceRowId: 738655, sourceCustomerId: "237467", phone: "phone-main" },
  ]) {
    assert.equal(reviewProfileFor([initial], {
      source: "MCP_EAP",
      sourceCustomerId: booking.sourceCustomerId,
      email: "same@example.test",
      phone: booking.phone,
    })?.id, initial.id);
  }
  assert.equal(reviewProfileFor([initial], {
    source: "MCP_EAP",
    sourceCustomerId: "226407",
    email: "same@example.test",
    phone: "phone-main",
  }), null);
});

test("resolver retries are serialized and source bookings remain idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /customer_window_identity_resolver_v1/);
  assert.match(migration, /not exists \([\s\S]*customer_booking_profile_links/);
  assert.match(migration, /on conflict \(source, source_row_id\) do nothing/);
  assert.match(migration, /on conflict \(profile_id, identity_type, identity_value_normalized, source\)/);
});

test("resolver evidence distinguishes reuse creation and contradiction without raw PII", () => {
  for (const key of [
    "matchedBySourceCustomerId",
    "matchedByEmail",
    "phoneVariant",
    "contradictorySignals",
    "reusedReviewProfile",
    "reviewMatchRule",
  ]) assert.match(migration, new RegExp(`'${key}'`));
  const evidenceStart = migration.indexOf("'contradictorySignals', v_conflict");
  const evidenceEnd = migration.indexOf(")\n      ) on conflict", evidenceStart);
  const evidence = migration.slice(evidenceStart, evidenceEnd);
  assert.doesNotMatch(evidence, /v_booking\.(?:email|phone)_normalized/);
});

test("merge adds explicit lineage and never deletes profiles or events", () => {
  assert.match(migration, /add column merged_into_profile_id uuid/);
  assert.match(migration, /create or replace function public\.customer_window_merge_profiles_m2m/);
  assert.match(migration, /status = 'merged'[\s\S]*merged_into_profile_id = p_canonical_profile_id/);
  assert.match(migration, /event_type[\s\S]*'merge'[\s\S]*'profiles_merged'/);
  assert.match(migration, /'manual_override'[\s\S]*'booking_reassigned'/);
  assert.doesNotMatch(migration, /delete from public\.customer_profiles|delete from public\.customer_identity_resolution_events/i);
});

test("merge locks and validates canonical and source profiles transactionally", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /Canonical profile cannot be a source profile/);
  assert.match(migration, /Canonical profile must be active/);
  assert.match(migration, /Source profile was merged into another canonical profile/);
  assert.match(migration, /profiles_already_merged/);
});

test("manual merge activates bookings while review reuse does not", () => {
  assert.match(migration, /update public\.customer_booking_profile_links booking_link[\s\S]*status = 'active'/);
  assert.match(migration, /previousProfileId/);
  assert.match(migration, /simple reutilización|reuses compatible MCP\/EAP review profiles/);
});

test("identity consolidation is set based and preserves provenance and ambiguity", () => {
  assert.match(migration, /insert into public\.customer_identity_links[\s\S]*select[\s\S]*identity\.source/);
  assert.match(migration, /on conflict \(profile_id, identity_type, identity_value_normalized, source\)/);
  assert.match(migration, /when customer_identity_links\.status = 'conflict' or excluded\.status = 'conflict' then 'conflict'/);
  assert.match(migration, /mergedFromProfileId/);
});

test("merge refreshes canonical metrics and removes merged-profile metrics through the existing contract", () => {
  assert.match(migration, /customer_window_refresh_profile_metrics_m2m\([\s\S]*v_all_profile_ids/);
  assert.match(migration, /'metricsRefresh', v_metrics_result/);
  assert.match(migration, /to_regprocedure\([\s\S]*customer_window_refresh_commercial_signals_m2m/);
  assert.match(migration, /using v_all_profile_ids/);
  assert.match(migration, /'signalsRefresh', v_signals_result/);
});

test("dry run returns four aggregate categories without identity values", () => {
  assert.match(migration, /customer_window_preview_identity_consolidation_m2m/);
  for (const category of ["'A'", "'B'", "'C'", "'D'"]) assert.match(migration, new RegExp(category));
  for (const field of ["groups", "profiles", "potentialExcessProfiles", "bookings", "confidence", "autoMergeCandidate"]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  const responseStart = migration.indexOf("'identity_consolidation_preview'");
  const response = migration.slice(responseStart, migration.indexOf("from categories;", responseStart));
  assert.doesNotMatch(response, /email_normalized|phone_normalized|source_customer_id/);
  assert.match(response, /'containsPii', false/);
});

test("identity v2 uses the existing lookup indexes instead of adding duplicates", () => {
  assert.match(schema, /customer_identity_links_lookup_idx[\s\S]*identity_type, identity_value_normalized, status/);
  assert.match(schema, /customer_identity_links_profile_idx[\s\S]*profile_id, status/);
  assert.match(schema, /customer_booking_profile_links_source_row_unique[\s\S]*unique \(source, source_row_id\)/);
  assert.match(schema, /customer_source_bookings_mcp_eap_customer_id_idx/);
  assert.doesNotMatch(migration, /create index/i);
});

test("identity v2 and merge contracts remain private and service-role only", () => {
  assert.match(schema, /alter table public\.customer_profiles enable row level security/);
  assert.equal((migration.match(/revoke all on function/g) ?? []).length, 3);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 3);
  for (const line of migration.split(/\r?\n/).filter((value) => /^grant execute/i.test(value.trim()))) {
    assert.match(line + migration.slice(migration.indexOf(line), migration.indexOf(line) + 180), /to service_role/);
  }
});

test("migration is additive and performs no historical backfill or production merge", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /truncate|drop table|drop function|drop view/i);
  assert.doesNotMatch(migration, /select public\.customer_window_merge_profiles_m2m|call public\.customer_window_merge_profiles_m2m/i);
});
