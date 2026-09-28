#requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
  [Parameter(ParameterSetName = 'Run', Mandatory = $true)]
  [ValidateSet('Canary', 'Auto', 'Bootstrap', 'AsOf')][string]$Mode,
  [Parameter(ParameterSetName = 'Run')][Guid[]]$CustomerId,
  [Parameter(ParameterSetName = 'Run')][ValidateRange(1, 500)][int]$Limit = 500,
  [Parameter(ParameterSetName = 'Run')][ValidateRange(1, 400)][int]$MaxIterations = 10,
  [Parameter(ParameterSetName = 'Run')][ValidateRange(1000, 7200000)][int]$MaxRuntimeMs = 1200000,
  [Parameter(ParameterSetName = 'Run')][ValidateRange(0, 60000)][int]$PauseMs = 2000,
  [Parameter(ParameterSetName = 'Run')][switch]$IncludeCounts,
  [Parameter(ParameterSetName = 'Config')][switch]$DryRunConfigCheck,
  [Parameter(ParameterSetName = 'Connection')][switch]$TestDatabaseConnection,
  [string]$NodePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'C:\ProgramData\McParking\Customer360BoletaAnalytics'
$configDirectory = Join-Path $root 'config'
$logDirectory = Join-Path $root 'logs'
$stateDirectory = Join-Path $root 'state'
$passwordPath = Join-Path $configDirectory 'runner-password.dpapi'
$settingsPath = Join-Path $configDirectory 'settings.json'
$latestPath = Join-Path $stateDirectory 'latest.json'
$runnerPath = Join-Path $PSScriptRoot 'customer-window-360-boleta-analytics-v1-runner.mjs'
$expectedDatabaseUser = 'customer_360_boleta_analytics_runner_login.gyejtqetzumphtatifkl'
$expectedDatabaseHost = 'aws-1-us-east-1.pooler.supabase.com'
$databaseUrl = $null
$plainPassword = $null
$securePassword = $null
$process = $null
$startInfo = $null

function Resolve-NodeExecutable {
  param([string]$Requested)
  if (-not [string]::IsNullOrWhiteSpace($Requested)) {
    if (-not (Test-Path -LiteralPath $Requested -PathType Leaf)) { throw 'Node.js executable is unavailable.' }
    return (Resolve-Path -LiteralPath $Requested).ProviderPath
  }
  $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) { return $command.Source }
  $fallback = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  throw 'Node.js executable is unavailable.'
}

function Get-CurrentSid {
  return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}

function ConvertFrom-SecureStringExact {
  param([Security.SecureString]$Value)
  $bstr = [IntPtr]::Zero
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
}

function Write-AtomicJson {
  param([string]$Path, $Value)
  $temporary = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
  $backup = "$Path.$([guid]::NewGuid().ToString('N')).bak"
  try {
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 6 -Compress),
      [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      [IO.File]::Replace($temporary, $Path, $backup)
    } else {
      [IO.File]::Move($temporary, $Path)
    }
  } finally {
    foreach ($candidate in @($temporary, $backup)) {
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { Remove-Item -LiteralPath $candidate -Force }
    }
  }
}

function Select-SafeRecord {
  param($Record)
  $allowed = @(
    'event','runId','ok','code','phase','safeCode','reason','mode','startedAt','finishedAt',
    'durationMs','iteration','iterations','pLimit','processedProfiles','removedProfiles',
    'processedTotal','removedTotal','hasMore','calculationVersion','finalStatus','dbCode',
    'dbConstraint','dbTable','dbColumn','errorType','canaryCustomerCount','childExitCode',
    'databaseConnected','loginValid','capabilityValid','tlsValid','privilegeContractValid','temporaryPrivilegeSource','containsSecrets'
  )
  $safe = [ordered]@{}
  foreach ($name in $allowed) {
    if ($Record.PSObject.Properties.Name -contains $name) { $safe[$name] = $Record.$name }
  }
  return [pscustomobject]$safe
}

function Get-SafeProperty {
  param($Value, [string]$Name)
  if ($null -ne $Value -and $Value.PSObject.Properties.Name -contains $Name) { return $Value.$Name }
  return $null
}

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

