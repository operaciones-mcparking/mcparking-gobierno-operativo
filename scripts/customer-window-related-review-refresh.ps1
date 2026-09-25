#requires -Version 5.1
[CmdletBinding()]
param(
  [switch]$DryRunConfigCheck,
  [switch]$TestDatabaseConnection,
  [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')]
  [string]$AuditReadySnapshot,
  [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')]
  [string]$ResumeReadySnapshot,
  [string]$NodePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$operationalRoot = 'C:\ProgramData\McParking\RelatedReview'
$configDirectory = Join-Path $operationalRoot 'config'
$logDirectory = Join-Path $operationalRoot 'logs'
$stateDirectory = Join-Path $operationalRoot 'state'
$settingsPath = Join-Path $configDirectory 'settings.json'
$passwordPath = Join-Path $configDirectory 'builder-password.dpapi'
$hmacPath = Join-Path $configDirectory 'hmac-v1.dpapi'
$latestPath = Join-Path $stateDirectory 'latest.json'
$repoRoot = Split-Path -Parent $PSScriptRoot
$refreshScript = Join-Path $PSScriptRoot 'customer-window-related-review-mcp-eap-v1-refresh.mjs'
$databaseConnectionCheckScript = Join-Path $PSScriptRoot `
  'customer-window-related-review-database-connection-check.mjs'
$readyAuditScript = Join-Path $PSScriptRoot `
  'customer-window-related-review-mcp-eap-v1-ready-audit.mjs'
$expected = [ordered]@{
  databaseUser = 'customer_related_review_builder_login.gyejtqetzumphtatifkl'
  databaseHost = 'aws-1-us-east-1.pooler.supabase.com'
  databasePort = 5432
  databaseName = 'postgres'
  sslMode = 'verify-full'
  caPath = 'C:\ProgramData\McParking\RelatedReview\certs\supabase-ca.crt'
  hmacKeyId = 'rr-mcp-eap-v1-2026-09'
}
$startedAt = [DateTimeOffset]::UtcNow
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$passwordSecure = $null
$hmacSecure = $null
$passwordBstr = [IntPtr]::Zero
$hmacBstr = [IntPtr]::Zero
$hmacBytes = $null
$passwordPlain = $null
$hmacPlain = $null
$databaseUrl = $null
$startInfo = $null
$captured = $null
$stdout = $null
$stderr = $null
$raw = $null
$result = $null
$childExitCode = $null

function Throw-Code {
  param([string]$Code)
  throw [InvalidOperationException]::new($Code)
}

function Resolve-NodeExecutable {
  param([string]$RequestedPath)
  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    if (-not (Test-Path -LiteralPath $RequestedPath -PathType Leaf)) {
      Throw-Code 'node_missing'
    }
    return (Resolve-Path -LiteralPath $RequestedPath).ProviderPath
  }

  $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $nodeCommand -and
    -not [string]::IsNullOrWhiteSpace($nodeCommand.Source) -and
    (Test-Path -LiteralPath $nodeCommand.Source -PathType Leaf)) {
    return $nodeCommand.Source
  }

  $fallback = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  Throw-Code 'node_missing'
}

function Assert-File {
  param([string]$Path, [string]$Code)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Throw-Code $Code }
}

function Test-CountValue {
  param($Value)
  return ($Value -is [string] -and $Value -match '^(0|[1-9][0-9]*)$') -or
    ($Value -is [int] -and $Value -ge 0) -or ($Value -is [long] -and $Value -ge 0)
}

