import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/recovery-chat-message-merge.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const routePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const helperSource = readFileSync(helperPath, "utf8");
const drawerSource = readFileSync(drawerPath, "utf8");
const routeSource = readFileSync(routePath, "utf8");

function loadHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText;

  vm.runInNewContext(output, { exports: module.exports, module });
  return module.exports;
}

const { mergeRecoveryChatMessages } = loadHelperExports();

function message(overrides = {}) {
  return {
    direction: "outbound",
    messageAt: "2026-10-14T16:33:44.412Z",
    messageSource: "web_operator",
    messageText: "same preview",
    source: "live",
    sourceMessageId: "live-1",
    whatsappMessageId: null,
    whatsappStatus: "pending",
    ...overrides,
  };
}

test("polling removes a stale pending LIVE row only after the server reconciles its ID by WAMID", () => {
  const pending = message();
  const canonical = message({
    messageSource: null,
    source: "message_memory",
    sourceMessageId: "canonical-1",
    whatsappMessageId: "wamid-1",
    whatsappStatus: "sent",
  });

  const merged = mergeRecoveryChatMessages([pending], [canonical], ["live-1"]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "message_memory");
  assert.equal(merged[0].whatsappMessageId, "wamid-1");
});

test("polling replaces pending with the updated LIVE row before canonical sync", () => {
  const pending = message();
  const sent = message({ whatsappMessageId: "wamid-1", whatsappStatus: "sent" });

  const merged = mergeRecoveryChatMessages([pending], [sent]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].whatsappMessageId, "wamid-1");
  assert.equal(merged[0].whatsappStatus, "sent");
});

test("a definitive LIVE update replaces pending without inventing a WAMID", () => {
  const pending = message();
  const failed = message({ whatsappStatus: "failed" });

  const merged = mergeRecoveryChatMessages([pending], [failed]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].whatsappMessageId, null);
  assert.equal(merged[0].whatsappStatus, "failed");
});

test("canonical wins over LIVE when both carry the same WAMID", () => {
  const live = message({ whatsappMessageId: "wamid-1", whatsappStatus: "pending" });
  const canonical = message({
    messageSource: null,
    source: "message_memory",
    sourceMessageId: "canonical-1",
    whatsappMessageId: "wamid-1",
    whatsappStatus: "read",
  });

  const merged = mergeRecoveryChatMessages([live], [canonical]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "message_memory");
  assert.equal(merged[0].whatsappStatus, "read");
});

test("failed LIVE reconciliation without WAMID stays visible", () => {
  const pending = message({ whatsappStatus: "unconfirmed" });
  const canonical = message({
    messageSource: null,
    source: "message_memory",
    sourceMessageId: "canonical-1",
    whatsappMessageId: "wamid-1",
    whatsappStatus: "sent",
  });

  const merged = mergeRecoveryChatMessages([pending], [canonical]);

  assert.equal(merged.length, 2);
});

test("identical text and timestamps remain distinct when WAMIDs differ", () => {
  const first = message({ sourceMessageId: "live-1", whatsappMessageId: "wamid-1" });
  const second = message({ sourceMessageId: "live-2", whatsappMessageId: "wamid-2" });

  const merged = mergeRecoveryChatMessages([], [first, second]);

  assert.equal(merged.length, 2);
});

test("two real sends remain visible even when their content is identical", () => {
  const first = message({ messageAt: "2026-10-14T16:33:44.000Z", whatsappMessageId: "wamid-1" });
  const second = message({ messageAt: "2026-10-14T16:33:45.000Z", sourceMessageId: "live-2", whatsappMessageId: "wamid-2" });

  const merged = mergeRecoveryChatMessages([first], [second]);

  assert.deepEqual(Array.from(merged, (item) => item.whatsappMessageId), ["wamid-1", "wamid-2"]);
});

test("older pagination merges in strict chronological order without removing unrelated messages", () => {
  const older = message({ direction: "inbound", messageAt: "2026-10-14T16:20:00.000Z", sourceMessageId: "old-1" });
  const current = message({ messageAt: "2026-10-14T16:33:44.000Z", whatsappMessageId: "wamid-1" });

  const merged = mergeRecoveryChatMessages([current], [older]);

  assert.deepEqual(Array.from(merged, (item) => item.sourceMessageId), ["old-1", "live-1"]);
});

test("GET exposes only WAMID-backed LIVE reconciliation and silent polling consumes it", () => {
  assert.match(routeSource, /function reconciledLiveMessageIds/);
  assert.match(routeSource, /canonicalWamids\.has\(liveWamid\)/);
  assert.doesNotMatch(routeSource.slice(routeSource.indexOf("function reconciledLiveMessageIds"), routeSource.indexOf("async function loadLiveMessages")), /messageText|messageAt/);
  assert.match(drawerSource, /payload\.reconciledLiveMessageIds \?\? \[\]/);
  assert.match(drawerSource, /mergeRecoveryChatMessages\(existing, incoming, reconciledLiveMessageIds\)/);
});

test("reconciliation does not reset composer, scroll, or pagination state", () => {
  assert.match(drawerSource, /setMessageDraft\(""\)/);
  assert.match(drawerSource, /olderMessagesScrollHeightRef/);
  assert.match(drawerSource, /pagination:\s*current\?\.pagination \?\? payload\.pagination/);
});