function Publish-State {
  param($Result, [object[]]$Events, [datetime]$StartedAt, [datetime]$FinishedAt)
  if (-not (Test-Path -LiteralPath $logDirectory -PathType Container) -or
      -not (Test-Path -LiteralPath $stateDirectory -PathType Container)) {
    throw 'Operational log/state directories are unavailable.'
  }
  $monthlyPath = Join-Path $logDirectory ("customer-360-boleta-analytics-{0}.ndjson" -f $FinishedAt.ToString('yyyy-MM'))
  foreach ($record in $Events) {
    [IO.File]::AppendAllText($monthlyPath,
      ((Select-SafeRecord $record | ConvertTo-Json -Depth 5 -Compress) + [Environment]::NewLine),
      [Text.UTF8Encoding]::new($false))
  }
  $prior = $null
  if (Test-Path -LiteralPath $latestPath -PathType Leaf) {
    try { $prior = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json } catch { $prior = $null }
  }
  $resultOk = Get-SafeProperty $Result 'ok'
  $latest = [ordered]@{
    lastAttemptAt = $FinishedAt.ToString('o')
    lastSuccessAt = if ($resultOk -eq $true) { $FinishedAt.ToString('o') } elseif ($prior) { Get-SafeProperty $prior 'lastSuccessAt' } else { $null }
    mode = Get-SafeProperty $Result 'mode'
    durationMs = [int64]($FinishedAt - $StartedAt).TotalMilliseconds
    iterations = Get-SafeProperty $Result 'iterations'
    processedTotal = Get-SafeProperty $Result 'processedTotal'
    removedTotal = Get-SafeProperty $Result 'removedTotal'
    hasMore = Get-SafeProperty $Result 'hasMore'
    finalStatus = Get-SafeProperty $Result 'finalStatus'
    lastSafeError = if ($resultOk -eq $true) { $null } else { [ordered]@{
      code = Get-SafeProperty $Result 'code'
      phase = Get-SafeProperty $Result 'phase'
      dbCode = Get-SafeProperty $Result 'dbCode'
    } }
  }
  Write-AtomicJson -Path $latestPath -Value $latest
}

function Read-Settings {
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) { throw 'Settings file is unavailable.' }
  $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
  foreach ($field in @('version','dpapiScope','databaseHost','databasePort','databaseName','databaseUser','caPath','caSha256','configUserSid')) {
    if (-not ($settings.PSObject.Properties.Name -contains $field) -or [string]::IsNullOrWhiteSpace([string]$settings.$field)) {
      throw 'Settings contract is invalid.'
    }
  }
  if ([int]$settings.version -ne 1 -or $settings.dpapiScope -ne 'CurrentUser' -or
      $settings.databaseUser -ne $expectedDatabaseUser -or
      $settings.databaseHost -ne $expectedDatabaseHost -or
      [int]$settings.databasePort -ne 5432 -or $settings.databaseName -ne 'postgres' -or
      $settings.configUserSid -ne (Get-CurrentSid)) {
    throw 'Settings identity contract is invalid.'
  }
  if (-not (Test-Path -LiteralPath $settings.caPath -PathType Leaf) -or
      (Get-FileHash -LiteralPath $settings.caPath -Algorithm SHA256).Hash -ne $settings.caSha256) {
    throw 'CA contract is invalid.'
  }
  return $settings
}