function Get-OptionalProperty {
  param($Object, [string]$Name)
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Add-SafeAuditWaitFields {
  param($Source, [System.Collections.IDictionary]$Target)
  $phase = Get-OptionalProperty -Object $Source -Name 'auditPhase'
  if ($null -ne $phase) {
    if ($phase -isnot [string] -or
      $phase -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$') {
      Throw-Code 'invalid_refresh_output'
    }
    $Target.auditPhase = $phase
  }
  $auditPid = Get-OptionalProperty -Object $Source -Name 'auditPid'
  if ($null -ne $auditPid) {
    if (($auditPid -isnot [int] -and $auditPid -isnot [long]) -or $auditPid -le 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $Target.auditPid = $auditPid
  }
  $elapsedMs = Get-OptionalProperty -Object $Source -Name 'elapsedMs'
  if ($null -ne $elapsedMs) {
    if (($elapsedMs -isnot [int] -and $elapsedMs -isnot [long] -and
      $elapsedMs -isnot [double]) -or $elapsedMs -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $Target.elapsedMs = $elapsedMs
  }
  foreach ($name in @('waitEventType', 'waitEvent')) {
    $value = Get-OptionalProperty -Object $Source -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or $value -notmatch '^[A-Za-z0-9_ -]{1,80}$') {
        Throw-Code 'invalid_refresh_output'
      }
      $Target[$name] = $value
    }
  }
  $blockerProperty = if ($null -eq $Source) { $null } else {
    $Source.PSObject.Properties['blockingPids']
  }
  if ($null -ne $blockerProperty) {
    $blockers = if ($null -eq $blockerProperty.Value) { @() } else {
      @($blockerProperty.Value)
    }
    foreach ($blocker in $blockers) {
      if (($blocker -isnot [int] -and $blocker -isnot [long]) -or $blocker -le 0) {
        Throw-Code 'invalid_refresh_output'
      }
    }
    $Target.blockingPids = @($blockers)
  }
}

function ConvertFrom-SafeChildOutput {
  param([string]$StandardOutput, [string]$StandardError)
  $safeStdout = if ($null -eq $StandardOutput) { '' } else { $StandardOutput.Trim() }
  $safeStderr = if ($null -eq $StandardError) { '' } else { $StandardError.Trim() }
  if ([string]::IsNullOrWhiteSpace($safeStdout) -eq
    [string]::IsNullOrWhiteSpace($safeStderr)) {
    Throw-Code 'invalid_refresh_output'
  }
  $candidate = if (-not [string]::IsNullOrWhiteSpace($safeStdout)) {
    $safeStdout
  } else {
    $safeStderr
  }
  try { return $candidate | ConvertFrom-Json }
  catch { Throw-Code 'invalid_refresh_output' }
}

function Invoke-CapturedProcess {
  param([Diagnostics.ProcessStartInfo]$StartInfo)
  $child = [Diagnostics.Process]::new()
  $child.StartInfo = $StartInfo
  $stdoutTask = $null
  $stderrTask = $null
  try {
    [void]$child.Start()
    $childId = $child.Id
    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()
    $child.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    return [pscustomobject]@{
      ChildId = $childId
      ExitCode = $child.ExitCode
      StandardOutput = $stdout
      StandardError = $stderr
    }
  } finally {
    if ($child) {
      try { $child.StandardOutput.Dispose() } catch {}
      try { $child.StandardError.Dispose() } catch {}
      try { $child.Close() } catch {}
      $child.Dispose()
    }
  }
}

function ConvertFrom-SafeReadyAuditOutput {
  param([string]$StandardOutput, [string]$StandardError)
  $finalResults = @()
  $latestWait = $null
  $sessionSettings = $null
  foreach ($stream in @(
    [pscustomobject]@{ Name = 'stdout'; Text = $StandardOutput },
    [pscustomobject]@{ Name = 'stderr'; Text = $StandardError }
  )) {
    if ([string]::IsNullOrWhiteSpace($stream.Text)) { continue }
    foreach ($line in [regex]::Split($stream.Text.Trim(), '\r?\n')) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      try { $item = $line | ConvertFrom-Json }
      catch { Throw-Code 'invalid_refresh_output' }
      $event = Get-OptionalProperty -Object $item -Name 'event'
      if ($null -ne $event) {
        if ($event -eq 'audit_phase') {
          foreach ($property in $item.PSObject.Properties.Name) {
            if ($property -notin @('event', 'auditPhaseStarted', 'auditPhaseFinished',
              'auditPhaseDurationMs')) { Throw-Code 'invalid_refresh_output' }
          }
          $started = Get-OptionalProperty -Object $item -Name 'auditPhaseStarted'
          $finished = Get-OptionalProperty -Object $item -Name 'auditPhaseFinished'
          if (($null -eq $started) -eq ($null -eq $finished)) {
            Throw-Code 'invalid_refresh_output'
          }
          $phase = if ($null -ne $started) { $started } else { $finished }
          if ($phase -isnot [string] -or
            $phase -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$') {
            Throw-Code 'invalid_refresh_output'
          }
          $eventDuration = Get-OptionalProperty -Object $item -Name 'auditPhaseDurationMs'
          if ($null -ne $finished -and
            (($eventDuration -isnot [int] -and $eventDuration -isnot [long] -and
              $eventDuration -isnot [double]) -or $eventDuration -lt 0)) {
            Throw-Code 'invalid_refresh_output'
          }
        } elseif ($event -eq 'audit_session_settings') {
          foreach ($property in $item.PSObject.Properties.Name) {
            if ($property -notin @('event', 'effectiveStatementTimeoutMs',
              'effectiveLockTimeoutMs')) { Throw-Code 'invalid_refresh_output' }
          }
          if ((Get-OptionalProperty -Object $item -Name 'effectiveStatementTimeoutMs') -ne 300000 -or
            (Get-OptionalProperty -Object $item -Name 'effectiveLockTimeoutMs') -ne 30000) {
            Throw-Code 'invalid_refresh_output'
          }
          $sessionSettings = [pscustomobject]@{
            effectiveStatementTimeoutMs = 300000
            effectiveLockTimeoutMs = 30000
          }
        } elseif ($event -eq 'audit_wait') {
          foreach ($property in $item.PSObject.Properties.Name) {
            if ($property -notin @('event', 'snapshotId', 'auditPhase', 'auditPid',
              'elapsedMs', 'waitEventType', 'waitEvent', 'blockingPids')) {
              Throw-Code 'invalid_refresh_output'
            }
          }
          $waitSnapshot = Get-OptionalProperty -Object $item -Name 'snapshotId'
          $waitPhase = Get-OptionalProperty -Object $item -Name 'auditPhase'
          $waitPid = Get-OptionalProperty -Object $item -Name 'auditPid'
          $waitElapsed = Get-OptionalProperty -Object $item -Name 'elapsedMs'
          $waitType = Get-OptionalProperty -Object $item -Name 'waitEventType'
          $waitName = Get-OptionalProperty -Object $item -Name 'waitEvent'
          $rawWaitBlockers = Get-OptionalProperty -Object $item -Name 'blockingPids'
          $waitBlockers = if ($null -eq $rawWaitBlockers) { @() } else {
            @($rawWaitBlockers)
          }
          if ($waitSnapshot -isnot [string] -or
            $waitSnapshot -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or
            $waitPhase -isnot [string] -or
            $waitPhase -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$' -or
            ($waitPid -isnot [int] -and $waitPid -isnot [long]) -or $waitPid -le 0 -or
            ($waitElapsed -isnot [int] -and $waitElapsed -isnot [long] -and
              $waitElapsed -isnot [double]) -or $waitElapsed -lt 0) {
            Throw-Code 'invalid_refresh_output'
          }
          foreach ($label in @($waitType, $waitName)) {
            if ($null -ne $label -and ($label -isnot [string] -or
              $label -notmatch '^[A-Za-z0-9_ -]{1,80}$')) {
              Throw-Code 'invalid_refresh_output'
            }
          }
          foreach ($blocker in $waitBlockers) {
            if (($blocker -isnot [int] -and $blocker -isnot [long]) -or $blocker -le 0) {
              Throw-Code 'invalid_refresh_output'
            }
          }
          $latestWait = [pscustomobject]@{
            snapshotId = $waitSnapshot
            auditPhase = $waitPhase
            auditPid = $waitPid
            elapsedMs = $waitElapsed
            waitEventType = $waitType
            waitEvent = $waitName
            blockingPids = @($waitBlockers)
          }
        } else { Throw-Code 'invalid_refresh_output' }
        continue
      }
      $ok = Get-OptionalProperty -Object $item -Name 'ok'
      if ($ok -isnot [bool]) { Throw-Code 'invalid_refresh_output' }
      $allowedFinalFields = if ($ok) {
        @('ok', 'snapshotId', 'status', 'manifestMatch', 'countsMatch', 'anomalyCount',
          'containsPii', 'effectiveStatementTimeoutMs', 'effectiveLockTimeoutMs')
      } else {
        @('ok', 'code', 'phase', 'diagnosticCode', 'dbCode', 'dbConstraint', 'dbTable',
          'dbColumn', 'errorType', 'auditPhaseStarted', 'auditPhaseFinished',
          'auditPhaseDurationMs', 'auditPhase', 'auditPid', 'elapsedMs', 'waitEventType',
          'waitEvent', 'blockingPids', 'effectiveStatementTimeoutMs',
          'effectiveLockTimeoutMs')
      }
      foreach ($property in $item.PSObject.Properties.Name) {
        if ($property -notin $allowedFinalFields) { Throw-Code 'invalid_refresh_output' }
      }
      $finalResults += [pscustomobject]@{ Stream = $stream.Name; Value = $item }
    }
  }
  if ($finalResults.Count -ne 1) { Throw-Code 'invalid_refresh_output' }
  $final = $finalResults[0]
  if (($final.Value.ok -and $final.Stream -ne 'stdout') -or
    (-not $final.Value.ok -and $final.Stream -ne 'stderr')) {
    Throw-Code 'invalid_refresh_output'
  }
  if ($null -ne $latestWait) {
    $finalSnapshot = Get-OptionalProperty -Object $final.Value -Name 'snapshotId'
    if ($null -ne $finalSnapshot -and $latestWait.snapshotId -ne $finalSnapshot) {
      Throw-Code 'invalid_refresh_output'
    }
    foreach ($name in @('auditPhase', 'auditPid', 'elapsedMs', 'waitEventType',
      'waitEvent', 'blockingPids')) {
      $current = Get-OptionalProperty -Object $final.Value -Name $name
      if ($null -eq $current) {
        $final.Value | Add-Member -NotePropertyName $name -NotePropertyValue $latestWait.$name
      }
    }
  }
  if ($null -ne $sessionSettings) {
    foreach ($name in @('effectiveStatementTimeoutMs', 'effectiveLockTimeoutMs')) {
      $current = Get-OptionalProperty -Object $final.Value -Name $name
      if ($null -eq $current) {
        $final.Value | Add-Member -NotePropertyName $name -NotePropertyValue $sessionSettings.$name
      } elseif ($current -ne $sessionSettings.$name) {
        Throw-Code 'invalid_refresh_output'
      }
    }
  }
  return $final.Value
}

