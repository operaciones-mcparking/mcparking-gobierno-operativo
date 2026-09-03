import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("supabase/migrations/20260901120000_create_customer_identity_model.sql", "utf8");
const resolver = readFileSync("supabase/migrations/20260901130000_add_customer_identity_resolver.sql", "utf8");
const evidenceMigration = readFileSync("supabase/migrations/20260901150000_enrich_customer_identity_conflict_evidence.sql", "utf8");
const optimizedMigration = readFileSync("supabase/migrations/20260901160000_optimize_customer_identity_resolver.sql", "utf8");

test("identity model uses canonical UUID profiles and provenance-aware links", () => {
  assert.match(schema, /create table public\.customer_profiles[\s\S]*id uuid primary key/);
  assert.match(schema, /create table public\.customer_identity_links/);
  assert.match(schema, /identity_type in \('phone', 'email', 'plate', 'source_customer_id'\)/);
  assert.match(schema, /confidence in \('HIGH', 'MEDIUM', 'SUPPORT'\)/);
  assert.match(schema, /status in \('active', 'candidate', 'conflict', 'rejected'\)/);
  assert.match(schema, /create table public\.customer_booking_profile_links/);
  assert.match(schema, /unique \(source, source_row_id\)/);
  assert.match(schema, /create table public\.customer_identity_resolution_events/);
});

test("resolver auto-links only exact phone and email without contradiction", () => {
  assert.match(resolver, /phone_normalized is not null[\s\S]*email_normalized is not null[\s\S]*not v_conflict/);
  assert.match(resolver, /exact_phone_and_email_without_contradiction/);
  assert.match(resolver, /candidate\.email_normalized is distinct from v_booking\.email_normalized/);
  assert.match(resolver, /candidate\.phone_normalized is distinct from v_booking\.phone_normalized/);
  assert.match(resolver, /signals_link_multiple_profiles/);
});

test("support signals never auto-merge profiles", () => {
  assert.match(resolver, /'plate'[\s\S]*'SUPPORT'[\s\S]*'candidate'/);
  assert.match(resolver, /'source_customer_id'[\s\S]*'MCP_EAP'[\s\S]*'SUPPORT'[\s\S]*'candidate'/);
  assert.doesNotMatch(resolver, /identity_type = 'plate'[\s\S]*link\.status = 'active'/);
});

