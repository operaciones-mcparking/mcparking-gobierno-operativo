import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20261007180000_add_recovery_live_messages_v2_cart_identity.sql";
const sendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts";
const templateSendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const liveMessageRoutePath = "src/app/api/recuperacion/whatsapp/live-message/route.ts";
const chatRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const indicatorRoutePath = "src/app/api/recuperacion/carritos/chat-indicators/route.ts";
const windowHelperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const conversationSessionsPath = "src/lib/recuperacion/recovery-conversation-sessions.ts";

const migration = readFileSync(migrationPath, "utf8");
const sendRoute = readFileSync(sendRoutePath, "utf8");
const templateSendRoute = readFileSync(templateSendRoutePath, "utf8");
const liveMessageRoute = readFileSync(liveMessageRoutePath, "utf8");
const chatRoute = readFileSync(chatRoutePath, "utf8");
const indicatorRoute = readFileSync(indicatorRoutePath, "utf8");
const windowHelper = readFileSync(windowHelperPath, "utf8");
const conversationSessions = readFileSync(conversationSessionsPath, "utf8");

test("migration adds nullable cart_v2_id with V2 FK and index", () => {
  assert.match(migration, /begin;/i);
  assert.match(migration, /add column if not exists cart_v2_id uuid null/i);
  assert.match(migration, /foreign key \(cart_v2_id\)[\s\S]*references public\.recovery_incomplete_bookings_v2\(id\)[\s\S]*on delete set null[\s\S]*on update no action/i);
  assert.match(migration, /recovery_whatsapp_live_messages_cart_v2_message_at_idx[\s\S]*\(cart_v2_id, message_at\)/i);
  assert.match(migration, /comment on column public\.recovery_whatsapp_live_messages\.cart_v2_id/i);
  assert.match(migration, /commit;/i);
});

test("migration backfill is fail-closed before updating historical rows", () => {
  const firstUpdate = migration.indexOf("update public.recovery_whatsapp_live_messages");

  assert.ok(firstUpdate > 0, "backfill update exists");
  for (const marker of [
    "Ambiguous legacy booking_id for live messages",
    "Ambiguous V2 booking_id for live messages",
    "Unmapped live messages to V2 carts",
  ]) {
    assert.ok(migration.indexOf(marker) > 0 && migration.indexOf(marker) < firstUpdate, `${marker} runs before backfill`);
  }
  assert.match(migration, /v2\.booking_id = legacy\.booking_id[\s\S]*live\.cart_id = legacy\.id/i);
  assert.match(migration, /where live\.cart_id = legacy\.id[\s\S]*and live\.cart_v2_id is null/i);
});

test("migration validates postcondition for historical cart_id rows", () => {
  assert.match(migration, /where cart_id is not null[\s\S]*and cart_v2_id is null/i);
  assert.match(migration, /Live messages with legacy cart_id still missing cart_v2_id/i);
});

test("freeform writes store cart_v2_id and only safe legacy cart_id", () => {
  assert.match(sendRoute, /resolveLegacyCartIdByBookingId/);
  assert.match(sendRoute, /\.from\("v_recovery_incomplete_bookings_current_compat"\)[\s\S]*\.select\("id,booking_id,email_normalized,phone_normalized,type,parking_code"\)/);
  assert.match(sendRoute, /cart_id: legacyIdentity\.legacyCartId/);
  assert.match(sendRoute, /cart_v2_id: cart\.id/);
  assert.match(sendRoute, /Identidad legacy ambigua para el carrito/);
});

test("template writes store cart_v2_id and only safe legacy cart_id", () => {
  assert.match(templateSendRoute, /resolveLegacyCartIdByBookingId/);
  assert.match(templateSendRoute, /\.select\("id,booking_id,phone_normalized,email_normalized,type,parking_code"\)/);
  assert.match(templateSendRoute, /cart_id: legacyIdentity\.legacyCartId/);
  assert.match(templateSendRoute, /cart_v2_id: cartResult\.cart\.id/);
  assert.match(templateSendRoute, /Identidad legacy ambigua para el carrito/);
});

test("live-message webhook supports V2-only cart writes", () => {
  assert.match(liveMessageRoute, /\.from\("v_recovery_incomplete_bookings_current_compat"\)[\s\S]*\.select\("id,booking_id,phone_normalized,email_normalized"\)/);
  assert.match(liveMessageRoute, /cart_id: legacyCartId/);
  assert.match(liveMessageRoute, /cart_v2_id: cartContact\?\.id \?\? null/);
  assert.match(liveMessageRoute, /return \{ legacyCartId: null, ok: true as const \}/);
  assert.match(liveMessageRoute, /Identidad legacy ambigua para el carrito/);
});

test("chat reads live messages by V2 and safe legacy identity with id dedupe", () => {
  assert.match(chatRoute, /\.eq\("cart_v2_id", params\.cartId\)/);
  assert.match(chatRoute, /\.eq\("cart_id", params\.legacyCartId\)/);
  assert.match(chatRoute, /const LIVE_MESSAGE_SELECT = "id,direction,message_at,message_text,source,whatsapp_status"/);
  assert.match(chatRoute, /const key = message\.id/);
});

test("indicators read live messages by V2 and legacy identity with id dedupe", () => {
  assert.match(indicatorRoute, /\.in\("cart_v2_id", cartIds\)/);
  assert.match(indicatorRoute, /\.in\("cart_id", legacyCartIds\)/);
  assert.match(indicatorRoute, /function dedupeLiveRows/);
  assert.match(indicatorRoute, /if \(seen\.has\(row\.id\)\) continue/);
  assert.match(indicatorRoute, /legacyCartIdToV2CartId/);
});

test("freeform window reads live inbound by V2 and safe legacy identity", () => {
  assert.match(windowHelper, /\.eq\("cart_v2_id", cartId\)/);
  assert.match(windowHelper, /\.eq\("cart_id", legacyCartId\)/);
  assert.match(windowHelper, /resolveLegacyCartIdByBookingId/);
  assert.match(windowHelper, /seen\.has\(row\.id\)/);
});

test("conversation sessions stay on the V2 compat RPC and keep their public contract", () => {
  assert.match(conversationSessions, /recovery_list_conversation_sessions_v2_compat/);
  assert.doesNotMatch(conversationSessions, /recovery_whatsapp_live_messages/);
  assert.match(conversationSessions, /sessionId: row\.session_id/);
});

test("no UI files are part of the dual identity implementation contract", () => {
  for (const source of [sendRoute, templateSendRoute, liveMessageRoute, chatRoute, indicatorRoute, windowHelper, conversationSessions]) {
    assert.doesNotMatch(source, /tsx|className=|<button|<div/);
  }
});
