import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260922120000_add_customer_related_review_snapshot_superseded_lifecycle.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const harness = readFileSync(new URL(
  "../supabase/debug/customer_window_related_review_snapshot_superseded_lifecycle_reversible_test.sql",
  import.meta.url), "utf8").replace(/\r\n/g, "\n");
const authority = readFileSync(new URL(
  "../supabase/migrations/20260921120000_add_customer_window_mcp_eap_representations_v2.sql",
  import.meta.url), "utf8");
const migrationBody = migration.replace(/^begin;\n/, "").replace(/\ncommit;\s*$/, "").trim();
const embeddedBody = harness.split("-- BEGIN EMBEDDED MIGRATION BODY\n")[1]
  ?.split("\n-- END EMBEDDED MIGRATION BODY")[0].trim();

test("lifecycle migration is minimal and adds superseded with explicit timing", () => {
  assert.equal(embeddedBody, migrationBody);
  assert.match(migration, /add column superseded_at timestamptz/);
  assert.match(migration, /status in \('building', 'ready', 'active', 'superseded', 'failed'\)/);
  assert.match(migration, /status not in \('ready', 'active', 'superseded'\)/);
  assert.match(migration, /status = 'superseded'[\s\S]*activated_at is not null[\s\S]*superseded_at is not null[\s\S]*superseded_at >= activated_at/);
  assert.doesNotMatch(migration, /\b(create table|drop table|delete from|truncate|insert into|update)\b/i);
  assert.doesNotMatch(migration, /customer_related_review_snapshots_one_active_idx/);
});

test("reversible harness validates acceptance index preservation and cleanup", () => {
  assert.equal((harness.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((harness.match(/^rollback;$/gm) ?? []).length, 1);
  assert.doesNotMatch(harness, /^commit;$/gm);
  assert.match(harness, /pg_catalog\.pg_get_expr\(index_row\.indpred, index_row\.indrelid\) = '\(status = ''active''::text\)'/);
  assert.match(harness, /Superseded snapshot without superseded_at unexpectedly inserted/);
  assert.match(harness, /Existing active snapshot changed during lifecycle harness/);
  assert.match(harness, /Reversible lifecycle cleanup failed/);
  assert.match(harness, /lifecycle_schema_rolled_back/);
  assert.match(harness, /lifecycle_fixtures_rolled_back/);
});

test("active authority remains strictly active-only", () => {
  assert.match(authority, /snapshot\.status = 'active'/);
  assert.doesNotMatch(authority, /superseded/);
});
