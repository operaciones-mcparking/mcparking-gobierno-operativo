#requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = 'Plan')]
param(
  [Parameter(ParameterSetName = 'Apply')][switch]$Apply,
  [Parameter(ParameterSetName = 'Status')][switch]$Status,
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$AsOfTime = '01:00',
  [ValidateRange(0, 29)][int]$AutoStartMinute = 12,
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
  [string]$TaskUser = "$env:COMPUTERNAME\$env:USERNAME"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskPath = '\McParking\'
$autoName = 'Customer360BoletaAnalyticsAuto'
$asOfName = 'Customer360BoletaAnalyticsAsOf'
$repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).ProviderPath
$wrapper = Join-Path $PSScriptRoot 'customer-window-360-boleta-analytics-runner.ps1'
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$asOfRepeatInterval = 'PT30M'
$asOfRepeatDuration = 'PT3H'
$asOfRunnerArguments = '-Limit 500 -MaxIterations 400 -MaxRuntimeMs 1200000 -PauseMs 2000'

function Get-NextHalfHourlyStart([int]$Minute) {
  $now = Get-Date
  $candidate = $now.Date.AddHours($now.Hour).AddMinutes($Minute)
  while ($candidate -le $now) { $candidate = $candidate.AddMinutes(30) }
  return $candidate
}

