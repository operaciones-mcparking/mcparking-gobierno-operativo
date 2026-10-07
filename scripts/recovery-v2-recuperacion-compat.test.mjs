import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20261007140000_create_recovery_v2_recuperacion_compat.sql";
const migration = readFileSync(migrationPath, "utf8");
const aclMigrationPath =
  "supabase/migrations/20261007150000_harden_recovery_v2_recuperacion_compat_acl.sql";
const aclMigration = readFileSync(aclMigrationPath, "utf8");
const messageMemoryAuditMigrationPath =
  "supabase/migrations/20261007160000_add_recovery_v2_message_memory_compat_audit.sql";
const messageMemoryAuditMigration = readFileSync(messageMemoryAuditMigrationPath, "utf8");
const messageMemoryNormalizationMigrationPath =
  "supabase/migrations/20261007170000_fix_recovery_v2_message_memory_compat_normalization.sql";
const messageMemoryNormalizationMigration = readFileSync(
  messageMemoryNormalizationMigrationPath,
  "utf8",
);

test("creates the expected V2 compatibility read contracts", () => {
  for (const objectName of [
    "v_recovery_incomplete_bookings_current_compat",
    "v_recovery_whatsapp_message_memory_current_compat",
    "v_recovery_whatsapp_message_memory_raw_current_compat",
    "v_recovery_whatsapp_tracking_current_compat",
    "v_recovery_attribution_cases_v2_compat",
    "recovery_list_conversation_sessions_v2_compat",
    "recovery_v2_compat_shadow_summary",
  ]) {
    assert.match(migration, new RegExp(`public\\.${objectName}`));
  }
});

test("keeps the compatibility layer read-only", () => {
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /recovery_sync_state[\s\S]*(insert|update|delete)/i);
});

test("maps WHATSAPP_CARRITOS payment_not_completed to legacy visible canceled only in compat", () => {
  assert.match(
    migration,
    /when lower\(btrim\(type\)\) = 'payment_not_completed' then 'canceled'/,
  );
  assert.match(migration, /lower\(btrim\(type\)\) as source_type/);
  assert.match(migration, /paymentNotCompletedAsSourceType/);
});

test("derives legacy incomplete booking fields server-side", () => {
  assert.match(migration, /recovery_v2_compat_normalize_email\(email\) as email_normalized/);
  assert.match(migration, /recovery_v2_compat_normalize_phone\(phone\) as phone_normalized/);
  assert.match(migration, /bform_json->>'arrival_date'/);
  assert.match(migration, /intended_arrival_at/);
  assert.match(migration, /intended_departure_date/);
  assert.match(migration, /recovery_v2_compat_quoted_amount\(bform_json\) as quoted_amount/);
});

test("preserves WhatsApp message memory aliases expected by /recuperacion", () => {
  assert.match(migration, /api_phone_normalized/);
  assert.match(migration, /wa_id_normalized/);
  assert.match(migration, /message_at at time zone 'America\/Santiago' as message_at/);
  assert.match(migration, /message_bound_type/);
  assert.match(migration, /processing_time as processing_time_seconds/);
  assert.match(migration, /message_sentiment/);
  assert.match(migration, /chat_state/);
  assert.match(migration, /intent_category/);
  assert.match(migration, /message_text/);
});

test("derives legacy tracking status without adding a new status rule", () => {
  assert.match(migration, /when read_at is not null then 'read'/);
  assert.match(migration, /when delivered_at is not null then 'delivered'/);
  assert.match(migration, /when sent_at is not null then 'sent'/);
  assert.match(migration, /when failed_at is not null then 'failed'/);
  assert.match(migration, /else 'unknown'/);
  assert.match(migration, /coalesce\(billing_type, pricing_model\) as charge_type/);
});

test("recreates attribution from V2 cart compat with current matching window and ranking", () => {
  assert.match(migration, /from public\.v_recovery_incomplete_bookings_current_compat as cart/);
  assert.match(migration, /booking\.is_valid_purchase = true/);
  assert.match(migration, /booking\.id as purchase_id/);
  assert.match(migration, /booking\.batch_id as purchase_batch_id/);
  assert.match(migration, /booking\.booking_created_at as purchase_created_at/);
  assert.match(migration, /coalesce\(booking\.price, 0\) as purchase_amount/);
  assert.match(
    migration,
    /booking\.booking_created_at <= coalesce\(cart\.intended_arrival_at, cart\.form_datetime \+ interval '7 days'\)/,
  );
  assert.match(migration, /when 'email_phone' then 1 when 'email' then 2 when 'phone' then 3/);
  assert.match(migration, /case cart_type when 'canceled' then 1 when 'abandoned' then 2 else 3 end/);
  assert.doesNotMatch(migration, /booking\.booking_code/);
  assert.doesNotMatch(migration, /booking\.amount/);
  assert.doesNotMatch(migration, /booking\.currency/);
});

