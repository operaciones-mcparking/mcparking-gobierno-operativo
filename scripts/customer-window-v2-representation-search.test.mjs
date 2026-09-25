import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const migrationPath = "supabase/migrations/20260923160000_add_customer_window_v2_representation_search.sql";
const harnessPath = "supabase/debug/customer_window_v2_representation_search_reversible_test.sql";
const migration = readFileSync(migrationPath, "utf8");
const harness = readFileSync(harnessPath, "utf8");

function migrationBody(source) {
  const start = source.indexOf("create or replace function public.customer_window_v2_search_representations_mcp_eap");
  const comment = source.indexOf("comment on function public.customer_window_v2_search_representations_mcp_eap", start);
  const end = source.indexOf(";", comment) + 1;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

const searchSource = readFileSync("src/lib/customer-window/customer-search.ts", "utf8");
const searchJavaScript = ts.transpileModule(searchSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const search = await import(`data:text/javascript;base64,${Buffer.from(searchJavaScript).toString("base64")}`);

test("search RPC is exact read-only stable and service-role-only", () => {
  assert.match(migration, /returns jsonb[\s\S]*language plpgsql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  const rpc = migration.slice(migration.indexOf("create or replace function"), migration.indexOf("revoke all on function"));
  assert.doesNotMatch(rpc, /\binsert\b|\bupdate\b|\bdelete\b|\bmerge\b|execute\s+/i);
});

test("search supports only certified exact identifiers and active snapshot representations", () => {
  for (const field of ["email_normalized", "phone_normalized", "source_booking_code", "source_row_id", "source_customer_id", "plate_normalized"]) {
    assert.match(migration, new RegExp(`booking\\.${field} =`));
  }
  assert.match(migration, /customer_window_mcp_eap_active_snapshot_authority_v2/);
  assert.match(migration, /customer_window_mcp_eap_representations_v2/);
  assert.match(migration, /representation_type in \('confirmed_customer', 'related_review'\)|representation\.representation_type = 'related_review'/);
  assert.doesNotMatch(migration, /\bilike\b|similarity\s*\(|levenshtein|soundex/i);
});

test("historical matching is evidence-gated one hop and never confirmed", () => {
  assert.match(migration, /historical_email_matches[\s\S]*historical\.email_normalized = p_email[\s\S]*observed\.phone_normalized = historical\.phone_normalized/);
  assert.match(migration, /historical_phone_matches[\s\S]*historical\.phone_normalized = p_phone[\s\S]*observed\.email_normalized = historical\.email_normalized/);
  assert.match(migration, /event\.reason_code = 'contradictory_phone_email'/);
  assert.match(migration, /contradictorySignals[\s\S]*emailsForPhone[\s\S]*> 1/);
  assert.match(migration, /contradictorySignals[\s\S]*phonesForEmail[\s\S]*> 1/);
  assert.match(migration, /representation\.representation_type = 'related_review'/);
  assert.doesNotMatch(migration, /from historical_email_matches historical[\s\S]*join public\.customer_source_bookings_mcp_eap/);
});

test("ranking limit metrics and dedupe are deterministic", () => {
  assert.match(migration, /'direct'[\s\S]*1::integer as match_rank/);
  assert.match(migration, /'booking', 2/);
  assert.match(migration, /'source_customer', 2/);
  assert.match(migration, /'historically_related'[\s\S]*3::integer as match_rank/);
  assert.match(migration, /partition by matched\.representation_key[\s\S]*order by matched\.match_rank, matched\.match_type/);
  assert.match(migration, /p_limit < 1 or p_limit > 20/);
  assert.match(migration, /limit p_limit/);
  assert.match(migration, /Customer Window v2 search metrics are incomplete/);
});

test("versioned schema already supplies every required lookup index", () => {
  const sourceSchema = readFileSync("supabase/migrations/20260831120000_create_customer_source_bookings_mcp_eap.sql", "utf8");
  const identitySchema = readFileSync("supabase/migrations/20260901120000_create_customer_identity_model.sql", "utf8");
  for (const index of ["booking_code_idx", "phone_idx", "email_idx", "plate_idx"]) assert.match(sourceSchema, new RegExp(index));
  assert.match(sourceSchema, /unique \(source, source_row_id\)/);
  assert.match(identitySchema, /customer_source_bookings_mcp_eap_customer_id_idx[\s\S]*source_customer_id/);
  assert.match(identitySchema, /customer_identity_links_lookup_idx[\s\S]*identity_type, identity_value_normalized, status/);
  assert.doesNotMatch(migration, /create\s+(?:unique\s+)?index/i);
});

test("search normalization reuses the established exact contracts", () => {
  assert.deepEqual(search.buildCustomerWindowSearchTermsV2(" Cliente@Example.COM "), {
    email: "cliente@example.com", exactIdentifier: "Cliente@Example.COM", numericIdentifier: null,
    phone: null, plate: null,
  });
  assert.equal(search.buildCustomerWindowSearchTermsV2("+56 9 1234-5678").phone, "56912345678");
  assert.equal(search.buildCustomerWindowSearchTermsV2("ab-cd.12").plate, "ABCD12");
  assert.equal(search.buildCustomerWindowSearchTermsV2("805239").numericIdentifier, "805239");
  assert.equal(search.buildCustomerWindowSearchTermsV2("9007199254740993").numericIdentifier, "9007199254740993");
  assert.equal(search.buildCustomerWindowSearchTermsV2("x"), null);
});

test("reversible harness embeds the migration and preserves rollback", () => {
  assert.equal(migrationBody(harness), migrationBody(migration));
  assert.match(harness, /^begin;/);
  assert.doesNotMatch(harness, /\bcommit\s*;/i);
  for (const marker of ["confirmed_email", "confirmed_phone", "related_email", "related_phone", "booking", "source_customer", "source_row", "plate", "large_group", "historical_one_hop_ok", "no_results_ok", "no_cross_group_leakage"]) {
    assert.match(harness, new RegExp(marker));
  }
  assert.match(harness, /rollback;[\s\S]*search_rpc_absent_after_rollback/);
});
