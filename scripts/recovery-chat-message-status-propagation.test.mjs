import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const migrationPath = "supabase/migrations/20261013140000_add_recovery_whatsapp_conversation_message_status.sql";

const route = readFileSync(routePath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

test("chat GET propagates canonical whatsapp_status when the RPC exposes it", () => {
  assert.match(route, /whatsapp_status\?: string \| null/);
  assert.match(route, /whatsappStatus: "whatsapp_status" in message \? message\.whatsapp_status \?\? null : null/);
});

test("conversation RPC derives delivery status only from tracking timestamps", () => {
  assert.match(migration, /left join public\.recovery_whatsapp_tracking_v2 as tracking\s+on tracking\.message_id = msg\.conversation_id/);
  assert.match(migration, /public\.recovery_v2_compat_normalize_phone\(tracking\.business_phone\) = public\.recovery_v2_compat_normalize_phone\(msg\.api_phone\)/);
  assert.match(migration, /public\.recovery_v2_compat_normalize_phone\(tracking\.customer_phone\) = public\.recovery_v2_compat_normalize_phone\(msg\.wa_id\)/);
  assert.match(migration, /when tracking\.read_at is not null then 'read'/);
  assert.match(migration, /when tracking\.delivered_at is not null then 'delivered'/);
  assert.match(migration, /when tracking\.sent_at is not null then 'sent'/);
  assert.match(migration, /when tracking\.failed_at is not null then 'failed'/);
});

test("conversation RPC refuses tracking from a different sender or customer phone", () => {
  const trackingJoin = migration.match(/left join public\.recovery_whatsapp_tracking_v2 as tracking[\s\S]*?where authorized\.ok/);

  assert.ok(trackingJoin, "tracking join not found");
  assert.match(trackingJoin[0], /tracking\.message_id = msg\.conversation_id/);
  assert.match(trackingJoin[0], /tracking\.business_phone/);
  assert.match(trackingJoin[0], /msg\.api_phone/);
  assert.match(trackingJoin[0], /tracking\.customer_phone/);
  assert.match(trackingJoin[0], /msg\.wa_id/);
});

test("conversation RPC never maps chat_state to WhatsApp delivery status", () => {
  assert.doesNotMatch(migration, /chat_state[^,\n]+whatsapp_status/);
  assert.match(migration, /when nullif\(lower\(btrim\(msg\.message_bound_type\)\), ''\) <> 'outbound' then null::text/);
});

test("migration preserves scoped auth and does not expose messages publicly", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.recovery_whatsapp_conversation_messages_v2/);
  assert.match(migration, /from public, anon/);
  assert.match(migration, /to authenticated, service_role/);
});

test("migration recreates the RPC because the returned columns changed", () => {
  assert.match(migration, /begin;/);
  assert.match(migration, /drop function if exists public\.recovery_whatsapp_conversation_messages_v2\(\s*text,\s*text,\s*timestamp with time zone,\s*bigint,\s*integer\s*\);/);
  assert.match(migration, /returns table \([\s\S]*whatsapp_status text[\s\S]*\)/);
  assert.match(migration, /commit;/);
});