function Get-SafeRefreshRecord {
  param(
    $Result,
    [DateTimeOffset]$Started,
    [DateTimeOffset]$Finished,
    [int]$ChildExitCode,
    [long]$DurationMs
  )
  if ($null -eq $Result -or $Result.ok -isnot [bool]) { Throw-Code 'invalid_refresh_output' }
  if ($ChildExitCode -lt 0 -or $ChildExitCode -gt 255) { Throw-Code 'invalid_refresh_output' }
  $record = [ordered]@{
    startedAt = $Started.ToString('o')
    finishedAt = $Finished.ToString('o')
    ok = [bool]$Result.ok
    childExitCode = $ChildExitCode
    durationMs = $DurationMs
  }
  foreach ($name in @('code', 'phase', 'diagnosticCode', 'retentionErrorCode')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or $value -notmatch '^[A-Za-z0-9_-]{1,80}$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  foreach ($name in @('auditPhaseStarted', 'auditPhaseFinished')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or
        $value -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  $auditPhaseDuration = Get-OptionalProperty -Object $Result -Name 'auditPhaseDurationMs'
  if ($null -ne $auditPhaseDuration -and $null -ne $record.auditPhaseStarted) {
    if (($auditPhaseDuration -isnot [int] -and $auditPhaseDuration -isnot [long] -and
      $auditPhaseDuration -isnot [double]) -or $auditPhaseDuration -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.auditPhaseDurationMs = $auditPhaseDuration
  }
  $dbCode = Get-OptionalProperty -Object $Result -Name 'dbCode'
  if ($null -ne $dbCode) {
    if ($dbCode -isnot [string] -or $dbCode -notmatch '^[A-Z0-9]{5}$') {
      Throw-Code 'invalid_refresh_output'
    }
    $record.dbCode = $dbCode
  }
  foreach ($name in @('dbConstraint', 'dbTable', 'dbColumn', 'errorType')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or $value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  foreach ($name in @('activated', 'committed', 'retentionAttempted')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [bool]) { Throw-Code 'invalid_refresh_output' }
      $record[$name] = $value
    }
  }
  foreach ($name in @('effectiveStatementTimeoutMs', 'effectiveLockTimeoutMs')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      $expected = if ($name -eq 'effectiveStatementTimeoutMs') { 300000 } else { 30000 }
      if ($value -ne $expected) { Throw-Code 'invalid_refresh_output' }
      $record[$name] = $value
    }
  }
  Add-SafeAuditWaitFields -Source $Result -Target $record
  foreach ($name in @('postcheckPhaseStarted', 'postcheckPhaseFinished')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or $value -notmatch '^(lifecycle|stable_coverage)$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  $postcheckPhaseDuration = Get-OptionalProperty -Object $Result -Name 'postcheckPhaseDurationMs'
  if ($null -ne $postcheckPhaseDuration) {
    if (($postcheckPhaseDuration -isnot [int] -and $postcheckPhaseDuration -isnot [long] -and
      $postcheckPhaseDuration -isnot [double]) -or $postcheckPhaseDuration -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.postcheckPhaseDurationMs = $postcheckPhaseDuration
  }
  $readyAuditAttempts = Get-OptionalProperty -Object $Result -Name 'readyAuditAttempts'
  if ($null -ne $readyAuditAttempts) {
    if (($readyAuditAttempts -isnot [int] -and $readyAuditAttempts -isnot [long]) -or
      $readyAuditAttempts -lt 1 -or $readyAuditAttempts -gt 2) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.readyAuditAttempts = $readyAuditAttempts
  }
  foreach ($name in @('readyAuditRetried', 'retryAuditOk')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [bool]) { Throw-Code 'invalid_refresh_output' }
      $record[$name] = $value
    }
  }
  $firstAuditDbCode = Get-OptionalProperty -Object $Result -Name 'firstAuditDbCode'
  if ($null -ne $firstAuditDbCode) {
    if ($firstAuditDbCode -isnot [string] -or
      $firstAuditDbCode -notmatch '^[A-Z0-9]{5}$') { Throw-Code 'invalid_refresh_output' }
    $record.firstAuditDbCode = $firstAuditDbCode
  }
  $firstAuditPhase = Get-OptionalProperty -Object $Result -Name 'firstAuditPhase'
  if ($null -ne $firstAuditPhase) {
    if ($firstAuditPhase -isnot [string] -or
      $firstAuditPhase -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$') {
      Throw-Code 'invalid_refresh_output'
    }
    $record.firstAuditPhase = $firstAuditPhase
  }
  $retryAuditDuration = Get-OptionalProperty -Object $Result -Name 'retryAuditDurationMs'
  if ($null -ne $retryAuditDuration) {
    if (($retryAuditDuration -isnot [int] -and $retryAuditDuration -isnot [long] -and
      $retryAuditDuration -isnot [double]) -or $retryAuditDuration -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.retryAuditDurationMs = $retryAuditDuration
  }
  foreach ($name in @('previousSnapshotId', 'newSnapshotId', 'activeSnapshotId')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or
        $value -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  foreach ($name in @('activeCount', 'readyCount', 'supersededCount', 'stableValidBookings',
    'stableAssignedBookings', 'stableMissingBookings', 'hotValidBookings',
    'stabilityWindowMinutes', 'retentionDeleted', 'retentionRemaining')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if (-not (Test-CountValue $value)) { Throw-Code 'invalid_refresh_output' }
      $record[$name] = $value
    }
  }
  $retentionDuration = Get-OptionalProperty -Object $Result -Name 'retentionDurationMs'
  if ($null -ne $retentionDuration) {
    if (($retentionDuration -isnot [int] -and $retentionDuration -isnot [long] -and
      $retentionDuration -isnot [double]) -or $retentionDuration -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.retentionDurationMs = $retentionDuration
  }
  $retentionLastDeleted = Get-OptionalProperty -Object $Result `
    -Name 'retentionLastDeletedSnapshotId'
  if ($null -ne $retentionLastDeleted) {
    if ($retentionLastDeleted -isnot [string] -or
      $retentionLastDeleted -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
      Throw-Code 'invalid_refresh_output'
    }
    $record.retentionLastDeletedSnapshotId = $retentionLastDeleted
  }
  $timings = Get-OptionalProperty -Object $Result -Name 'timings'
  if ($null -ne $timings) {
    $safeTimings = [ordered]@{}
    foreach ($name in @('buildMs', 'auditMs', 'activateMs', 'lifecyclePostcheckMs',
      'stableCoveragePostcheckMs', 'postcheckMs', 'retentionMs', 'totalMs')) {
      $number = Get-OptionalProperty -Object $timings -Name $name
      if ($null -ne $number) {
        if (($number -isnot [int] -and $number -isnot [long] -and $number -isnot [double]) -or
          $number -lt 0) { Throw-Code 'invalid_refresh_output' }
        $safeTimings[$name] = $number
      }
    }
    $record.timings = $safeTimings
  }
  return [pscustomobject]$record
}

function Write-AtomicJson {
  param([string]$Path, $Value)
  $token = [guid]::NewGuid().ToString('N')
  $temporary = "$Path.$token.tmp"
  $backup = "$Path.$token.bak"
  try {
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 6 -Compress),
      [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      [IO.File]::Replace($temporary, $Path, $backup)
    } else {
      [IO.File]::Move($temporary, $Path)
    }
  } finally {
    if (Test-Path -LiteralPath $temporary -PathType Leaf) {
      Remove-Item -LiteralPath $temporary -Force
    }
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Remove-Item -LiteralPath $backup -Force
    }
  }
}

function Publish-OperationalState {
  param($Record, [long]$DurationMs)
  if (-not (Test-Path -LiteralPath $logDirectory -PathType Container) -or
    -not (Test-Path -LiteralPath $stateDirectory -PathType Container)) {
    Throw-Code 'operational_directories_missing'
  }
  $logPath = Join-Path $logDirectory ("refresh-{0}.ndjson" -f
    [DateTimeOffset]::UtcNow.ToString('yyyy-MM'))
  [IO.File]::AppendAllText($logPath,
    (($Record | ConvertTo-Json -Depth 6 -Compress) + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false))

  $previous = $null
  if (Test-Path -LiteralPath $latestPath -PathType Leaf) {
    try { $previous = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json }
    catch { $previous = $null }
  }
  $previousLastSuccess = Get-OptionalProperty -Object $previous -Name 'lastSuccessAt'
  $previousActiveSnapshot = Get-OptionalProperty -Object $previous -Name 'activeSnapshotId'
  $previousCapturedAt = Get-OptionalProperty -Object $previous -Name 'capturedAt'
  $previousStableMissing = Get-OptionalProperty -Object $previous -Name 'stableMissingBookings'
  $previousHot = Get-OptionalProperty -Object $previous -Name 'hotValidBookings'
  $recordSnapshot = Get-OptionalProperty -Object $Record -Name 'newSnapshotId'
  $recordStableMissing = Get-OptionalProperty -Object $Record -Name 'stableMissingBookings'
  $recordHot = Get-OptionalProperty -Object $Record -Name 'hotValidBookings'
  $recordCode = Get-OptionalProperty -Object $Record -Name 'code'
  $recordPhase = Get-OptionalProperty -Object $Record -Name 'phase'
  $recordDiagnosticCode = Get-OptionalProperty -Object $Record -Name 'diagnosticCode'
  $recordDbCode = Get-OptionalProperty -Object $Record -Name 'dbCode'
  $recordChildExitCode = Get-OptionalProperty -Object $Record -Name 'childExitCode'
  $recordAuditPhaseStarted = Get-OptionalProperty -Object $Record -Name 'auditPhaseStarted'
  $recordAuditPhaseFinished = Get-OptionalProperty -Object $Record -Name 'auditPhaseFinished'
  $recordAuditPhaseDuration = Get-OptionalProperty -Object $Record -Name 'auditPhaseDurationMs'
  $recordAuditPhase = Get-OptionalProperty -Object $Record -Name 'auditPhase'
  $recordAuditPid = Get-OptionalProperty -Object $Record -Name 'auditPid'
  $recordWaitType = Get-OptionalProperty -Object $Record -Name 'waitEventType'
  $recordWaitEvent = Get-OptionalProperty -Object $Record -Name 'waitEvent'
  $recordBlockingPids = Get-OptionalProperty -Object $Record -Name 'blockingPids'
  $recordWaitElapsed = Get-OptionalProperty -Object $Record -Name 'elapsedMs'
  $recordReadyAuditAttempts = Get-OptionalProperty -Object $Record -Name 'readyAuditAttempts'
  $recordReadyAuditRetried = Get-OptionalProperty -Object $Record -Name 'readyAuditRetried'
  $recordFirstAuditDbCode = Get-OptionalProperty -Object $Record -Name 'firstAuditDbCode'
  $recordFirstAuditPhase = Get-OptionalProperty -Object $Record -Name 'firstAuditPhase'
  $recordRetryAuditOk = Get-OptionalProperty -Object $Record -Name 'retryAuditOk'
  $recordRetryAuditDuration = Get-OptionalProperty -Object $Record -Name 'retryAuditDurationMs'
  $recordPostcheckPhaseStarted = Get-OptionalProperty -Object $Record -Name 'postcheckPhaseStarted'
  $recordPostcheckPhaseFinished = Get-OptionalProperty -Object $Record -Name 'postcheckPhaseFinished'
  $recordPostcheckPhaseDuration = Get-OptionalProperty -Object $Record -Name 'postcheckPhaseDurationMs'
  $recordRetentionAttempted = Get-OptionalProperty -Object $Record -Name 'retentionAttempted'
  $recordRetentionDeleted = Get-OptionalProperty -Object $Record -Name 'retentionDeleted'
  $recordRetentionRemaining = Get-OptionalProperty -Object $Record -Name 'retentionRemaining'
  $recordRetentionDuration = Get-OptionalProperty -Object $Record -Name 'retentionDurationMs'
  $recordRetentionLastDeleted = Get-OptionalProperty -Object $Record `
    -Name 'retentionLastDeletedSnapshotId'
  $recordRetentionErrorCode = Get-OptionalProperty -Object $Record -Name 'retentionErrorCode'
  $recordActivated = Get-OptionalProperty -Object $Record -Name 'activated'
  $recordCommitted = Get-OptionalProperty -Object $Record -Name 'committed'
  $lastSuccessAt = if ($Record.ok) { $Record.finishedAt } else { $previousLastSuccess }
  $activeSnapshotId = if ($Record.ok -or ($recordActivated -eq $true -and
      $recordCommitted -eq $true)) { $recordSnapshot } else { $previousActiveSnapshot }
  $state = [ordered]@{
    lastAttemptAt = $Record.finishedAt
    lastSuccessAt = $lastSuccessAt
    ok = $Record.ok
    activeSnapshotId = $activeSnapshotId
    capturedAt = $previousCapturedAt
    stableMissingBookings = if ($null -ne $recordStableMissing) {
      $recordStableMissing
    } else { $previousStableMissing }
    hotValidBookings = if ($null -ne $recordHot) { $recordHot } else { $previousHot }
    lastErrorCode = if ($Record.ok) { $null } else { $recordCode }
    lastErrorPhase = if ($Record.ok) { $null } else { $recordPhase }
    lastDiagnosticCode = if ($Record.ok) { $null } else { $recordDiagnosticCode }
    lastDbCode = if ($Record.ok) { $null } else { $recordDbCode }
    lastAuditPhaseStarted = if ($Record.ok) { $null } else { $recordAuditPhaseStarted }
    lastAuditPhaseFinished = if ($Record.ok) { $null } else { $recordAuditPhaseFinished }
    lastAuditPhaseDurationMs = if ($Record.ok) { $null } else { $recordAuditPhaseDuration }
    lastAuditPhase = if ($Record.ok) { $null } else { $recordAuditPhase }
    lastAuditPid = if ($Record.ok) { $null } else { $recordAuditPid }
    lastAuditWaitElapsedMs = if ($Record.ok) { $null } else { $recordWaitElapsed }
    lastWaitEventType = if ($Record.ok) { $null } else { $recordWaitType }
    lastWaitEvent = if ($Record.ok) { $null } else { $recordWaitEvent }
    lastBlockingPids = if ($Record.ok) { $null } else { $recordBlockingPids }
    readyAuditAttempts = $recordReadyAuditAttempts
    readyAuditRetried = $recordReadyAuditRetried
    firstAuditDbCode = $recordFirstAuditDbCode
    firstAuditPhase = $recordFirstAuditPhase
    retryAuditOk = $recordRetryAuditOk
    retryAuditDurationMs = $recordRetryAuditDuration
    lastPostcheckPhaseStarted = if ($Record.ok) { $null } else { $recordPostcheckPhaseStarted }
    lastPostcheckPhaseFinished = if ($Record.ok) { $null } else { $recordPostcheckPhaseFinished }
    lastPostcheckPhaseDurationMs = if ($Record.ok) { $null } else { $recordPostcheckPhaseDuration }
    retentionAttempted = $recordRetentionAttempted
    retentionDeleted = $recordRetentionDeleted
    retentionRemaining = $recordRetentionRemaining
    retentionDurationMs = $recordRetentionDuration
    retentionLastDeletedSnapshotId = $recordRetentionLastDeleted
    retentionErrorCode = $recordRetentionErrorCode
    lastChildExitCode = $recordChildExitCode
    durationMs = $DurationMs
  }
  Write-AtomicJson -Path $latestPath -Value $state
}

function Get-SafeFailureRecord {
  param([string]$Code, $ChildExitCode, [long]$DurationMs)
  $safeCodes = @(
    'settings_missing', 'settings_invalid', 'config_user_mismatch', 'dpapi_user_mismatch',
    'password_bundle_missing', 'hmac_bundle_missing', 'dpapi_decrypt_failed',
    'builder_password_missing', 'hmac_invalid', 'hmac_key_id_mismatch', 'ca_missing',
    'ca_hash_mismatch', 'repo_missing', 'node_missing', 'refresh_script_missing',
    'database_connection_check_script_missing', 'ready_audit_script_missing',
    'invalid_wrapper_mode',
    'invalid_refresh_output', 'operational_directories_missing'
  )
  $record = [ordered]@{
    startedAt = $startedAt.ToString('o')
    finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
    ok = $false
    code = if ($Code -in $safeCodes) { $Code } else { 'wrapper_failed' }
    phase = 'wrapper'
    durationMs = $DurationMs
    containsSecrets = $false
  }
  if ($ChildExitCode -is [int] -and $ChildExitCode -ge 0 -and $ChildExitCode -le 255) {
    $record.childExitCode = $ChildExitCode
  }
  return [pscustomobject]$record
}

function Get-SafeReadyAuditRecord {
  param($Result, [string]$SnapshotId, [int]$ChildExitCode)
  if ($null -eq $Result -or $Result.ok -isnot [bool] -or
    $ChildExitCode -lt 0 -or $ChildExitCode -gt 255) {
    Throw-Code 'invalid_refresh_output'
  }
  $record = [ordered]@{
    ok = [bool]$Result.ok
    mode = 'ready-snapshot-audit'
    snapshotId = $SnapshotId.ToLowerInvariant()
    containsPii = $false
  }
  if ($Result.ok) {
    if ($ChildExitCode -ne 0 -or
      (Get-OptionalProperty -Object $Result -Name 'snapshotId') -ne $record.snapshotId -or
      (Get-OptionalProperty -Object $Result -Name 'status') -ne 'ready' -or
      (Get-OptionalProperty -Object $Result -Name 'manifestMatch') -ne $true -or
      (Get-OptionalProperty -Object $Result -Name 'countsMatch') -ne $true -or
      -not (Test-CountValue (Get-OptionalProperty -Object $Result -Name 'anomalyCount')) -or
      [string](Get-OptionalProperty -Object $Result -Name 'anomalyCount') -ne '0' -or
      (Get-OptionalProperty -Object $Result -Name 'containsPii') -ne $false) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.status = 'ready'
    $record.manifestMatch = $true
    $record.countsMatch = $true
    $record.anomalyCount = 0
    foreach ($name in @('effectiveStatementTimeoutMs', 'effectiveLockTimeoutMs')) {
      $value = Get-OptionalProperty -Object $Result -Name $name
      if ($null -ne $value) {
        $expected = if ($name -eq 'effectiveStatementTimeoutMs') { 300000 } else { 30000 }
        if ($value -ne $expected) { Throw-Code 'invalid_refresh_output' }
        $record[$name] = $value
      }
    }
    Add-SafeAuditWaitFields -Source $Result -Target $record
    return [pscustomobject]$record
  }
  if ($ChildExitCode -eq 0) { Throw-Code 'invalid_refresh_output' }
  foreach ($name in @('code', 'phase', 'diagnosticCode', 'errorType')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or $value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,79}$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  if (-not $record.Contains('code') -or -not $record.Contains('phase')) {
    Throw-Code 'invalid_refresh_output'
  }
  foreach ($name in @('auditPhaseStarted', 'auditPhaseFinished')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      if ($value -isnot [string] -or
        $value -notmatch '^(contract|counts|groups_metrics|overlap|manifest)$') {
        Throw-Code 'invalid_refresh_output'
      }
      $record[$name] = $value
    }
  }
  $auditPhaseDuration = Get-OptionalProperty -Object $Result -Name 'auditPhaseDurationMs'
  if ($null -ne $auditPhaseDuration) {
    if (($auditPhaseDuration -isnot [int] -and $auditPhaseDuration -isnot [long] -and
      $auditPhaseDuration -isnot [double]) -or $auditPhaseDuration -lt 0) {
      Throw-Code 'invalid_refresh_output'
    }
    $record.auditPhaseDurationMs = $auditPhaseDuration
  }
  $dbCode = Get-OptionalProperty -Object $Result -Name 'dbCode'
  if ($null -ne $dbCode) {
    if ($dbCode -isnot [string] -or $dbCode -notmatch '^[A-Z0-9]{5}$') {
      Throw-Code 'invalid_refresh_output'
    }
    $record.dbCode = $dbCode
  }
  foreach ($name in @('effectiveStatementTimeoutMs', 'effectiveLockTimeoutMs')) {
    $value = Get-OptionalProperty -Object $Result -Name $name
    if ($null -ne $value) {
      $expected = if ($name -eq 'effectiveStatementTimeoutMs') { 300000 } else { 30000 }
      if ($value -ne $expected) { Throw-Code 'invalid_refresh_output' }
      $record[$name] = $value
    }
  }
  Add-SafeAuditWaitFields -Source $Result -Target $record
  return [pscustomobject]$record
}

$finalRecord = $null
$exitCode = 1
try {
  $hasReadyAudit = -not [string]::IsNullOrWhiteSpace($AuditReadySnapshot)
  $hasReadyResume = -not [string]::IsNullOrWhiteSpace($ResumeReadySnapshot)
  $selectedModeCount = [int][bool]$DryRunConfigCheck +
    [int][bool]$TestDatabaseConnection + [int][bool]$hasReadyAudit + [int][bool]$hasReadyResume
  if ($selectedModeCount -gt 1) { Throw-Code 'invalid_wrapper_mode' }
  $NodePath = Resolve-NodeExecutable -RequestedPath $NodePath
  if (-not (Test-Path -LiteralPath $repoRoot -PathType Container)) { Throw-Code 'repo_missing' }
  Assert-File -Path $refreshScript -Code 'refresh_script_missing'
  if ($TestDatabaseConnection) {
    Assert-File -Path $databaseConnectionCheckScript `
      -Code 'database_connection_check_script_missing'
  }
  if ($hasReadyAudit) {
    Assert-File -Path $readyAuditScript -Code 'ready_audit_script_missing'
    $AuditReadySnapshot = $AuditReadySnapshot.ToLowerInvariant()
  }
  if ($hasReadyResume) {
    $ResumeReadySnapshot = $ResumeReadySnapshot.ToLowerInvariant()
  }
  Assert-File -Path $settingsPath -Code 'settings_missing'
  Assert-File -Path $passwordPath -Code 'password_bundle_missing'
  Assert-File -Path $hmacPath -Code 'hmac_bundle_missing'

  try { $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json }
  catch { Throw-Code 'settings_invalid' }
  if ($settings.version -ne 1 -or $settings.dpapiScope -ne 'CurrentUser') {
    Throw-Code 'settings_invalid'
  }
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($settings.provisionedUserSid -ne $currentSid) { Throw-Code 'dpapi_user_mismatch' }
  foreach ($name in $expected.Keys) {
    if ($settings.$name -ne $expected[$name]) {
      if ($name -eq 'hmacKeyId') { Throw-Code 'hmac_key_id_mismatch' }
      Throw-Code 'settings_invalid'
    }
  }
  Assert-File -Path $settings.caPath -Code 'ca_missing'
  if ((Get-FileHash -LiteralPath $settings.caPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne
    $settings.caSha256) { Throw-Code 'ca_hash_mismatch' }

  try {
    $passwordSecure = Get-Content -LiteralPath $passwordPath -Raw | ConvertTo-SecureString
    $hmacSecure = Get-Content -LiteralPath $hmacPath -Raw | ConvertTo-SecureString
  } catch { Throw-Code 'dpapi_decrypt_failed' }
  $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
  $hmacBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($hmacSecure)
  $passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
  $hmacPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($hmacBstr)
  if ([string]::IsNullOrWhiteSpace($passwordPlain)) { Throw-Code 'builder_password_missing' }
  try {
    $hmacBytes = [Convert]::FromBase64String($hmacPlain)
    if ($hmacBytes.Length -lt 32 -or [Convert]::ToBase64String($hmacBytes) -ne $hmacPlain) {
      Throw-Code 'hmac_invalid'
    }
  } catch {
    if ($_.Exception.Message -eq 'hmac_invalid') { throw }
    Throw-Code 'hmac_invalid'
  }

  if ($DryRunConfigCheck) {
    $finalRecord = [pscustomobject][ordered]@{
      ok = $true
      mode = 'dry-run-config-check'
      dpapiScope = 'CurrentUser'
      configUserMatches = $true
      builderPasswordPresent = $true
      hmacValid = $true
      hmacKeyIdValid = $true
      caValid = $true
      repoValid = $true
      nodeValid = $true
      containsSecrets = $false
    }
    $exitCode = 0
  } else {
    $encodedUser = [Uri]::EscapeDataString($settings.databaseUser)
    $encodedPassword = [Uri]::EscapeDataString($passwordPlain)
    $encodedCa = [Uri]::EscapeDataString($settings.caPath)
    $databaseUrl = "postgresql://${encodedUser}:${encodedPassword}@$($settings.databaseHost):$($settings.databasePort)/$($settings.databaseName)?sslmode=verify-full&sslrootcert=${encodedCa}"

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $childScript = if ($TestDatabaseConnection) {
      $databaseConnectionCheckScript
    } elseif ($hasReadyAudit) {
      $readyAuditScript
    } else {
      $refreshScript
    }
    $startInfo.Arguments = if ($hasReadyAudit) {
      '"' + $childScript + '" --snapshot-id "' + $AuditReadySnapshot + '"'
    } elseif ($hasReadyResume) {
      '"' + $childScript + '" --resume-ready "' + $ResumeReadySnapshot + '"'
    } else {
      '"' + $childScript + '"'
    }
    $startInfo.EnvironmentVariables['RELATED_REVIEW_DATABASE_URL'] = $databaseUrl
    if (-not $TestDatabaseConnection) {
      $startInfo.EnvironmentVariables['RELATED_REVIEW_HMAC_KEY'] = $hmacPlain
      $startInfo.EnvironmentVariables['RELATED_REVIEW_HMAC_KEY_ID'] = $settings.hmacKeyId
    }

    $captured = Invoke-CapturedProcess -StartInfo $startInfo
    $stdout = $captured.StandardOutput
    $stderr = $captured.StandardError
    $childExitCode = $captured.ExitCode
    $result = if ($hasReadyAudit) {
      ConvertFrom-SafeReadyAuditOutput -StandardOutput $stdout -StandardError $stderr
    } else {
      ConvertFrom-SafeChildOutput -StandardOutput $stdout -StandardError $stderr
    }
    $finishedAt = [DateTimeOffset]::UtcNow
    $stopwatch.Stop()
    if ($TestDatabaseConnection) {
      if ($result.ok -isnot [bool] -or
        (Get-OptionalProperty -Object $result -Name 'mode') -ne 'database-connection-check' -or
        (Get-OptionalProperty -Object $result -Name 'containsSecrets') -ne $false) {
        Throw-Code 'invalid_refresh_output'
      }
      $finalRecord = $result
    } elseif ($hasReadyAudit) {
      $finalRecord = Get-SafeReadyAuditRecord -Result $result `
        -SnapshotId $AuditReadySnapshot -ChildExitCode $childExitCode
    } else {
      $finalRecord = Get-SafeRefreshRecord -Result $result -Started $startedAt `
        -Finished $finishedAt -ChildExitCode $childExitCode `
        -DurationMs $stopwatch.ElapsedMilliseconds
      Publish-OperationalState -Record $finalRecord -DurationMs $stopwatch.ElapsedMilliseconds
    }
    $exitCode = if ($childExitCode -eq 0 -and $finalRecord.ok) { 0 } else { 1 }
  }
} catch {
  $stopwatch.Stop()
  $finalRecord = Get-SafeFailureRecord -Code $_.Exception.Message `
    -ChildExitCode $childExitCode -DurationMs $stopwatch.ElapsedMilliseconds
  if (-not $TestDatabaseConnection -and -not $hasReadyAudit) {
    try {
      if ((Test-Path -LiteralPath $logDirectory -PathType Container) -and
        (Test-Path -LiteralPath $stateDirectory -PathType Container)) {
        Publish-OperationalState -Record $finalRecord -DurationMs $stopwatch.ElapsedMilliseconds
      }
    } catch {
      # Console output remains sanitized even if operational persistence fails.
    }
  }
  $exitCode = 1
} finally {
  if ($hmacBytes) { [Array]::Clear($hmacBytes, 0, $hmacBytes.Length) }
  if ($passwordBstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr)
  }
  if ($hmacBstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($hmacBstr)
  }
  if ($startInfo) {
    [void]$startInfo.EnvironmentVariables.Remove('RELATED_REVIEW_DATABASE_URL')
    [void]$startInfo.EnvironmentVariables.Remove('RELATED_REVIEW_HMAC_KEY')
    [void]$startInfo.EnvironmentVariables.Remove('RELATED_REVIEW_HMAC_KEY_ID')
  }
  $passwordPlain = $null
  $hmacPlain = $null
  $databaseUrl = $null
  $stdout = $null
  $stderr = $null
  $raw = $null
  $result = $null
  $startInfo = $null
  $captured = $null
  if ($passwordSecure) { $passwordSecure.Dispose() }
  if ($hmacSecure) { $hmacSecure.Dispose() }
}

$finalRecord | ConvertTo-Json -Depth 6 -Compress
exit $exitCode