test("conversation sessions V2 compat uses only V2 compat messages and carts", () => {
  assert.match(
    migration,
    /from public\.v_recovery_whatsapp_message_memory_current_compat as m/,
  );
  assert.match(
    migration,
    /from public\.v_recovery_incomplete_bookings_current_compat as cart/,
  );
  assert.doesNotMatch(
    migration,
    /from public\.recovery_whatsapp_message_memory_import as m/,
  );
});

test("shadow comparator compares legacy and V2 compat totals without switching production objects", () => {
  assert.match(migration, /from public\.recovery_incomplete_bookings_import/);
  assert.match(migration, /from public\.v_recovery_incomplete_bookings_current_compat/);
  assert.match(migration, /from public\.recovery_whatsapp_tracking_import/);
  assert.match(migration, /from public\.v_recovery_whatsapp_tracking_current_compat/);
  assert.match(migration, /from public\.v_recovery_attribution_cases/);
  assert.match(migration, /from public\.v_recovery_attribution_cases_v2_compat/);
  assert.match(migration, /sum\(purchase_amount\)/);
  assert.match(migration, /classification', 'shadow_read_only'/);
});

test("ACL hardening migration revokes anon only from Recovery V2 compat functions", () => {
  const signatures = [
    "public.recovery_v2_compat_normalize_phone\\(text\\)",
    "public.recovery_v2_compat_normalize_email\\(text\\)",
    "public.recovery_v2_compat_safe_jsonb\\(text\\)",
    "public.recovery_v2_compat_parse_date\\(text\\)",
    "public.recovery_v2_compat_parse_hour\\(text\\)",
    "public.recovery_v2_compat_santiago_wall_time\\(date, text\\)",
    "public.recovery_v2_compat_quoted_amount\\(jsonb\\)",
    "public.recovery_list_conversation_sessions_v2_compat\\(integer, integer, text, text\\)",
    "public.recovery_v2_compat_shadow_summary\\(timestamp with time zone, timestamp with time zone\\)",
  ];

  for (const signature of signatures) {
    assert.match(
      aclMigration,
      new RegExp(`revoke execute on function ${signature}\\s+from anon;`, "i"),
    );
    assert.match(
      aclMigration,
      new RegExp(`revoke execute on function ${signature}\\s+from public;`, "i"),
    );
    assert.match(
      aclMigration,
      new RegExp(`grant execute on function ${signature}\\s+to authenticated, service_role;`, "i"),
    );
  }

  assert.doesNotMatch(aclMigration, /grant execute[\s\S]+to anon/i);
  assert.doesNotMatch(aclMigration, /grant execute[\s\S]+to public/i);
  assert.doesNotMatch(aclMigration, /all functions in schema/i);
  assert.doesNotMatch(aclMigration, /revoke all on all functions/i);
  assert.doesNotMatch(aclMigration, /create or replace (function|view)/i);
  assert.doesNotMatch(aclMigration, /\b(insert into|update\s+public\.|delete from|truncate|drop table|drop view)\b/i);
});

test("message memory audit migration creates a read-only no-PII compatibility audit RPC", () => {
  assert.match(
    messageMemoryAuditMigration,
    /create or replace function public\.recovery_v2_compat_message_memory_audit\(\s*p_limit integer default null\s*\)/i,
  );
  assert.match(messageMemoryAuditMigration, /returns jsonb/i);
  assert.match(messageMemoryAuditMigration, /security definer/i);
  assert.match(messageMemoryAuditMigration, /set search_path = ''/i);
  assert.match(messageMemoryAuditMigration, /\bstable\b/i);

  assert.match(messageMemoryAuditMigration, /from public\.recovery_whatsapp_message_memory_import as legacy/i);
  assert.match(messageMemoryAuditMigration, /join public\.v_recovery_whatsapp_message_memory_current_compat as compat/i);
  assert.match(messageMemoryAuditMigration, /from public\.recovery_whatsapp_message_memory_raw_import as legacy/i);
  assert.match(messageMemoryAuditMigration, /join public\.v_recovery_whatsapp_message_memory_raw_current_compat as compat/i);

  assert.match(messageMemoryAuditMigration, /compat\.conversation_id = legacy\.conversation_id/i);
  assert.match(messageMemoryAuditMigration, /compat\.api_phone_normalized is not distinct from legacy\.api_phone_normalized/i);
  assert.match(messageMemoryAuditMigration, /compat\.wa_id_normalized = legacy\.wa_id_normalized/i);
  assert.match(messageMemoryAuditMigration, /compat\.message_at = legacy\.message_at/i);
  assert.match(messageMemoryAuditMigration, /compat\.message_bound_type is not distinct from legacy\.message_bound_type/i);
  assert.match(messageMemoryAuditMigration, /compat\.message_type is not distinct from legacy\.message_type/i);

  assert.match(messageMemoryAuditMigration, /lower\(nullif\(btrim\(legacy_message_sentiment\), ''\)\)/i);
  assert.match(messageMemoryAuditMigration, /'ALIAS \/ NORMALIZACIÓN'/);
  assert.match(messageMemoryAuditMigration, /'SEMÁNTICA DIFERENTE'/);
  assert.match(messageMemoryAuditMigration, /'CAMPO NO DISPONIBLE EN V2'/);
  assert.match(messageMemoryAuditMigration, /'NO COMPARABLE'/);
  assert.match(messageMemoryAuditMigration, /'row_hash'/);
  assert.match(messageMemoryAuditMigration, /legacy_message_text_hash/);
  assert.match(messageMemoryAuditMigration, /v2_message_text_hash/);
  assert.match(messageMemoryAuditMigration, /'message_text_hash'/);
  assert.match(messageMemoryAuditMigration, /'message_text_presence'/);
  assert.doesNotMatch(messageMemoryAuditMigration, /'message_text'\s*,\s*legacy\.message_text/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /'message_text'\s*,\s*compat\.message_text/i);
});

test("message memory audit migration grants only authenticated/service_role execute", () => {
  assert.match(
    messageMemoryAuditMigration,
    /revoke execute on function public\.recovery_v2_compat_message_memory_audit\(integer\)\s+from public, anon;/i,
  );
  assert.match(
    messageMemoryAuditMigration,
    /grant execute on function public\.recovery_v2_compat_message_memory_audit\(integer\)\s+to authenticated, service_role;/i,
  );
  assert.doesNotMatch(messageMemoryAuditMigration, /grant execute[\s\S]+to anon/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /grant execute[\s\S]+to public/i);
});

test("message memory audit migration does not write or switch production objects", () => {
  assert.doesNotMatch(messageMemoryAuditMigration, /\binsert\s+into\b/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /\bupdate\s+public\./i);
  assert.doesNotMatch(messageMemoryAuditMigration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /\btruncate\b/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /\bdrop\s+(table|view|function)\b/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /\bcreate\s+(table|view)\b/i);
  assert.doesNotMatch(messageMemoryAuditMigration, /recovery_sync_state[\s\S]*(insert|update|delete)/i);
});

test("message memory normalization migration only replaces affected compat views", () => {
  assert.match(
    messageMemoryNormalizationMigration,
    /create or replace view public\.v_recovery_whatsapp_message_memory_current_compat as/i,
  );
  assert.match(
    messageMemoryNormalizationMigration,
    /create or replace view public\.v_recovery_whatsapp_message_memory_raw_current_compat as/i,
  );
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\binsert\s+into\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\bupdate\s+public\./i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\btruncate\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\bdrop\s+(table|view|function)\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\bcreate\s+table\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /recovery_sync_state[\s\S]*(insert|update|delete)/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\b(insert\s+into|update|delete\s+from|alter\s+table|drop)\s+public\.recovery_whatsapp_messages_v2\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\b(insert\s+into|update|delete\s+from|alter\s+table|drop)\s+public\.recovery_whatsapp_message_memory_import\b/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /\b(insert\s+into|update|delete\s+from|alter\s+table|drop)\s+public\.recovery_whatsapp_message_memory_raw_import\b/i);
});

