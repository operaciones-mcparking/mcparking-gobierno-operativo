import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  assert.match(script, /PT3H/);
  assert.match(script, /-Limit 500 -MaxIterations 400 -MaxRuntimeMs 1200000 -PauseMs 2000/);
  assert.match(script, /startWhenAvailable=\$false/);
  assert.match(script, /bootstrap='manual only'/);
  assert.match(script, /\$AsOfTime = '01:00'/);
  assert.match(script, /\$AutoStartMinute = 12/);
  assert.match(script, /New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew[\s\S]*ExecutionTimeLimit \(New-TimeSpan -Minutes 25\)/);
});

test("PowerShell 5.1 constructs a daily three-hour repetition window without registering a task", () => {
  const probe = String.raw`
$ErrorActionPreference='Stop'
$trigger=New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(1))
$repetition=New-CimInstance -Namespace Root/Microsoft/Windows/TaskScheduler ` + "`" + String.raw`
  -ClassName MSFT_TaskRepetitionPattern -ClientOnly -Property @{
    Interval='PT30M'; Duration='PT3H'; StopAtDurationEnd=$false
  }
$trigger.Repetition=$repetition
[pscustomobject]@{
  DaysInterval=$trigger.DaysInterval
  Interval=[string]$trigger.Repetition.Interval
  Duration=[string]$trigger.Repetition.Duration
  StopAtDurationEnd=$trigger.Repetition.StopAtDurationEnd
} | ConvertTo-Json -Compress
`;
  const powershell = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", probe], {
    encoding: "utf8",
  });
  assert.equal(powershell.status, 0, powershell.stderr);
  assert.deepEqual(JSON.parse(powershell.stdout.trim()), {
    DaysInterval: 1, Interval: "PT30M", Duration: "PT3H", StopAtDurationEnd: false,
  });
});

test("AsOf is windowed and Auto keeps a separate half-hour cadence", () => {
  assert.match(script, /Add-WindowedRepetition \(New-ScheduledTaskTrigger -Daily -At \$dailyAt\)/);
  assert.match(script, /Get-NextHalfHourlyStart -Minute \$AutoStartMinute/);
  assert.match(script, /\$intervalOk=\[string\]\$trigger\.Repetition\.Interval -eq 'PT30M'/);
  assert.match(script, /repeatDuration=\[string\]\$trigger\.Repetition\.Duration/);
  assert.match(script, /minuteOffsets=@\(\$AutoStartMinute,\(\$AutoStartMinute \+ 30\)\)/);
  assert.match(script, /StartBoundary\)\.Minute % 30 -eq \$AutoStartMinute/);
});

test("paths derive from PSScriptRoot and mojibake fails closed", () => {
  assert.match(script, /Split-Path -Parent \$PSScriptRoot/);
  assert.match(script, /Test-Path -LiteralPath \$wrapper/);
  assert.match(script, /\$repoRoot\.Contains\('Ã'\)/);
  assert.doesNotMatch(script, /red de roles, procesos/);
});