function Add-WindowedRepetition($Trigger) {
  $repetition = New-CimInstance -Namespace Root/Microsoft/Windows/TaskScheduler `
    -ClassName MSFT_TaskRepetitionPattern -ClientOnly -Property @{
      Interval = $asOfRepeatInterval
      Duration = $asOfRepeatDuration
      StopAtDurationEnd = $false
    }
  $Trigger.Repetition = $repetition
  return $Trigger
}

function Get-TaskSafe([string]$Name) {
  return Get-ScheduledTask -TaskPath $taskPath -TaskName $Name -ErrorAction SilentlyContinue
}
function Get-TaskSummary([string]$Name) {
  $task=Get-TaskSafe $Name
  if (-not $task) { return [pscustomobject]@{ taskName=$Name; exists=$false; contractMatches=$false } }
  $trigger=@($task.Triggers)[0]; $action=@($task.Actions)[0]
  $modeArguments=if($Name -eq $asOfName){" -Mode AsOf $asOfRunnerArguments"}else{' -Mode Auto'}
  $expectedArgs="-NoProfile -NonInteractive -File `"$wrapper`"$modeArguments -NodePath `"$NodePath`""
  $identityOk=$false
  try {
    $expectedSid=([Security.Principal.NTAccount]$TaskUser).Translate([Security.Principal.SecurityIdentifier]).Value
    $actualSid=([Security.Principal.NTAccount]([string]$task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
    $identityOk=$expectedSid -eq $actualSid
  } catch { $identityOk=$false }
  $intervalOk=[string]$trigger.Repetition.Interval -eq 'PT30M'
  $durationOk=if($Name -eq $autoName){[string]::IsNullOrWhiteSpace([string]$trigger.Repetition.Duration)}else{
    [string]$trigger.Repetition.Duration -eq $asOfRepeatDuration
  }
  $scheduleOk=if($Name -eq $autoName){
    ([datetime]$trigger.StartBoundary).Minute % 30 -eq $AutoStartMinute
  }elseif($AsOfTime){
    ([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $AsOfTime
  }else{$true}
  $startOk=if($Name -eq $autoName){$task.Settings.StartWhenAvailable -eq $true}else{$task.Settings.StartWhenAvailable -eq $false}
  $matches=$identityOk -and [int]$task.Principal.LogonType -eq 3 -and [int]$task.Settings.MultipleInstances -eq 2 -and
    [string]$task.Settings.ExecutionTimeLimit -eq 'PT25M' -and $task.Settings.WakeToRun -eq $false -and
    $action.Execute -eq $powerShell -and $action.Arguments -eq $expectedArgs -and $action.WorkingDirectory -eq $repoRoot -and
    $intervalOk -and $durationOk -and $scheduleOk -and $startOk
  return [pscustomobject]@{ taskName=$Name; exists=$true; contractMatches=$matches; userId=$task.Principal.UserId;
    logonType='Interactive'; multipleInstances='IgnoreNew'; executionTimeLimit='PT25M'; startWhenAvailable=$task.Settings.StartWhenAvailable;
    repeatInterval=[string]$trigger.Repetition.Interval; repeatDuration=[string]$trigger.Repetition.Duration;
    workingDirectory=$action.WorkingDirectory }
}

if (-not (Test-Path -LiteralPath $repoRoot -PathType Container) -or -not (Test-Path -LiteralPath $wrapper -PathType Leaf) -or
    -not (Test-Path -LiteralPath $NodePath -PathType Leaf) -or $repoRoot.Contains('Ã')) { throw 'Installer path contract failed.' }

if ($Status) {
  @((Get-TaskSummary $autoName),(Get-TaskSummary $asOfName)) | ConvertTo-Json -Depth 5
  exit 0
}

$existing=@((Get-TaskSummary $autoName),(Get-TaskSummary $asOfName))
$plan=[ordered]@{ mode=if($Apply){'apply'}else{'plan'}; taskPath=$taskPath; taskUser=$TaskUser;
  principal=[ordered]@{logonType='Interactive';runLevel='Limited';requiresWindowsPassword=$false;sessionRequired=$true};
  common=[ordered]@{multipleInstances='IgnoreNew';executionTimeLimit='PT25M';wakeToRun=$false;workingDirectory=$repoRoot;wrapper=$wrapper;nodePath=$NodePath};
  auto=[ordered]@{taskName=$autoName;every='PT30M';minuteOffsets=@($AutoStartMinute,($AutoStartMinute + 30));startWhenAvailable=$true};
  asOf=[ordered]@{taskName=$asOfName;dailyAt=$AsOfTime;every=$asOfRepeatInterval;window=$asOfRepeatDuration;
    runner=[ordered]@{limit=500;maxIterations=400;maxRuntimeMs=1200000;pauseMs=2000};startWhenAvailable=$false};
  bootstrap='manual only'; existing=$existing;
  wouldChange=(@($existing | Where-Object {$_.contractMatches -ne $true}).Count -gt 0) }
$plan | ConvertTo-Json -Depth 6
if (-not $Apply) { exit 0 }

$principal=New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType Interactive -RunLevel Limited
$autoAction=New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -File `"$wrapper`" -Mode Auto -NodePath `"$NodePath`"" -WorkingDirectory $repoRoot
$asOfAction=New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -File `"$wrapper`" -Mode AsOf $asOfRunnerArguments -NodePath `"$NodePath`"" -WorkingDirectory $repoRoot
$autoTrigger=New-ScheduledTaskTrigger -Once -At (Get-NextHalfHourlyStart -Minute $AutoStartMinute) -RepetitionInterval (New-TimeSpan -Minutes 30)
$parts=$AsOfTime.Split(':'); $dailyAt=(Get-Date).Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
$asOfTrigger=Add-WindowedRepetition (New-ScheduledTaskTrigger -Daily -At $dailyAt)
$autoSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -WakeToRun:$false
$asOfSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -WakeToRun:$false
[void](Register-ScheduledTask -TaskPath $taskPath -TaskName $autoName -Action $autoAction -Trigger $autoTrigger -Settings $autoSettings -Principal $principal -Force)
[void](Register-ScheduledTask -TaskPath $taskPath -TaskName $asOfName -Action $asOfAction -Trigger $asOfTrigger -Settings $asOfSettings -Principal $principal -Force)
$post=@((Get-TaskSummary $autoName),(Get-TaskSummary $asOfName))
if (@($post | Where-Object {$_.contractMatches -ne $true}).Count -gt 0) { throw 'Scheduled task post-apply contract failed.' }
$post | ConvertTo-Json -Depth 5
