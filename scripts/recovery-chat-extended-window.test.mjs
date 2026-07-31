import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const rangeHelperPath = "src/lib/recuperacion/recovery-chat-read-range.ts";
const whatsappWindowPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const sendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts";
const routeSource = readFileSync(routePath, "utf8");
const rangeHelperSource = readFileSync(rangeHelperPath, "utf8");
const whatsappWindowSource = readFileSync(whatsappWindowPath, "utf8");
const sendRouteSource = readFileSync(sendRoutePath, "utf8");

function loadRangeHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(rangeHelperSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: rangeHelperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
  });

  return module.exports;
}

const { resolveChatReadRange } = loadRangeHelperExports();
const maxChatMessagesMatch = routeSource.match(/const MAX_CHAT_MESSAGES = (\d+);/);
const MAX_CHAT_MESSAGES = maxChatMessagesMatch ? Number(maxChatMessagesMatch[1]) : null;

function isInHalfOpenRange(value, start, end) {
  return Date.parse(value) >= Date.parse(start) && Date.parse(value) < Date.parse(end);
}

test("latest cart extends Message Memory read range from windowStart to now", () => {
  const windowStart = "2026-07-21T21:00:56+00:00";
  const windowEnd = "2026-07-28T21:00:56.000Z";
  const nowIso = "2026-07-31T20:00:00.000Z";
  const laterMessageAt = "2026-07-31T19:31:17+00:00";

  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: false,
    nowIso,
    windowEnd,
    windowStart,
  });

  assert.equal(range.chatReadStart, windowStart);
  assert.equal(range.chatReadEnd, nowIso);
  assert.equal(isInHalfOpenRange(laterMessageAt, range.chatReadStart, range.chatReadEnd), true);
});

test("older cart keeps historical windowEnd when a newer cart exists for the same phone", () => {
  const windowStart = "2026-07-21T21:00:56+00:00";
  const windowEnd = "2026-07-28T21:00:56.000Z";
  const laterMessageAt = "2026-07-31T19:31:17+00:00";

  const range = resolveChatReadRange({
    hasNewerCartForPhone: true,
    newerCartLookupFailed: false,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd,
    windowStart,
  });

  assert.equal(range.chatReadEnd, windowEnd);
  assert.equal(isInHalfOpenRange(laterMessageAt, range.chatReadStart, range.chatReadEnd), false);
});

test("newer cart with a different phone does not block extension", () => {
  assert.match(routeSource, /\.eq\("phone_normalized",\s*params\.phoneNormalized\)/);
  assert.match(routeSource, /\.gt\("form_datetime",\s*params\.formDatetime\)/);
  assert.match(routeSource, /\.neq\("id",\s*params\.cartId\)/);

  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: false,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd: "2026-07-28T21:00:56.000Z",
    windowStart: "2026-07-21T21:00:56+00:00",
  });

  assert.equal(range.chatReadEnd, "2026-07-31T20:00:00.000Z");
});

test("newer cart lookup errors fail closed and keep windowEnd", () => {
  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: true,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd: "2026-07-28T21:00:56.000Z",
    windowStart: "2026-07-21T21:00:56+00:00",
  });

  assert.equal(range.chatReadEnd, "2026-07-28T21:00:56.000Z");
});

test("public cart DTO keeps the original historical windowStart and windowEnd", () => {
  assert.match(routeSource, /cart:\s*safeCartPayload\(cart,\s*windowStart,\s*windowEnd\)/);
  assert.doesNotMatch(routeSource, /safeCartPayload\(cart,\s*chatReadStart,\s*chatReadEnd\)/);
  assert.match(routeSource, /windowEndDate = cart\.form_datetime \? addDays\(cart\.form_datetime,\s*7\) : null/);
});

test("live messages explicitly associated to the cart keep their existing query and limit", () => {
  assert.match(routeSource, /\.from\("recovery_whatsapp_live_messages"\)[\s\S]*?\.eq\("cart_id",\s*params\.cartId\)[\s\S]*?\.limit\(MAX_CHAT_MESSAGES\)/);
  assert.match(routeSource, /\.from\("recovery_whatsapp_live_messages"\)[\s\S]*?\.eq\("phone_normalized",\s*params\.phoneNormalized\)[\s\S]*?\.gte\("message_at",\s*params\.windowStart\)[\s\S]*?\.lt\("message_at",\s*params\.windowEnd\)/);
});

test("Message Memory queries use the protected chatRead range", () => {
  assert.match(routeSource, /import \{ resolveChatReadRange \} from "@\/lib\/recuperacion\/recovery-chat-read-range"/);
  assert.doesNotMatch(routeSource, /export function resolveChatReadRange/);
  assert.match(routeSource, /recovery_whatsapp_message_memory_raw_import[\s\S]*?\.gte\("message_at",\s*chatReadStart\)[\s\S]*?\.lt\("message_at",\s*chatReadEnd\)/);
  assert.match(routeSource, /recovery_whatsapp_message_memory_import[\s\S]*?\.gte\("message_at",\s*chatReadStart\)[\s\S]*?\.lt\("message_at",\s*chatReadEnd\)/);
});

test("MAX_CHAT_MESSAGES remains 100", () => {
  assert.equal(MAX_CHAT_MESSAGES, 100);
  assert.doesNotMatch(routeSource, /export const MAX_CHAT_MESSAGES/);
  assert.match(routeSource, /\.limit\(MAX_CHAT_MESSAGES\)/);
});

test("raw Message Memory keeps priority over normal metadata", () => {
  const rawQueryIndex = routeSource.indexOf('from("recovery_whatsapp_message_memory_raw_import")');
  const rawReturnIndex = routeSource.indexOf('summary: buildSummary(messages, "raw")');
  const normalQueryIndex = routeSource.indexOf('from("recovery_whatsapp_message_memory_import")');

  assert.ok(rawQueryIndex > 0, "raw query exists");
  assert.ok(rawReturnIndex > rawQueryIndex, "raw return exists after raw query");
  assert.ok(normalQueryIndex > rawReturnIndex, "normal query happens only after raw priority branch");
});

test("WAMID remains outside the public DTO and Message Memory selects", () => {
  assert.doesNotMatch(routeSource, /conversation_id/);
  assert.doesNotMatch(routeSource, /whatsapp_message_id/);
  assert.doesNotMatch(routeSource, /wamid/i);
});

test("WhatsApp 24-hour authorization helper and POST send route are not part of this change", () => {
  assert.match(routeSource, /getWhatsappFreeformWindowForCart\(admin\.supabase,\s*cartId\)/);
  assert.match(whatsappWindowSource, /classifyWhatsappFreeformWindow/);
  assert.match(sendRouteSource, /getWhatsappFreeformWindowForCart\(admin\.supabase,\s*cart\.id\)/);
  assert.match(sendRouteSource, /callN8nWebhook\(\{ cart, messageText, operatorEmail, sentAt \}\)/);
  assert.match(sendRouteSource, /WHATSAPP_FREEFORM_WINDOW_UNVERIFIABLE/);
  assert.doesNotMatch(routeSource, /callN8nWebhook/);
  assert.doesNotMatch(routeSource, /export\s+async\s+function\s+POST/);
});

test("no unrelated /orquestador files are touched", () => {
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const orquestadorFiles = changedFiles.filter((path) => path.startsWith("src/app/orquestador/") || path.startsWith("src/lib/orquestador/"));

  assert.equal(orquestadorFiles.every((path) => path === "src/app/orquestador/page.tsx"), true);
});