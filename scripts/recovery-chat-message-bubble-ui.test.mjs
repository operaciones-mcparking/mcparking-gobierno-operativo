import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const drawer = readFileSync(drawerPath, "utf8");

test("message bubbles hide technical conversation metadata", () => {
  assert.doesNotMatch(drawer, /Intencion: \{message\.intentCategory\}/);
  assert.doesNotMatch(drawer, /Sentimiento: \{message\.messageSentiment\}/);
  assert.doesNotMatch(drawer, /Estado: \{message\.chatState\}/);
  assert.doesNotMatch(drawer, /Tipo: \{message\.messageType\}/);
  assert.doesNotMatch(drawer, /WhatsApp: \{message\.whatsappStatus\}/);
});

test("message bubbles keep text and Santiago timestamp", () => {
  assert.match(drawer, /message\.messageText \|\| genericMessageText\(message\.direction\)/);
  assert.match(drawer, /formatDateTime\(message\.messageAt\)/);
  assert.match(drawer, /timeZone: RECOVERY_TIME_ZONE/);
});

test("outbound bubbles show delivery indicators only from existing whatsapp status", () => {
  assert.match(drawer, /!isInbound \? <WhatsappDeliveryIndicator status=\{message\.whatsappStatus\} \/> : null/);
  assert.match(drawer, /normalized === "pending"/);
  assert.match(drawer, /normalized === "unconfirmed"/);
  assert.match(drawer, /normalized === "sent"/);
  assert.match(drawer, /normalized === "delivered"/);
  assert.match(drawer, /normalized === "read"/);
  assert.match(drawer, /normalized === "failed"/);
});

test("delivery indicators do not invent tracking for missing or unknown statuses", () => {
  assert.match(drawer, /return null;\r?\n}/);
  assert.match(drawer, /if \(!view\) return null;/);
});
