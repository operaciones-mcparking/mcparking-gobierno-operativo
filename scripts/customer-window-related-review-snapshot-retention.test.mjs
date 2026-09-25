import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260925120000_add_customer_related_review_snapshot_retention.sql",
  import.meta.url), "utf8");
const harness = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_snapshot_retention_reversible_test.sql",
  import.meta.url), "utf8");

function migrationBody(sql) {
  return sql.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "").trim();
}

function embeddedBody(sql) {
  const match = sql.match(/-- BEGIN EMBEDDED MIGRATION BODY\s*([\s\S]*?)\s*-- END EMBEDDED MIGRATION BODY/);
  assert.ok(match, "embedded migration body missing");
  return match[1].trim();
}

test("retention migration is narrow, fail-closed, and least-privileged", () => {
  assert.match(migration,
    /create or replace function public\.customer_related_review_prune_superseded_v1_m2m\(\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /pg_try_advisory_xact_lock\(181923741, 1\)/i);
  assert.match(migration, /set_config\('lock_timeout', '3s', true\)/i);
  assert.match(migration, /status = 'superseded'/i);
  assert.match(migration, /row_number\(\) over \([\s\S]*created_at desc[\s\S]*snapshot_id desc/i);
  assert.match(migration, /retention_rank > 5/i);
  assert.match(migration, /limit 1/i);
  assert.match(migration, /snapshot\.snapshot_id <> v_active_snapshot_id/i);
  assert.match(migration,
    /revoke all on function[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration,
    /grant execute on function[\s\S]*to customer_related_review_builder/i);
  assert.doesNotMatch(migration, /grant\s+delete\s+on\s+table/i);
  assert.doesNotMatch(migration, /status\s*(?:<>|!=)\s*'active'/i);
});

test("reversible harness embeds the exact migration and covers lifecycle and cascades", () => {
  assert.equal(embeddedBody(harness), migrationBody(migration));
  assert.match(harness, /^begin;/im);
  assert.match(harness, /rollback;/i);
  assert.match(harness, /1\+5 contract failed/i);
  assert.match(harness, /Ready snapshot did not block retention/i);
  assert.match(harness, /Building snapshot did not block retention/i);
  assert.match(harness, /Missing active snapshot did not block retention/i);
  assert.match(harness, /Changed retention candidate was deleted/i);
  for (const table of [
    "customer_analytical_booking_assignments",
    "customer_related_review_groups",
    "customer_related_review_members",
    "customer_related_review_metrics",
  ]) {
    assert.match(harness, new RegExp(`public\\.${table}`));
  }
  assert.match(harness, /retention_rpc_absent_after_rollback/i);
});