test("resolver is incremental, idempotent and audit preserving", () => {
  assert.match(resolver, /not exists \([\s\S]*customer_booking_profile_links/);
  assert.match(resolver, /on conflict \(source, source_row_id\) do nothing/);
  assert.match(resolver, /customer_identity_resolution_events/);
  assert.match(resolver, /customer_identity_v1/);
  assert.doesNotMatch(resolver, /delete from|truncate/i);
});

test("identity tables are private and service-role only", () => {
  for (const table of [
    "customer_profiles",
    "customer_identity_links",
    "customer_booking_profile_links",
    "customer_identity_resolution_events",
  ]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(schema, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(resolver, /security definer/);
  assert.match(resolver, /set search_path = ''/);
  assert.match(resolver, /grant execute on function public\.customer_window_resolve_identity_batch\(integer\)[\s\S]*to service_role/);
});

test("conflict events record non-sensitive contradiction cardinalities", () => {
  for (const key of [
    "emailsForPhone",
    "phonesForEmail",
    "phoneBookingCount",
    "emailBookingCount",
  ]) assert.match(evidenceMigration, new RegExp(`'${key}'`));
  assert.match(evidenceMigration, /'contradictorySignals', true/);
  assert.match(evidenceMigration, /'phoneContradictory', v_emails_for_phone > 1/);
  assert.match(evidenceMigration, /'emailContradictory', v_phones_for_email > 1/);
  const evidenceStart = evidenceMigration.indexOf("pg_catalog.jsonb_build_object(", evidenceMigration.indexOf("when v_conflict then 'contradictory_phone_email'"));
  const evidenceBlock = evidenceMigration.slice(evidenceStart, evidenceMigration.indexOf("else '{}'::jsonb end", evidenceStart));
  assert.doesNotMatch(evidenceBlock, /v_booking\.(?:phone|email)_normalized/);
  assert.doesNotMatch(evidenceBlock, /'phone'|'email'/);
});

test("evidence enrichment preserves v1 identity decisions and idempotency", () => {
  assert.match(evidenceMigration, /matching_phone\.email_normalized is distinct from v_booking\.email_normalized/);
  assert.match(evidenceMigration, /matching_email\.phone_normalized is distinct from v_booking\.phone_normalized/);
  assert.match(evidenceMigration, /phone_normalized is not null[\s\S]*email_normalized is not null[\s\S]*not v_conflict/);
  assert.match(evidenceMigration, /'plate'[\s\S]*'SUPPORT'[\s\S]*'candidate'/);
  assert.match(evidenceMigration, /customer_identity_v1/);
  assert.match(evidenceMigration, /not exists \([\s\S]*customer_booking_profile_links/);
  assert.match(evidenceMigration, /on conflict \(source, source_row_id\) do nothing/);
  assert.doesNotMatch(evidenceMigration, /delete from|truncate/i);
});
test("optimized resolver precomputes batch signal cardinalities outside the row loop", () => {
  assert.match(optimizedMigration, /with okp_pending as materialized/);
  assert.match(optimizedMigration, /mcp_pending as materialized/);
  assert.match(optimizedMigration, /batch_phones as materialized/);
  assert.match(optimizedMigration, /phone_stats as materialized/);
  assert.match(optimizedMigration, /batch_emails as materialized/);
  assert.match(optimizedMigration, /email_stats as materialized/);
  const loopBody = optimizedMigration.slice(optimizedMigration.indexOf("  loop"));
  assert.doesNotMatch(loopBody, /with all_valid as/);
  assert.doesNotMatch(loopBody, /count\(distinct candidate/);
});

test("optimized conflict formula is equivalent to the original resolver", () => {
  const rows = [
    { phone: "p1", email: "a@example.test" },
    { phone: "p1", email: "b@example.test" },
    { phone: "p2", email: "c@example.test" },
    { phone: "p3", email: "c@example.test" },
    { phone: "p4", email: "d@example.test" },
    { phone: "p4", email: "d@example.test" },
    { phone: "p5", email: null },
    { phone: null, email: "e@example.test" },
    { phone: null, email: null },
  ];
  const originalConflict = (current) => (
    current.phone !== null && rows.some((row) => row.phone === current.phone && row.email !== null && row.email !== current.email)
  ) || (
    current.email !== null && rows.some((row) => row.email === current.email && row.phone !== null && row.phone !== current.phone)
  );
  const optimizedConflict = (current) => {
    const emailsForPhone = new Set(rows.filter((row) => row.phone === current.phone && row.email !== null).map((row) => row.email)).size;
    const phonesForEmail = new Set(rows.filter((row) => row.email === current.email && row.phone !== null).map((row) => row.phone)).size;
    return (
      current.phone !== null && emailsForPhone > (current.email === null ? 0 : 1)
    ) || (
      current.email !== null && phonesForEmail > (current.phone === null ? 0 : 1)
    );
  };
  for (const row of rows) assert.equal(optimizedConflict(row), originalConflict(row));
  assert.equal(optimizedConflict(rows[0]), true);
  assert.equal(optimizedConflict(rows[2]), true);
  assert.equal(optimizedConflict(rows[4]), false);
  assert.equal(optimizedConflict(rows[6]), false);
  assert.equal(optimizedConflict(rows[8]), false);
});

test("optimization preserves profile decisions, writes, evidence, and v1 idempotency verbatim", () => {
  const tailMarker = "    select coalesce(array_agg(distinct link.profile_id)";
  assert.equal(optimizedMigration.slice(optimizedMigration.indexOf(tailMarker)), evidenceMigration.slice(evidenceMigration.indexOf(tailMarker)));
  assert.match(optimizedMigration, /customer_identity_v1/);
  assert.match(optimizedMigration, /not exists \([\s\S]*customer_booking_profile_links/);
  assert.match(optimizedMigration, /on conflict \(source, source_row_id\) do nothing/);
});

test("optimization adds only the missing valid OKP created cursor index", () => {
  assert.match(optimizedMigration, /create index if not exists customer_source_bookings_okp_valid_created_idx/);
  assert.match(optimizedMigration, /on public\.customer_source_bookings_okp\(source_created_at, source_row_id\)/);
  assert.equal((optimizedMigration.match(/create index if not exists/g) ?? []).length, 1);
  assert.doesNotMatch(optimizedMigration, /create table public\.|create materialized view/);
});