function Invoke-RunnerChild {
  param([string]$NodeExecutable, [string[]]$Arguments, [string]$ConnectionUrl)
  $quoted = @($runnerPath) + $Arguments | ForEach-Object { '"' + ([string]$_).Replace('"','\"') + '"' }
  $script:startInfo = [Diagnostics.ProcessStartInfo]::new()
  $script:startInfo.FileName = $NodeExecutable
  $script:startInfo.WorkingDirectory = Split-Path -Parent $PSScriptRoot
  $script:startInfo.UseShellExecute = $false
  $script:startInfo.CreateNoWindow = $true
  $script:startInfo.RedirectStandardOutput = $true
  $script:startInfo.RedirectStandardError = $true
  $script:startInfo.Arguments = $quoted -join ' '
  $script:startInfo.EnvironmentVariables['BOLETA_ANALYTICS_DATABASE_URL'] = $ConnectionUrl
  $script:process = [Diagnostics.Process]::new()
  $script:process.StartInfo = $script:startInfo
  [void]$script:process.Start()
  $stdoutTask = $script:process.StandardOutput.ReadToEndAsync()
  $stderrTask = $script:process.StandardError.ReadToEndAsync()
  $script:process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
  $stderr = $stderrTask.GetAwaiter().GetResult().Trim()
  $lines = @($stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($lines.Count -ne 1) { throw 'Runner returned invalid structured output.' }
  try { $result = $lines[0] | ConvertFrom-Json } catch { throw 'Runner returned invalid structured output.' }
  $events = @()
  foreach ($line in @($stderr -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
    try { $events += Select-SafeRecord ($line | ConvertFrom-Json) } catch { }
  }
  $result | Add-Member -NotePropertyName childExitCode -NotePropertyValue $script:process.ExitCode -Force
  return [pscustomobject]@{ Result = Select-SafeRecord $result; Events = $events }
}

$startedAt = Get-Date
try {
  if ($PSCmdlet.ParameterSetName -eq 'Run') {
    if ($Mode -eq 'Canary' -and (!$CustomerId -or $CustomerId.Count -lt 1)) { throw 'Canary requires explicit customer UUIDs.' }
    if ($Mode -ne 'Canary' -and $CustomerId -and $CustomerId.Count -gt 0) { throw 'Customer UUIDs are only valid in Canary mode.' }
    if ($Mode -ne 'AsOf' -and $MaxIterations -gt 100) { throw 'Only AsOf may use more than 100 iterations.' }
    if ($Mode -eq 'AsOf' -and $MaxRuntimeMs -gt 1200000) { throw 'AsOf runtime cannot exceed 20 minutes.' }
  }
  $node = Resolve-NodeExecutable -Requested $NodePath
  $settings = Read-Settings
  if ($DryRunConfigCheck) {
    [pscustomobject]@{ ok = $true; mode = 'dry-run-config-check'; dpapiScope = 'CurrentUser';
      configUserMatches = $true; caValid = $true; repoValid = (Test-Path -LiteralPath $runnerPath -PathType Leaf);
      nodeValid = $true; containsSecrets = $false } | ConvertTo-Json -Compress
    exit 0
  }
  if (-not (Test-Path -LiteralPath $passwordPath -PathType Leaf)) { throw 'Encrypted runner password is unavailable.' }
  $securePassword = Get-Content -LiteralPath $passwordPath -Raw | ConvertTo-SecureString
  $plainPassword = ConvertFrom-SecureStringExact -Value $securePassword
  if ([string]::IsNullOrWhiteSpace($plainPassword)) { throw 'Encrypted runner password is invalid.' }
  $encodedUser = [Uri]::EscapeDataString([string]$settings.databaseUser)
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $encodedCa = [Uri]::EscapeDataString([string]$settings.caPath)
  $databaseUrl = "postgresql://${encodedUser}:${encodedPassword}@$($settings.databaseHost):$($settings.databasePort)/$($settings.databaseName)?sslmode=verify-full&sslrootcert=${encodedCa}"
  $arguments = @()
  if ($TestDatabaseConnection) { $arguments += '--check-connection' }
  else {
    $arguments += @('--mode', (Resolve-CliMode -RequestedMode $Mode), '--limit', [string]$Limit,
      '--max-iterations', [string]$MaxIterations, '--max-runtime-ms', [string]$MaxRuntimeMs,
      '--pause-ms', [string]$PauseMs)
    if ($null -ne $CustomerId -and $CustomerId.Count -gt 0) {
      foreach ($id in $CustomerId) { $arguments += @('--customer-id', $id.ToString()) }
    }
    if ($IncludeCounts) { $arguments += '--include-counts' }
  }
  $child = Invoke-RunnerChild -NodeExecutable $node -Arguments $arguments -ConnectionUrl $databaseUrl
  $finishedAt = Get-Date
  if (-not $TestDatabaseConnection) {
    $allEvents = @($child.Events) + @((Select-SafeRecord ([pscustomobject]@{
      event = 'wrapper_finished'; mode = Get-SafeProperty $child.Result 'mode';
      ok = Get-SafeProperty $child.Result 'ok';
      finalStatus = Get-SafeProperty $child.Result 'finalStatus';
      childExitCode = Get-SafeProperty $child.Result 'childExitCode';
      finishedAt = $finishedAt.ToString('o')
    })))
    Publish-State -Result $child.Result -Events $allEvents -StartedAt $startedAt -FinishedAt $finishedAt
  }
  $child.Result | ConvertTo-Json -Depth 5 -Compress
  if ((Get-SafeProperty $child.Result 'ok') -ne $true -or
      (Get-SafeProperty $child.Result 'childExitCode') -ne 0) { exit 1 }
  exit 0
} catch {
  $safe = [pscustomobject]@{ ok = $false; code = 'wrapper_failed'; phase = 'wrapper';
    errorType = $_.Exception.GetType().Name; containsSecrets = $false }
  $safe | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($startInfo) { [void]$startInfo.EnvironmentVariables.Remove('BOLETA_ANALYTICS_DATABASE_URL') }
  if ($process) { $process.Dispose() }
  $databaseUrl = $null
  $plainPassword = $null
  $securePassword = $null
  $startInfo = $null
  $process = $null
}
