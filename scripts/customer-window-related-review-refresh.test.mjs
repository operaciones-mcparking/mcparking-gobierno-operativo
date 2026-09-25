import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const operational = readFileSync(new URL("./related-review-provision-operational.ps1",
  import.meta.url), "utf8");
const secrets = readFileSync(new URL("./related-review-provision-secrets.ps1",
  import.meta.url), "utf8");
const wrapper = readFileSync(new URL("./customer-window-related-review-refresh.ps1",
  import.meta.url), "utf8");
const all = [operational, secrets, wrapper].join("\n");
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));

test("operational provisioning is plan-only by default and declares exact ACL intent", () => {
  assert.match(operational, /^#requires -Version 5\.1/m);
  assert.match(operational, /param\([\s\S]*\[switch\]\$Apply/);
  assert.match(operational, /if \(-not \$Apply\)[\s\S]*PLAN ONLY/);
  assert.match(operational, /C:\\ProgramData\\McParking\\RelatedReview/);
  assert.match(operational, /C:\\Temp\\supabase-ca\.crt/);
  assert.match(operational, /Get-FileHash[\s\S]*SHA256/);
  assert.match(operational, /S-1-5-18/);
  assert.match(operational, /S-1-5-32-544/);
  assert.match(operational, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(operational, /TaskUserSid[\s\S]*ReadAndExecute/);
  assert.match(operational,
    /temporaryProvisioningAcl = 'none; elevated provisioning writes through Administrators FullControl'/);
  assert.match(operational,
    /taskUserFinal = 'root\/config\/certs: ReadAndExecute; logs\/state: Modify'/);
  assert.match(operational, /\$leaf -in @\('logs', 'state'\)/);
  assert.doesNotMatch(operational, /config\/logs\/state: Modify/);
  assert.match(operational, /\[IO\.File\]::Replace/);
  assert.match(operational, /\[IO\.File\]::Move/);
  assert.doesNotMatch(operational, /Move-Item[^\n]*-Force/);
});

test("secret provisioning uses CurrentUser DPAPI and never generates a replacement HMAC", () => {
  assert.match(secrets, /^#requires -Version 5\.1/m);
  assert.match(secrets, /Read-Host[^\n]*builder_login[^\n]*-AsSecureString/);
  assert.match(secrets, /Read-Host[^\n]*HMAC V1[^\n]*-AsSecureString/);
  assert.match(secrets, /\[switch\]\$UseHmacFromClipboard/);
  assert.match(secrets, /\[switch\]\$UseBuilderPasswordFromClipboard/);
  assert.match(secrets, /\$passwordClipboard = Get-Clipboard -Raw/);
  assert.match(secrets,
    /ConvertTo-ValidatedBuilderPasswordSecureString -Value \$passwordClipboard/);
  assert.doesNotMatch(secrets, /\$passwordClipboard\.Trim\(/);
  assert.match(secrets, /\$hmacClipboard = Get-Clipboard -Raw/);
  assert.match(secrets, /\$normalized = \$Value\.Trim\(\)/);
  assert.match(secrets, /ConvertFrom-SecureString/);
  assert.match(secrets, /dpapiScope = 'CurrentUser'/);
  assert.match(secrets, /hmacKeyId = \$expectedKeyId/);
  assert.match(secrets, /rr-mcp-eap-v1-2026-09/);
  assert.match(secrets, /Set-Acl -LiteralPath \$configDirectory/);
  assert.match(secrets, /\$TaskUserSid, \[Security\.AccessControl\.FileSystemRights\]::ReadAndExecute/);
  assert.match(secrets,
    /temporaryConfigAcl = 'none; elevated process writes through Administrators FullControl'/);
  assert.match(secrets,
    /finalConfigAcl = 'SYSTEM\/Administrators FullControl; taskUser ReadAndExecute'/);
  assert.match(secrets, /TaskUser must be the current provisioning user for DPAPI CurrentUser/);
  const firstHardening = secrets.indexOf(
    "Set-FinalConfigAcl -TaskUserSid $taskUserSid -SecretPaths $secretPaths");
  const secretPrompt = secrets.indexOf("$password = Read-Host");
  const finalHardening = secrets.lastIndexOf(
    "Set-FinalConfigAcl -TaskUserSid $taskUserSid -SecretPaths $secretPaths");
  assert.ok(firstHardening > 0 && firstHardening < secretPrompt);
  assert.ok(finalHardening > secretPrompt);
  assert.match(secrets, /finally \{[\s\S]*Set-FinalConfigAcl -TaskUserSid \$taskUserSid/);
  assert.match(secrets, /\[Text\.UTF8Encoding\]::new\(\$false\)/);
  assert.match(secrets, /\[IO\.File\]::Replace/);
  assert.match(secrets, /\[IO\.File\]::Move/);
  assert.doesNotMatch(secrets, /RandomNumberGenerator|Get-Random/);
  assert.doesNotMatch(secrets, /Write-Host[^\n]*(?:password|hmacPlain|hmacBytes)/i);
  assert.doesNotMatch(secrets, /Write-(?:Host|Output)[^\n]*passwordClipboard/i);
});

test("secret provisioning validates the database before constructing or publishing writes", () => {
  const passwordCapture = secrets.indexOf("$passwordClipboard = Get-Clipboard -Raw");
  const hmacCapture = secrets.indexOf("$hmacClipboard = Get-Clipboard -Raw");
  const dbValidation = secrets.indexOf("Invoke-BuilderDatabaseConnectionValidation -Password");
  const writesBuilt = secrets.indexOf("$writes = @(");
  const bundlePublish = secrets.lastIndexOf(
    "Publish-ConfigBundle -Writes $writes -TaskUserSid $taskUserSid");
  assert.ok(passwordCapture > 0 && hmacCapture > passwordCapture);
  assert.ok(dbValidation > hmacCapture && writesBuilt > dbValidation);
  assert.ok(bundlePublish > writesBuilt);
  assert.match(secrets, /databaseConnectionValidated = \$true/);
  assert.match(secrets, /containsSecrets = \$false/);
});

test("PowerShell 5.1 preserves exact builder-password DPAPI roundtrips", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const secretsPath = join(scriptDirectory, "related-review-provision-secrets.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${secretsPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Secret script parse failure' }
foreach ($name in @('ConvertTo-ValidatedBuilderPasswordSecureString',
  'ConvertFrom-SecureStringExact')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('rr-password-roundtrip-' +
  [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$path = Join-Path $root 'builder-password.dpapi'
$original = '  P@ss w0rd!#$%&()*+,-./:;<=>?@[\\]^_{|}~  '
$secure = $null
$restored = $null
try {
  $secure = ConvertTo-ValidatedBuilderPasswordSecureString -Value $original
  [IO.File]::WriteAllText($path, ($secure | ConvertFrom-SecureString),
    [Text.UTF8Encoding]::new($false))
  $ciphertext = Get-Content -LiteralPath $path -Raw
  $roundTrip = $ciphertext | ConvertTo-SecureString
  $restored = ConvertFrom-SecureStringExact -Value $roundTrip
  if (-not [string]::Equals($original, $restored,
    [StringComparison]::Ordinal)) { throw 'Password DPAPI roundtrip diverged' }
  $roundTrip.Dispose()
  $emptyRejected = $false
  try { [void](ConvertTo-ValidatedBuilderPasswordSecureString -Value '') }
  catch { $emptyRejected = $true }
  if (-not $emptyRejected) { throw 'Empty password accepted' }
} finally {
  if ($secure) { $secure.Dispose() }
  $original = $null
  $restored = $null
  if (Test-Path -LiteralPath $root) { [IO.Directory]::Delete($root, $true) }
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /P@ss|password DPAPI/i);
});

test("invalid password HMAC or database validation publishes zero secret files", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const secretsPath = join(scriptDirectory, "related-review-provision-secrets.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${secretsPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Secret script parse failure' }
foreach ($name in @('ConvertTo-ValidatedBuilderPasswordSecureString',
  'ConvertTo-ValidatedHmacSecureString', 'Invoke-BuilderDatabaseConnectionValidation')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('rr-secret-prepublish-' +
  [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$script:repoRoot = $root
$bundlePaths = @('builder-password.dpapi', 'hmac-v1.dpapi', 'settings.json') |
  ForEach-Object { Join-Path $root $_ }
$validHmac = [Convert]::ToBase64String((New-Object byte[] 32))
$settings = [pscustomobject]@{
  databaseUser = 'customer_related_review_builder_login.gyejtqetzumphtatifkl'
  databaseHost = 'example.invalid'
  databasePort = 5432
  databaseName = 'postgres'
  caPath = (Join-Path $root 'fixture-ca.crt')
}
$probe = Join-Path $root 'probe.mjs'
[IO.File]::WriteAllText($probe,
  'console.error(JSON.stringify({ok:false,mode:"database-connection-check",code:"db_auth_failed",dbCode:"28P01",containsSecrets:false}));process.exitCode=1;',
  [Text.UTF8Encoding]::new($false))
try {
  $rejected = $false
  try { [void](ConvertTo-ValidatedBuilderPasswordSecureString -Value '') }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'Empty password accepted' }

  $password = ConvertTo-ValidatedBuilderPasswordSecureString -Value 'synthetic-valid-password'
  $rejected = $false
  try { [void](ConvertTo-ValidatedHmacSecureString -Value 'not-base64') }
  catch { $rejected = $true }
  if (-not $rejected) { throw 'Invalid HMAC accepted' }

  $hmac = ConvertTo-ValidatedHmacSecureString -Value $validHmac
  $rejected = $false
  try {
    [void](Invoke-BuilderDatabaseConnectionValidation -Password 'synthetic-valid-password' -Settings $settings -NodeExecutable (Get-Command node.exe).Source -ProbeScript $probe)
  } catch {
    $rejected = $_.Exception.Message -eq 'Builder database validation failed: db_auth_failed'
  }
  if (-not $rejected) { throw 'Database validation failure was not fail-closed' }
  if (@($bundlePaths | Where-Object { Test-Path -LiteralPath $_ }).Count -ne 0) {
    throw 'A secret bundle file was published before validation completed'
  }
  $password.Dispose()
  $hmac.Dispose()
} finally {
  $validHmac = $null
  if (Test-Path -LiteralPath $root) { [IO.Directory]::Delete($root, $true) }
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`,
    /synthetic-valid-password|not-base64|postgresql:/i);
});

test("clipboard HMAC is fully validated before any DPAPI file publication", () => {
  const passwordValidation = secrets.indexOf("if ($password.Length -eq 0)");
  const clipboardRead = secrets.indexOf("$hmacClipboard = Get-Clipboard -Raw");
  const hmacValidation = secrets.indexOf(
    "$hmac = ConvertTo-ValidatedHmacSecureString -Value $hmacClipboard");
  const writesBuilt = secrets.indexOf("$writes = @(");
  const bundlePublish = secrets.lastIndexOf(
    "Publish-ConfigBundle -Writes $writes -TaskUserSid $taskUserSid");
  assert.ok(passwordValidation > 0 && clipboardRead > passwordValidation);
  assert.ok(hmacValidation > clipboardRead && writesBuilt > hmacValidation);
  assert.ok(bundlePublish > writesBuilt);
  assert.match(secrets, /FromBase64String\(\$normalized\)/);
  assert.match(secrets, /\$decodedBytes\.Length -lt 32/);
  assert.match(secrets, /ToBase64String\(\$decodedBytes\) -ne \$normalized/);
  assert.match(secrets, /finally \{[\s\S]*\[Array\]::Clear\(\$decodedBytes/);
  assert.match(secrets, /\$hmacClipboard = \$null/);
  assert.doesNotMatch(secrets, /Write-(?:Host|Output)[^\n]*hmacClipboard/i);
});

test("PowerShell 5.1 publishes and rolls back the three-file secret bundle", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const secretsPath = join(scriptDirectory, "related-review-provision-secrets.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${secretsPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Secret script parse failure' }
foreach ($name in @('New-RestrictedConfigFileAcl', 'Publish-ConfigBundle')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('rr-secret-bundle-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$expectedAcl = New-RestrictedConfigFileAcl -TaskUserSid $sid
$expectedTaskRules = @($expectedAcl.GetAccessRules($true, $false,
  [Security.Principal.SecurityIdentifier]) | Where-Object {
    $_.IdentityReference.Value -eq $sid.Value -and
    $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow
  })
if ($expectedTaskRules.Count -ne 1 -or
  ($expectedTaskRules[0].FileSystemRights -band
    [Security.AccessControl.FileSystemRights]::Write) -ne 0) {
  throw 'Production task-user file ACL is writable'
}
$script:aclApplications = 0
function Set-RestrictedConfigFileAcl {
  param([string]$Path, [Security.Principal.SecurityIdentifier]$TaskUserSid)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or $null -eq $TaskUserSid) {
    throw 'ACL fixture received invalid input'
  }
  $script:aclApplications++
}
$paths = @('builder-password.dpapi', 'hmac-v1.dpapi', 'settings.json') |
  ForEach-Object { Join-Path $root $_ }
function New-Writes([string]$prefix) {
  return @(
    @{ Path = $paths[0]; Content = "$prefix-password-ciphertext" },
    @{ Path = $paths[1]; Content = "$prefix-hmac-ciphertext" },
    @{ Path = $paths[2]; Content = ('{"version":"' + $prefix + '"}') }
  )
}
function Assert-Contents([string]$prefix) {
  $expected = @("$prefix-password-ciphertext", "$prefix-hmac-ciphertext",
    ('{"version":"' + $prefix + '"}'))
  for ($index = 0; $index -lt $paths.Count; $index++) {
    if ([IO.File]::ReadAllText($paths[$index]) -ne $expected[$index]) {
      throw 'Secret bundle content mismatch'
    }
  }
}
function Assert-NoArtifacts {
  if (@(Get-ChildItem -LiteralPath $root -File | Where-Object {
    $_.Name -match '\.(?:tmp|bak|rollback)$'
  }).Count -ne 0) { throw 'Temporary publication artifact remained' }
}
try {
  Publish-ConfigBundle -Writes (New-Writes 'first') -TaskUserSid $sid
  Assert-Contents 'first'
  Assert-NoArtifacts
  Publish-ConfigBundle -Writes (New-Writes 'second') -TaskUserSid $sid
  Assert-Contents 'second'
  Assert-NoArtifacts
  if ($script:aclApplications -ne 6) { throw 'Final file ACL was not re-applied' }

  $locked = [IO.File]::Open($paths[1], [IO.FileMode]::Open,
    [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $failed = $false
  try {
    Publish-ConfigBundle -Writes (New-Writes 'third') -TaskUserSid $sid
  } catch {
    $failed = $true
    if ($_.Exception.Message -match 'third-|ciphertext') {
      throw 'Publication error exposed synthetic plaintext'
    }
  } finally {
    $locked.Dispose()
  }
  if (-not $failed) { throw 'Locked bundle publication unexpectedly succeeded' }
  if ($script:aclApplications -ne 6) { throw 'Failed publication reached ACL phase' }
  Assert-Contents 'second'
  Assert-NoArtifacts
} finally {
  [IO.Directory]::Delete($root, $true)
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /path is not of a legal form/i);
});

test("PowerShell 5.1 HMAC validator accepts 32 bytes and rejects invalid clipboard values", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const secretsPath = join(scriptDirectory, "related-review-provision-secrets.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${secretsPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Secret script parse failure' }
$validator = $ast.Find({
  param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'ConvertTo-ValidatedHmacSecureString'
}, $true)
if ($null -eq $validator) { throw 'HMAC validator not found' }
Invoke-Expression $validator.Extent.Text
$validBytes = New-Object byte[] 32
for ($index = 0; $index -lt $validBytes.Length; $index++) {
  $validBytes[$index] = [byte]$index
}
$valid = [Convert]::ToBase64String($validBytes)
if ($valid.Length -ne 44) { throw 'Synthetic valid HMAC is not 44 characters' }
$secure = ConvertTo-ValidatedHmacSecureString -Value $valid
if ($null -eq $secure -or $secure.Length -ne 44) { throw 'Valid HMAC rejected' }
$secure.Dispose()
$shortBytes = New-Object byte[] 31
$invalidValues = @($valid + 'extra', '', [Convert]::ToBase64String($shortBytes))
foreach ($candidate in $invalidValues) {
  $rejected = $false
  try {
    $unexpected = ConvertTo-ValidatedHmacSecureString -Value $candidate
    if ($unexpected) { $unexpected.Dispose() }
  } catch {
    $rejected = $true
  }
  if (-not $rejected) { throw 'Invalid HMAC accepted' }
}
[Array]::Clear($validBytes, 0, $validBytes.Length)
[Array]::Clear($shortBytes, 0, $shortBytes.Length)
$valid = $null
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("wrapper constructs the fixed TLS URL in memory and passes secrets only by child env", () => {
  assert.match(wrapper, /^#requires -Version 5\.1/m);
  assert.match(wrapper, /C:\\Program Files\\nodejs\\node\.exe/);
  assert.match(wrapper, /Get-Command node\.exe -CommandType Application/);
  assert.match(wrapper, /\$repoRoot = Split-Path -Parent \$PSScriptRoot/);
  assert.match(wrapper, /customer_related_review_builder_login\.gyejtqetzumphtatifkl/);
  assert.match(wrapper, /aws-1-us-east-1\.pooler\.supabase\.com/);
  assert.match(wrapper, /sslmode=verify-full&sslrootcert=/);
  assert.match(wrapper, /EnvironmentVariables\['RELATED_REVIEW_DATABASE_URL'\] = \$databaseUrl/);
  assert.match(wrapper, /EnvironmentVariables\['RELATED_REVIEW_HMAC_KEY'\] = \$hmacPlain/);
  assert.match(wrapper, /EnvironmentVariables\['RELATED_REVIEW_HMAC_KEY_ID'\]/);
  assert.match(wrapper, /\$childScript = if \(\$TestDatabaseConnection\)/);
  assert.match(wrapper, /\$startInfo\.Arguments = if \(\$hasReadyAudit\)/);
  assert.match(wrapper, /'\"' \+ \$childScript \+ '\"'/);
  assert.doesNotMatch(wrapper, /\.ArgumentList\b/);
  assert.doesNotMatch(wrapper, /\.Environment\[/);
  assert.doesNotMatch(wrapper, /Arguments[^\n]*(?:password|hmac|databaseUrl)/i);
  assert.match(wrapper, /ConvertFrom-SafeChildOutput -StandardOutput \$stdout -StandardError \$stderr/);
  assert.match(wrapper, /childExitCode = \$ChildExitCode/);
  assert.match(wrapper, /Invoke-CapturedProcess -StartInfo \$startInfo/);
  assert.match(wrapper, /StandardOutput\.ReadToEndAsync\(\)/);
  assert.match(wrapper, /StandardError\.ReadToEndAsync\(\)/);
  assert.match(wrapper, /\$child\.WaitForExit\(\)/);
  assert.match(wrapper, /\$child\.Close\(\)/);
  assert.match(wrapper, /\$child\.Dispose\(\)/);
  assert.doesNotMatch(wrapper, /BeginOutputReadLine|BeginErrorReadLine|Register-ObjectEvent/);
  assert.doesNotMatch(wrapper,
    /StandardOutput\.ReadToEnd\(\)[\s\S]{0,120}StandardError\.ReadToEnd\(\)/);
});

test("PowerShell 5.1 capture persists output and exits without child processes", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const wrapperPath = join(scriptDirectory, "customer-window-related-review-refresh.ps1")
    .replaceAll("'", "''");
  const nodePath = process.execPath.replaceAll("'", "''");
  for (const expectedExit of [0, 1]) {
    const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${wrapperPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Wrapper parse failure' }
foreach ($name in @('Invoke-CapturedProcess', 'Write-AtomicJson')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('rr-wrapper-exit-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$childPath = Join-Path $root 'synthetic-child.mjs'
$latestPath = Join-Path $root 'latest.json'
$logPath = Join-Path $root 'refresh.ndjson'
$expectedExit = ${expectedExit}
try {
  $childSource = if ($expectedExit -eq 0) {
    'process.stdout.write(JSON.stringify({ok:true,code:"completed"}) + "\\n");'
  } else {
    'process.stderr.write(JSON.stringify({ok:false,code:"synthetic_failure"}) + "\\n"); process.exitCode=1;'
  }
  [IO.File]::WriteAllText($childPath, $childSource, [Text.UTF8Encoding]::new($false))
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = '${nodePath}'
  $info.Arguments = '"' + $childPath + '"'
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $captured = Invoke-CapturedProcess -StartInfo $info
  if ($captured.ExitCode -ne $expectedExit) { throw 'Synthetic child exit mismatch' }
  $payload = if ($expectedExit -eq 0) {
    $captured.StandardOutput.Trim()
  } else {
    $captured.StandardError.Trim()
  }
  $parsed = $payload | ConvertFrom-Json
  [IO.File]::AppendAllText($logPath, $payload + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false))
  Write-AtomicJson -Path $latestPath -Value $parsed
  if (-not (Test-Path -LiteralPath $logPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $latestPath -PathType Leaf)) {
    throw 'Synthetic operational state was not persisted'
  }
  if ($null -ne (Get-Process -Id $captured.ChildId -ErrorAction SilentlyContinue)) {
    throw 'Synthetic child process remained alive'
  }
  [pscustomobject]@{
    ok = $parsed.ok
    childExited = $true
    persisted = $true
  } | ConvertTo-Json -Compress
  exit $expectedExit
} finally {
  if (Test-Path -LiteralPath $root) { [IO.Directory]::Delete($root, $true) }
}
`;
    const environment = { ...process.env };
    delete environment.PSModulePath;
    const result = spawnSync(powershell,
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", env: environment, timeout: 10_000 });
    assert.equal(result.error, undefined, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.status, expectedExit, `${result.stdout}\n${result.stderr}`);
    const summary = JSON.parse(result.stdout.trim());
    assert.equal(summary.ok, expectedExit === 0);
    assert.equal(summary.childExited, true);
    assert.equal(summary.persisted, true);
  }
});

test("wrapper preserves safe nonzero child JSON and rejects raw or mixed output", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const wrapperPath = join(scriptDirectory, "customer-window-related-review-refresh.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${wrapperPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Wrapper parse failure' }
foreach ($name in @('Throw-Code', 'Test-CountValue', 'Get-OptionalProperty',
  'Add-SafeAuditWaitFields', 'ConvertFrom-SafeChildOutput', 'Get-SafeRefreshRecord')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$json = '{"ok":false,"code":"ready_audit_failed","phase":"ready-audit",' +
  '"dbCode":"57014","auditPhaseStarted":"groups_metrics",' +
  '"auditPhaseFinished":"counts","auditPhaseDurationMs":660000,' +
  '"readyAuditAttempts":2,"readyAuditRetried":true,"firstAuditDbCode":"57014",' +
  '"firstAuditPhase":"overlap","retryAuditOk":false,"retryAuditDurationMs":120010,' +
  '"effectiveStatementTimeoutMs":300000,"effectiveLockTimeoutMs":30000,' +
  '"activated":true,"committed":true,"newSnapshotId":"9f54ef84-f9d5-4e09-9f68-be34f55d9e9f",' +
  '"retentionAttempted":true,"retentionDeleted":1,"retentionRemaining":6,' +
  '"retentionDurationMs":4321,' +
  '"retentionLastDeletedSnapshotId":"70000000-0000-4000-8000-000000000001",' +
  '"retentionErrorCode":"55P03"}'
$parsed = ConvertFrom-SafeChildOutput -StandardOutput '' -StandardError $json
$record = Get-SafeRefreshRecord -Result $parsed -Started ([DateTimeOffset]::UtcNow) -Finished ([DateTimeOffset]::UtcNow) -ChildExitCode 1 -DurationMs 25
if ($record.code -ne 'ready_audit_failed' -or $record.phase -ne 'ready-audit' -or
  $record.dbCode -ne '57014' -or $record.auditPhaseStarted -ne 'groups_metrics' -or
  $record.auditPhaseFinished -ne 'counts' -or $record.auditPhaseDurationMs -ne 660000 -or
  $record.readyAuditAttempts -ne 2 -or -not $record.readyAuditRetried -or
  $record.firstAuditDbCode -ne '57014' -or $record.firstAuditPhase -ne 'overlap' -or
  $record.retryAuditOk -ne $false -or $record.retryAuditDurationMs -ne 120010 -or
  $record.effectiveStatementTimeoutMs -ne 300000 -or
  $record.effectiveLockTimeoutMs -ne 30000 -or
  -not $record.retentionAttempted -or $record.retentionDeleted -ne 1 -or
  $record.retentionRemaining -ne 6 -or $record.retentionDurationMs -ne 4321 -or
  $record.retentionLastDeletedSnapshotId -ne '70000000-0000-4000-8000-000000000001' -or
  $record.retentionErrorCode -ne '55P03' -or
  $record.childExitCode -ne 1 -or $record.durationMs -ne 25) {
  throw 'Safe child error was not preserved'
}
foreach ($case in @(
  @{ Out = 'not-json'; Err = '' },
  @{ Out = ''; Err = 'postgresql://user:simulated-secret@example.invalid/db' },
  @{ Out = $json; Err = 'postgresql://user:simulated-secret@example.invalid/db' }
)) {
  $rejected = $false
  try {
    [void](ConvertFrom-SafeChildOutput -StandardOutput $case.Out -StandardError $case.Err)
  } catch {
    $rejected = $_.Exception.Message -eq 'invalid_refresh_output' -and
      $_.Exception.Message -notmatch 'simulated-secret|postgresql:'
  }
  if (-not $rejected) { throw 'Unsafe child output was not rejected safely' }
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("DryRunConfigCheck validates configuration before process execution", () => {
  const dryRunIndex = wrapper.indexOf("if ($DryRunConfigCheck)");
  const processIndex = wrapper.indexOf("$startInfo = [Diagnostics.ProcessStartInfo]::new()");
  assert.ok(dryRunIndex > 0 && processIndex > dryRunIndex);
  for (const marker of ["builderPasswordPresent", "hmacValid", "hmacKeyIdValid",
    "caValid", "repoValid", "nodeValid", "containsSecrets = $false"]) {
    assert.match(wrapper, new RegExp(marker.replace("$", "\\$")));
  }
});

test("TestDatabaseConnection reuses DPAPI configuration without running refresh or writes", () => {
  assert.match(wrapper, /\[switch\]\$TestDatabaseConnection/);
  assert.match(wrapper,
    /customer-window-related-review-database-connection-check\.mjs/);
  assert.match(wrapper, /\$selectedModeCount -gt 1/);
  assert.match(wrapper, /\$childScript = if \(\$TestDatabaseConnection\)/);
  assert.match(wrapper,
    /if \(-not \$TestDatabaseConnection\) \{[\s\S]*RELATED_REVIEW_HMAC_KEY/);
  assert.match(wrapper,
    /if \(\$TestDatabaseConnection\) \{[\s\S]*mode'\) -ne 'database-connection-check'/);
  assert.match(wrapper,
    /if \(-not \$TestDatabaseConnection -and -not \$hasReadyAudit\) \{[\s\S]*Publish-OperationalState/);
});

test("AuditReadySnapshot uses the DPAPI environment without refresh activation or persistence", () => {
  assert.match(wrapper, /\[string\]\$AuditReadySnapshot/);
  assert.match(wrapper,
    /customer-window-related-review-mcp-eap-v1-ready-audit\.mjs/);
  assert.match(wrapper,
    /'\"' \+ \$childScript \+ '\" --snapshot-id \"' \+ \$AuditReadySnapshot \+ '\"'/);
  assert.match(wrapper,
    /\$finalRecord = Get-SafeReadyAuditRecord -Result \$result/);
  assert.match(wrapper,
    /if \(-not \$TestDatabaseConnection -and -not \$hasReadyAudit\)/);
  assert.match(wrapper, /\$selectedModeCount -gt 1/);
});

test("ResumeReadySnapshot routes the certified READY through refresh resume and normal logging", () => {
  assert.match(wrapper,
    /\[ValidatePattern\('\^\[0-9a-fA-F\]\{8\}.*\$'\)\]\s*\[string\]\$ResumeReadySnapshot/s);
  assert.match(wrapper,
    /'\"' \+ \$childScript \+ '\" --resume-ready \"' \+ \$ResumeReadySnapshot \+ '\"'/);
  assert.match(wrapper,
    /\$hasReadyResume = -not \[string\]::IsNullOrWhiteSpace\(\$ResumeReadySnapshot\)/);
  assert.match(wrapper,
    /\[int\]\[bool\]\$hasReadyAudit \+ \[int\]\[bool\]\$hasReadyResume/);
  assert.match(wrapper,
    /elseif \(\$hasReadyResume\)[\s\S]*--resume-ready/);
  assert.match(wrapper,
    /else \{\s*\$finalRecord = Get-SafeRefreshRecord[\s\S]*Publish-OperationalState/);
  assert.match(wrapper,
    /foreach \(\$name in @\('previousSnapshotId', 'newSnapshotId', 'activeSnapshotId'\)\)/);
  assert.match(wrapper, /'activeCount', 'readyCount', 'supersededCount'/);
  assert.doesNotMatch(wrapper,
    /\$hasReadyResume[\s\S]{0,300}customer-window-related-review-mcp-eap-v1-build/);
});

test("PowerShell rejects invalid resume UUIDs and incompatible wrapper modes before configuration", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const wrapperPath = join(scriptDirectory, "customer-window-related-review-refresh.ps1");
  const invalidUuid = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-File",
    wrapperPath, "-ResumeReadySnapshot", "not-a-uuid"], { encoding: "utf8" });
  assert.notEqual(invalidUuid.status, 0);

  const incompatible = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-File",
    wrapperPath, "-DryRunConfigCheck", "-ResumeReadySnapshot",
    "630ec9b3-bed8-4c84-99fa-b947c38831d0"], { encoding: "utf8" });
  assert.notEqual(incompatible.status, 0);
  const record = JSON.parse(incompatible.stdout.trim());
  assert.equal(record.ok, false);
  assert.equal(record.code, "invalid_wrapper_mode");
  assert.equal(record.phase, "wrapper");
  assert.doesNotMatch(incompatible.stdout + incompatible.stderr,
    /postgresql:\/\/|RELATED_REVIEW_HMAC_KEY|password|source_row_id/i);
});

test("PowerShell ready audit output allowlists success and PostgreSQL 57014", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const wrapperPath = join(scriptDirectory, "customer-window-related-review-refresh.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${wrapperPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Wrapper parse failure' }
foreach ($name in @('Throw-Code', 'Test-CountValue', 'Get-OptionalProperty',
  'Add-SafeAuditWaitFields', 'ConvertFrom-SafeReadyAuditOutput',
  'Get-SafeReadyAuditRecord')) {
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $name
  }, $true)
  if ($null -eq $function) { throw "Missing function $name" }
  Invoke-Expression $function.Extent.Text
}
$snapshot = '630ec9b3-bed8-4c84-99fa-b947c38831d0'
$progress = @(
  '{"event":"audit_session_settings","effectiveStatementTimeoutMs":300000,"effectiveLockTimeoutMs":30000}',
  '{"event":"audit_phase","auditPhaseStarted":"contract"}',
  '{"event":"audit_phase","auditPhaseFinished":"contract","auditPhaseDurationMs":123}',
  '{"event":"audit_phase","auditPhaseStarted":"manifest"}',
  '{"event":"audit_phase","auditPhaseFinished":"manifest","auditPhaseDurationMs":456}',
  ('{"event":"audit_wait","snapshotId":"__SNAPSHOT__","auditPhase":"manifest","auditPid":4321,"elapsedMs":20000,"waitEventType":"IO","waitEvent":"DataFileRead","blockingPids":[]}'.Replace('__SNAPSHOT__', $snapshot))
) -join [Environment]::NewLine
$successJson = '{"ok":true,"snapshotId":"' + $snapshot + '","status":"ready",' +
  '"manifestMatch":true,"countsMatch":true,"anomalyCount":0,"containsPii":false}'
try {
  $success = ConvertFrom-SafeReadyAuditOutput -StandardOutput $successJson -StandardError $progress
  $safeSuccess = Get-SafeReadyAuditRecord -Result $success -SnapshotId $snapshot -ChildExitCode 0
} catch { throw ('Ready audit success parse failed: ' + $_.Exception.Message) }
if (-not $safeSuccess.ok -or $safeSuccess.status -ne 'ready' -or
  $safeSuccess.snapshotId -ne $snapshot -or $safeSuccess.containsPii -ne $false) {
  throw 'Ready audit success was not preserved safely'
}
if ($safeSuccess.effectiveStatementTimeoutMs -ne 300000 -or
  $safeSuccess.effectiveLockTimeoutMs -ne 30000) {
  throw 'Ready audit session settings were not preserved safely'
}
if ($safeSuccess.auditPhase -ne 'manifest' -or $safeSuccess.auditPid -ne 4321 -or
  $safeSuccess.waitEventType -ne 'IO' -or $safeSuccess.waitEvent -ne 'DataFileRead' -or
  @($safeSuccess.blockingPids).Count -ne 0) {
  throw 'Ready audit wait event was not preserved safely'
}
$failureJson = '{"ok":false,"code":"ready_audit_failed","phase":"overlap",' +
  '"dbCode":"57014","auditPhaseStarted":"overlap",' +
  '"auditPhaseFinished":"groups_metrics","auditPhaseDurationMs":120129}'
$failureProgress = @(
  '{"event":"audit_phase","auditPhaseStarted":"overlap"}',
  ('{"event":"audit_wait","snapshotId":"__SNAPSHOT__","auditPhase":"overlap","auditPid":5432,"elapsedMs":20000,"waitEventType":"Lock","waitEvent":"transactionid","blockingPids":[77]}'.Replace('__SNAPSHOT__', $snapshot))
) -join [Environment]::NewLine
$failureInput = $failureProgress + [Environment]::NewLine + $failureJson
try {
  $failure = ConvertFrom-SafeReadyAuditOutput -StandardOutput '' -StandardError $failureInput
  $safeFailure = Get-SafeReadyAuditRecord -Result $failure -SnapshotId $snapshot -ChildExitCode 1
} catch { throw ('Ready audit failure parse failed: ' + $_.Exception.Message) }
if ($safeFailure.ok -or $safeFailure.code -ne 'ready_audit_failed' -or
  $safeFailure.phase -ne 'overlap' -or $safeFailure.dbCode -ne '57014' -or
  $safeFailure.auditPhaseStarted -ne 'overlap' -or
  $safeFailure.auditPhaseFinished -ne 'groups_metrics' -or
  $safeFailure.auditPhaseDurationMs -ne 120129 -or
  $safeFailure.auditPhase -ne 'overlap' -or $safeFailure.auditPid -ne 5432 -or
  $safeFailure.elapsedMs -ne 20000 -or $safeFailure.waitEventType -ne 'Lock' -or
  $safeFailure.waitEvent -ne 'transactionid' -or
  @($safeFailure.blockingPids).Count -ne 1 -or $safeFailure.blockingPids[0] -ne 77 -or
  $safeFailure.containsPii -ne $false) { throw 'Ready audit 57014 was not preserved safely' }
foreach ($invalid in @(
  [pscustomobject]@{ Out = ''; Err = $progress },
  [pscustomobject]@{ Out = ('noise' + [Environment]::NewLine + $successJson); Err = $progress },
  [pscustomobject]@{ Out = ($successJson + [Environment]::NewLine + 'noise'); Err = $progress },
  [pscustomobject]@{ Out = $successJson; Err = ($progress + [Environment]::NewLine +
    'simulated-secret') }
)) {
  $rejected = $false
  try {
    [void](ConvertFrom-SafeReadyAuditOutput -StandardOutput $invalid.Out -StandardError $invalid.Err)
  } catch {
    $rejected = $_.Exception.Message -eq 'invalid_refresh_output' -and
      $_.Exception.Message -notmatch 'simulated-secret'
  }
  if (-not $rejected) { throw 'Unsafe ready audit stream was not rejected' }
}
$serialized = @($safeSuccess, $safeFailure) | ConvertTo-Json -Compress
if ($serialized -match 'password|postgresql:|source_row|stack|select ') {
  throw 'Ready audit output exposed unsafe data'
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("logging and latest state use an allowlist and atomic replacement", () => {
  for (const field of ["startedAt", "finishedAt", "previousSnapshotId", "newSnapshotId",
    "stableMissingBookings", "hotValidBookings", "stabilityWindowMinutes", "timings",
    "readyAuditAttempts", "readyAuditRetried", "firstAuditDbCode", "firstAuditPhase",
    "retryAuditOk", "retryAuditDurationMs", "postcheckPhaseStarted",
    "postcheckPhaseFinished", "postcheckPhaseDurationMs", "lifecyclePostcheckMs",
    "stableCoveragePostcheckMs", "lastPostcheckPhaseStarted",
    "lastPostcheckPhaseFinished", "lastPostcheckPhaseDurationMs", "retentionAttempted",
    "retentionDeleted", "retentionRemaining", "retentionDurationMs",
    "retentionLastDeletedSnapshotId", "retentionErrorCode", "retentionMs"]) {
    assert.match(wrapper, new RegExp(field));
  }
  assert.match(wrapper, /refresh-\{0\}\.ndjson/);
  assert.match(wrapper, /Join-Path \$stateDirectory 'latest\.json'/);
  assert.match(wrapper, /Write-AtomicJson/);
  assert.match(wrapper, /\[IO\.File\]::Replace/);
  assert.match(wrapper, /\[IO\.File\]::Move/);
  assert.match(wrapper, /\[Text\.UTF8Encoding\]::new\(\$false\)/);
  for (const field of ["lastDiagnosticCode", "lastDbCode", "lastChildExitCode"]) {
    assert.match(wrapper, new RegExp(field));
  }
  assert.doesNotMatch(wrapper, /WriteAllText\([^\n]*(?:passwordPlain|hmacPlain|databaseUrl)/i);
});

test("PowerShell 5.1 atomically overwrites latest.json with a valid backup path", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const wrapperPath = join(scriptDirectory, "customer-window-related-review-refresh.ps1")
    .replaceAll("'", "''");
  const command = `
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  '${wrapperPath}', [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Wrapper parse failure' }
$function = $ast.Find({
  param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Write-AtomicJson'
}, $true)
Invoke-Expression $function.Extent.Text
$root = Join-Path ([IO.Path]::GetTempPath()) ('rr-latest-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$path = Join-Path $root 'latest.json'
try {
  Write-AtomicJson -Path $path -Value ([pscustomobject]@{ version = 1 })
  Write-AtomicJson -Path $path -Value ([pscustomobject]@{ version = 2 })
  $parsed = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($parsed.version -ne 2) { throw 'latest.json overwrite mismatch' }
  if (@(Get-ChildItem -LiteralPath $root -File | Where-Object {
    $_.Name -match '\.(?:tmp|bak)$'
  }).Count -ne 0) { throw 'latest.json publication artifact remained' }
} finally {
  [IO.Directory]::Delete($root, $true)
}
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /path is not of a legal form/i);
});

test("scripts create no scheduler and contain no embedded production secret", () => {
  assert.doesNotMatch(all, /\bpwsh(?:\.exe)?\b/i);
  assert.doesNotMatch(all, /#requires -Version (?:6|7)(?:\.|\b)/i);
  assert.doesNotMatch(all, /Register-ScheduledTask|New-ScheduledTask|schtasks(?:\.exe)?/i);
  assert.doesNotMatch(all, /SUPABASE_SERVICE_ROLE_KEY|postgresql:\/\/[^$\s]+:[^$\s]+@/i);
  assert.doesNotMatch(all, /RELATED_REVIEW_HMAC_KEY\s*=\s*['\"][A-Za-z0-9+/=]{16,}/);
  assert.doesNotMatch(all, /\[IO\.File\]::Replace\([^\n]*,\s*\$null\s*\)/);
});

test("Windows PowerShell 5.1 parses scripts and exposes required security APIs", {
  skip: process.platform !== "win32",
}, () => {
  const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32",
    "WindowsPowerShell", "v1.0", "powershell.exe");
  const paths = [
    "related-review-provision-operational.ps1",
    "related-review-provision-secrets.ps1",
    "customer-window-related-review-refresh.ps1",
  ].map((name) => join(scriptDirectory, name).replaceAll("'", "''"));
  const command = `
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
  throw 'Expected Windows PowerShell 5.1'
}
foreach ($path in @('${paths.join("','")}')) {
  $tokens = $null
  $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile(
    $path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) { throw "PS5 parser rejected $path" }
}
$processInfo = [Diagnostics.ProcessStartInfo]::new()
if ($null -eq $processInfo.EnvironmentVariables) { throw 'EnvironmentVariables missing' }
if ($null -eq [Diagnostics.ProcessStartInfo].GetProperty('Arguments')) {
  throw 'ProcessStartInfo.Arguments missing'
}
$secure = ConvertTo-SecureString 'synthetic-probe' -AsPlainText -Force
$ciphertext = $secure | ConvertFrom-SecureString
$roundTrip = $ciphertext | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($roundTrip)
try {
  if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) -ne 'synthetic-probe') {
    throw 'CurrentUser DPAPI round trip failed'
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  $secure.Dispose()
  $roundTrip.Dispose()
}
if ($null -eq [Security.AccessControl.FileSecurity]::new()) { throw 'ACL API missing' }
$systemSid = [Security.Principal.SecurityIdentifier]'S-1-5-18'
$rule = [Security.AccessControl.FileSystemAccessRule]::new(
  $systemSid,
  [Security.AccessControl.FileSystemRights]::FullControl,
  [Security.AccessControl.AccessControlType]::Allow)
if ($null -eq $rule) { throw 'ACL rule API missing' }
if ([Text.UTF8Encoding]::new($false).GetPreamble().Length -ne 0) {
  throw 'UTF-8 no-BOM encoding unavailable'
}
$json = [ordered]@{ ok = $true; label = 'á' } | ConvertTo-Json -Compress
$parsedJson = $json | ConvertFrom-Json
if (-not $parsedJson.ok -or $parsedJson.label -ne 'á') { throw 'JSON round trip failed' }
if ($null -eq ([IO.File].GetMethods() | Where-Object Name -eq 'Replace' |
  Select-Object -First 1)) { throw 'File.Replace unavailable' }
`;
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync(powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", env: environment });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
