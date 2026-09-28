import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wrapper = readFileSync(new URL("./customer-window-360-boleta-analytics-runner.ps1", import.meta.url), "utf8");
const operational = readFileSync(new URL("./customer-window-360-boleta-analytics-provision-operational.ps1", import.meta.url), "utf8");
const secrets = readFileSync(new URL("./customer-window-360-boleta-analytics-provision-secrets.ps1", import.meta.url), "utf8");

test("wrapper has mutually exclusive run and read-only validation modes", () => {
  assert.match(wrapper, /DefaultParameterSetName = 'Run'/);
  assert.match(wrapper, /ValidateSet\('Canary', 'Auto', 'Bootstrap', 'AsOf'\)/);
  assert.match(wrapper, /ParameterSetName = 'Config'/);
  assert.match(wrapper, /ParameterSetName = 'Connection'/);
  assert.match(wrapper, /Customer UUIDs are only valid in Canary mode/);
});

test("wrapper only appends customer IDs when the PowerShell array has real values", () => {
  assert.match(wrapper, /if \(\$null -ne \$CustomerId -and \$CustomerId\.Count -gt 0\) \{/);
  assert.match(wrapper, /foreach \(\$id in \$CustomerId\) \{ \$arguments \+= @\('--customer-id', \$id\.ToString\(\)\) \}/);
  assert.doesNotMatch(wrapper, /foreach \(\$id in @\(\$CustomerId\)\)/);

  const script = String.raw`
$ErrorActionPreference = 'Stop'
$cases = @(
  [pscustomobject]@{ Name = 'null'; Value = $null },
  [pscustomobject]@{ Name = 'empty'; Value = [Guid[]]@() },
  [pscustomobject]@{ Name = 'single'; Value = [Guid[]]@([Guid]'10000000-0000-4000-8000-000000000001') },
  [pscustomobject]@{ Name = 'multiple'; Value = [Guid[]]@(
    [Guid]'10000000-0000-4000-8000-000000000001',
    [Guid]'20000000-0000-4000-8000-000000000002'
  ) }
)
$result = foreach ($case in $cases) {
  $CustomerId = $case.Value
  $arguments = @('--mode', 'bootstrap')
  if ($null -ne $CustomerId -and $CustomerId.Count -gt 0) {
    foreach ($id in $CustomerId) { $arguments += @('--customer-id', $id.ToString()) }
  }
  [pscustomobject]@{
    Name = $case.Name
    CustomerArgumentCount = @($arguments | Where-Object { $_ -eq '--customer-id' }).Count
  }
}
$result | ConvertTo-Json -Compress
`;
  const powershell = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  assert.equal(powershell.status, 0, powershell.stderr);
  const result = JSON.parse(powershell.stdout.trim());
  assert.deepEqual(result, [
    { Name: "null", CustomerArgumentCount: 0 },
    { Name: "empty", CustomerArgumentCount: 0 },
    { Name: "single", CustomerArgumentCount: 1 },
    { Name: "multiple", CustomerArgumentCount: 2 },
  ]);
});

test("PowerShell 5.1 maps every public mode to the exact runner CLI mode", () => {
  assert.match(wrapper, /function Resolve-CliMode/);
  assert.match(wrapper, /'AsOf' \{ return 'as_of' \}/);
  assert.doesNotMatch(wrapper, /\$Mode\.ToLowerInvariant\(\)/);

  const script = String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Resolve-CliMode {
  param([string]$RequestedMode)
  switch ($RequestedMode) {
    'Canary' { return 'canary' }
    'Auto' { return 'auto' }
    'Bootstrap' { return 'bootstrap' }
    'AsOf' { return 'as_of' }
    default { throw 'Unsupported runner mode.' }
  }
}
$result = [ordered]@{}
foreach ($mode in @('Canary','Auto','Bootstrap','AsOf')) {
  $result[$mode] = Resolve-CliMode -RequestedMode $mode
}
try { [void](Resolve-CliMode -RequestedMode 'Unsupported'); $result.FailClosed = $false }
catch { $result.FailClosed = $true }
$result | ConvertTo-Json -Compress
`;
  const powershell = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  assert.equal(powershell.status, 0, powershell.stderr);
  assert.deepEqual(JSON.parse(powershell.stdout.trim()), {
    Canary: "canary", Auto: "auto", Bootstrap: "bootstrap", AsOf: "as_of", FailClosed: true,
  });
});

test("PowerShell 5.1 safely preserves minimal and partial child errors", () => {
  for (const property of ["mode", "iterations", "processedTotal", "removedTotal", "hasMore", "finalStatus"]) {
    assert.match(wrapper, new RegExp(`Get-SafeProperty \\$Result '${property}'`));
  }
  assert.match(wrapper, /Get-SafeProperty \$child\.Result 'finalStatus'/);

  const script = String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Get-SafeProperty {
  param($Value, [string]$Name)
  if ($null -ne $Value -and $Value.PSObject.Properties.Name -contains $Name) { return $Value.$Name }
  return $null
}
$minimal = '{"ok":false,"code":"invalid_mode"}' | ConvertFrom-Json
$partial = '{"ok":false,"code":"runner_failed","phase":"refresh","processedProfiles":2}' | ConvertFrom-Json
$result = [pscustomobject]@{
  MinimalCode = Get-SafeProperty $minimal 'code'
  MinimalFinalStatus = Get-SafeProperty $minimal 'finalStatus'
  MinimalHasMore = Get-SafeProperty $minimal 'hasMore'
  PartialCode = Get-SafeProperty $partial 'code'
  PartialPhase = Get-SafeProperty $partial 'phase'
  PartialProcessedProfiles = Get-SafeProperty $partial 'processedProfiles'
  PartialRemovedProfiles = Get-SafeProperty $partial 'removedProfiles'
}
$result | ConvertTo-Json -Compress
`;
  const powershell = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  assert.equal(powershell.status, 0, powershell.stderr);
  assert.deepEqual(JSON.parse(powershell.stdout.trim()), {
    MinimalCode: "invalid_mode", MinimalFinalStatus: null, MinimalHasMore: null,
    PartialCode: "runner_failed", PartialPhase: "refresh", PartialProcessedProfiles: 2,
    PartialRemovedProfiles: null,
  });
});

test("bootstrap, as_of, and auto modes do not require customer IDs", () => {
  const runner = readFileSync(new URL("./customer-window-360-boleta-analytics-v1-runner.mjs", import.meta.url), "utf8");
  assert.match(runner, /\["canary", "auto", "bootstrap", "as_of"\]\.includes\(options\.mode\)/);
  assert.match(runner, /if \(options\.mode === "canary"\)/);
  assert.match(runner, /else if \(options\.customerIds\.length\)/);
});

test("PowerShell limits the expanded drain budget to AsOf and forwards exact CLI arguments", () => {
  assert.match(wrapper, /ValidateRange\(1, 400\).*\$MaxIterations = 10/);
  assert.match(wrapper, /\$Mode -ne 'AsOf' -and \$MaxIterations -gt 100/);
  assert.match(wrapper, /\$Mode -eq 'AsOf' -and \$MaxRuntimeMs -gt 1200000/);
  assert.match(wrapper, /'--max-iterations', \[string\]\$MaxIterations, '--max-runtime-ms', \[string\]\$MaxRuntimeMs/);
});

test("wrapper uses a separate DPAPI/TLS configuration and never HMAC", () => {
  assert.match(wrapper, /Customer360BoletaAnalytics/);
  assert.match(wrapper, /runner-password\.dpapi/);
  assert.match(wrapper, /ConvertTo-SecureString/);
  assert.match(wrapper, /sslmode=verify-full&sslrootcert=/);
  assert.match(wrapper, /aws-1-us-east-1\.pooler\.supabase\.com/);
  assert.match(wrapper, /caSha256/);
  assert.match(wrapper, /configUserSid/);
  assert.doesNotMatch(wrapper, /RelatedReview|HMAC|hmac-v1/i);
});

test("wrapper sanitizes child output and publishes atomic latest state", () => {
  assert.match(wrapper, /function Select-SafeRecord/);
  assert.match(wrapper, /function Write-AtomicJson/);
  assert.match(wrapper, /\[IO\.File\]::Replace\(\$temporary, \$Path, \$backup\)/);
  assert.match(wrapper, /ReadToEndAsync\(\)/);
  assert.match(wrapper, /WaitForExit\(\)/);
  assert.match(wrapper, /\$process\.Dispose\(\)/);
  for (const forbidden of ["DATABASE_URL", "password", "stack", "sourceRowId", "customerId"]) {
    assert.doesNotMatch(wrapper.slice(wrapper.indexOf("$allowed = @("), wrapper.indexOf("return [pscustomobject]$safe")), new RegExp(`'${forbidden}'`, "i"));
  }
});

test("operational provisioning creates least-privilege separated paths", () => {
  assert.match(operational, /root\/config\/certs: ReadAndExecute; logs\/state: Modify/);
  assert.match(operational, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(operational, /S-1-5-18/);
  assert.match(operational, /S-1-5-32-544/);
  assert.match(operational, /Get-FileHash/);
});

test("secret provisioning validates before atomically publishing a DPAPI bundle", () => {
  assert.match(secrets, /if \(-not \$Apply\) \{ exit 0 \}/);
  assert.match(secrets, /--check-connection/);
  assert.match(secrets, /privilegeContractValid/);
  assert.match(secrets, /ConvertFrom-SecureString \$secure/);
  assert.match(secrets, /function Publish-Bundle/);
  assert.match(secrets, /WriteAllText\(\$item\.Temp/);
  assert.match(secrets, /\[IO\.File\]::Replace/);
  assert.match(secrets, /\}\r?\nexit 0\s*$/);
  assert.doesNotMatch(secrets, /\$LASTEXITCODE/);
  assert.doesNotMatch(secrets, /password\s*=\s*['\"][^'\"]+['\"]/i);
});

test("connection checks certify the client TLS socket instead of backend pg_stat_ssl", () => {
  const runner = readFileSync(new URL("./customer-window-360-boleta-analytics-v1-runner.mjs", import.meta.url), "utf8");
  assert.match(runner, /connection\?\.stream/);
  assert.match(runner, /stream\?\.encrypted === true/);
  assert.match(runner, /stream\?\.authorized === true/);
  assert.match(runner, /ssl\.rejectUnauthorized === true/);
  assert.match(runner, /stream\?\.servername === host/);
  assert.doesNotMatch(runner, /pg_stat_ssl/);
});