test("message memory normalization migration matches legacy category normalization", () => {
  for (const column of [
    "message_bound_type",
    "message_type",
    "day_of_week",
    "message_sentiment",
    "chat_state",
    "intent_category",
  ]) {
    assert.match(
      messageMemoryNormalizationMigration,
      new RegExp(`nullif\\(lower\\(btrim\\(${column}\\)\\), ''\\) as ${column}`, "i"),
    );
  }

  assert.match(
    messageMemoryNormalizationMigration,
    /regexp_replace\(\s*nullif\(lower\(btrim\(time_of_day\)\), ''\),\s*'\^0\(\[0-9\]:\[0-9\]\{2\}\)\$',\s*'\\1'\s*\) as time_of_day/i,
  );
});

test("message memory normalization preserves processing time and row hash contracts", () => {
  assert.match(messageMemoryNormalizationMigration, /processing_time as processing_time_seconds/);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /round\(processing_time|trunc\(processing_time|processing_time\s*[*\/+-]/i);
  assert.match(messageMemoryNormalizationMigration, /source_row_hash as row_hash/);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /recovery_whatsapp_messages_v2_source_hash|digest\(/i);
});

test("message memory raw compat trims message text without lowercasing it", () => {
  assert.match(messageMemoryNormalizationMigration, /btrim\(message_text\) as message_text/);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /lower\(btrim\(message_text\)\)/i);
  assert.doesNotMatch(messageMemoryNormalizationMigration, /regexp_replace\([^;]*message_text/i);
});
