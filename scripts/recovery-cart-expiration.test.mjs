import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("src/lib/dashboard/data.ts", "utf8");
const sourceFile = ts.createSourceFile("data.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const declarations = new Map();

for (const statement of sourceFile.statements) {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    declarations.set(statement.name.text, statement.getText(sourceFile));
  }
}

const executableSource = [
  'const RECOVERY_TIME_ZONE = "America/Santiago";',
  declarations.get("timeZoneParts"),
  declarations.get("santiagoCalendarDateValue"),
  declarations.get("hasRecoveryCartArrivalExpired"),
  declarations.get("resolveRecoveryCartAuditStatus"),
].join("\n");
const compiled = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiled)(runtimeModule.exports, runtimeModule);

const { hasRecoveryCartArrivalExpired, resolveRecoveryCartAuditStatus } = runtimeModule.exports;
const todayAt2359 = new Date("2026-08-25T02:59:00.000Z");
const todayAt1600 = new Date("2026-08-24T20:00:00.000Z");

test("check-in today at 00:01 is not expired at 23:59 Santiago", () => {
  assert.equal(hasRecoveryCartArrivalExpired("2026-08-24T04:01:00.000Z", null, todayAt2359), false);
});

test("check-in today at 08:00 is not expired at 16:00 Santiago", () => {
  assert.equal(hasRecoveryCartArrivalExpired("2026-08-24T12:00:00.000Z", null, todayAt1600), false);
});

test("check-in yesterday at 23:59 is expired today", () => {
  assert.equal(hasRecoveryCartArrivalExpired("2026-08-24T03:59:00.000Z", null, todayAt1600), true);
});

test("check-in tomorrow is not expired", () => {
  assert.equal(hasRecoveryCartArrivalExpired("2026-08-25T12:00:00.000Z", null, todayAt1600), false);
});

test("recovered status keeps priority over expiration", () => {
  assert.equal(
    resolveRecoveryCartAuditStatus("recovered_with_amount", null, "2026-08-23", todayAt1600),
    "recovered_with_amount",
  );
});

test("payment review keeps priority over expiration", () => {
  assert.equal(
    resolveRecoveryCartAuditStatus("payment_review", null, "2026-08-23", todayAt1600),
    "payment_review",
  );
});

test("intended arrival date has priority over timestamp", () => {
  assert.equal(
    hasRecoveryCartArrivalExpired("2026-08-23T12:00:00.000Z", "2026-08-24", todayAt1600),
    false,
  );
});
