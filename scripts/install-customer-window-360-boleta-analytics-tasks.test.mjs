import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(new URL("./install-customer-window-360-boleta-analytics-tasks.ps1", import.meta.url), "utf8");

test("installer defaults to plan and exposes read-only status", () => {
  assert.match(script, /DefaultParameterSetName = 'Plan'/);
  assert.match(script, /\[switch\]\$Status/);
  assert.match(script, /if \(\$Status\)[\s\S]*Get-TaskSummary/);
  assert.match(script, /if \(-not \$Apply\) \{ exit 0 \}/);
});

test("task contracts are separated and conservative", () => {
  assert.match(script, /Customer360BoletaAnalyticsAuto/);
  assert.match(script, /Customer360BoletaAnalyticsAsOf/);
  assert.match(script, /LogonType Interactive -RunLevel Limited/);
  assert.match(script, /MultipleInstances IgnoreNew/);
  assert.match(script, /PT25M/);
  assert.match(script, /PT30M/);
  assert.match(script, /startWhenAvailable=\$false/);
  assert.match(script, /bootstrap='manual only'/);
  assert.match(script, /Mandatory = \$true[^\]]*\)[^\n]*\$AsOfTime/);
});

test("paths derive from PSScriptRoot and mojibake fails closed", () => {
  assert.match(script, /Split-Path -Parent \$PSScriptRoot/);
  assert.match(script, /Test-Path -LiteralPath \$wrapper/);
  assert.match(script, /\$repoRoot\.Contains\('Ã'\)/);
  assert.doesNotMatch(script, /red de roles, procesos/);
});
