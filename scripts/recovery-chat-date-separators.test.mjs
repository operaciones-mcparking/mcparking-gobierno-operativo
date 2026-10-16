import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/recovery-chat-date.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const helperSource = readFileSync(helperPath, "utf8");
const drawerSource = readFileSync(drawerPath, "utf8");

function loadHelper() {
  const module = { exports: {} };
  const output = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText;

  vm.runInNewContext(output, { exports: module.exports, Intl, module });
  return module.exports;
}

const { formatRecoveryChatDateSeparator, recoveryChatDateKey } = loadHelper();
const now = new Date("2026-10-16T15:00:00.000Z");

test("uses America/Santiago for Hoy and Ayer around local midnight", () => {
  assert.equal(formatRecoveryChatDateSeparator("2026-10-16T03:30:00.000Z", now), "Hoy");
  assert.equal(formatRecoveryChatDateSeparator("2026-10-16T02:59:59.000Z", now), "Ayer");
});

test("formats historical dates and calendar boundaries as DD/MM/YYYY", () => {
  assert.equal(formatRecoveryChatDateSeparator("2026-09-30T18:00:00.000Z", now), "30/09/2026");
  assert.equal(formatRecoveryChatDateSeparator("2025-12-31T18:00:00.000Z", now), "31/12/2025");
});

test("returns a stable Chile date key and rejects invalid timestamps", () => {
  assert.equal(recoveryChatDateKey("2026-10-16T02:59:59.000Z"), "2026-10-15");
  assert.equal(recoveryChatDateKey("invalid"), null);
  assert.equal(formatRecoveryChatDateSeparator("invalid", now), null);
});

test("drawer renders one separator only when the consecutive date key changes", () => {
  assert.match(drawerSource, /const messageDateKey = recoveryChatDateKey\(message\.messageAt\)/);
  assert.match(drawerSource, /const previousDateKey = index > 0 \? recoveryChatDateKey\(visibleMessages\[index - 1\]\?\.messageAt\) : null/);
  assert.match(drawerSource, /messageDateKey !== previousDateKey/);
  assert.match(drawerSource, /formatRecoveryChatDateSeparator\(message\.messageAt, new Date\(nowMs\)\)/);
  assert.match(drawerSource, /role="separator"/);
});

test("pagination and polling keep using the merged chronological message list", () => {
  assert.match(drawerSource, /messages: mergeMessages\(payload\.messages \?\? \[\], current\.messages \?\? \[\]\)/);
  assert.match(drawerSource, /messages: mergeMessages\([\s\S]*current\?\.messages \?\? \[\],[\s\S]*payload\.messages \?\? \[\]/);
  assert.match(drawerSource, /visibleMessages\.map\(\(message, index\) =>/);
});
