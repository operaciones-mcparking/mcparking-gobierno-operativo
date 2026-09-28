#requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = 'Plan')]
param(
  [Parameter(ParameterSetName = 'Apply')][switch]$Apply,
  [Parameter(ParameterSetName = 'Status')][switch]$Status,
  [Parameter(ParameterSetName = 'Apply', Mandatory = $true)][ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$AsOfTime,
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

function Get-TaskSafe([string]$Name) {
  return Get-ScheduledTask -TaskPath $taskPath -TaskName $Name -ErrorAction SilentlyContinue
}
function Get-TaskSummary([string]$Name) {
  $task=Get-TaskSafe $Name
  if (-not $task) { return [pscustomobject]@{ taskName=$Name; exists=$false; contractMatches=$false } }
  $trigger=@($task.Triggers)[0]; $action=@($task.Actions)[0]
  $expectedMode=if($Name -eq $autoName){'Auto'}else{'AsOf'}
  $expectedArgs="-NoProfile -NonInteractive -File `"$wrapper`" -Mode $expectedMode -NodePath `"$NodePath`""
  $identityOk=$false
  try {
    $expectedSid=([Security.Principal.NTAccount]$TaskUser).Translate([Security.Principal.SecurityIdentifier]).Value
    $actualSid=([Security.Principal.NTAccount]([string]$task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
    $identityOk=$expectedSid -eq $actualSid
  } catch { $identityOk=$false }
  $intervalOk=if($Name -eq $autoName){[string]$trigger.Repetition.Interval -eq 'PT30M'}else{$true}
  $scheduleOk=if($Name -eq $autoName){$true}elseif($AsOfTime){
    ([datetime]$trigger.StartBoundary).ToString('HH:mm') -eq $AsOfTime -and [string]::IsNullOrWhiteSpace([string]$trigger.Repetition.Interval)
  }else{$true}
  $startOk=if($Name -eq $autoName){$task.Settings.StartWhenAvailable -eq $true}else{$task.Settings.StartWhenAvailable -eq $false}
  $matches=$identityOk -and [int]$task.Principal.LogonType -eq 3 -and [int]$task.Settings.MultipleInstances -eq 2 -and
    [string]$task.Settings.ExecutionTimeLimit -eq 'PT25M' -and $task.Settings.WakeToRun -eq $false -and
    $action.Execute -eq $powerShell -and $action.Arguments -eq $expectedArgs -and $action.WorkingDirectory -eq $repoRoot -and
    $intervalOk -and $scheduleOk -and $startOk
  return [pscustomobject]@{ taskName=$Name; exists=$true; contractMatches=$matches; userId=$task.Principal.UserId;
    logonType='Interactive'; multipleInstances='IgnoreNew'; executionTimeLimit='PT25M'; startWhenAvailable=$task.Settings.StartWhenAvailable;
    repeatInterval=[string]$trigger.Repetition.Interval; workingDirectory=$action.WorkingDirectory }
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
  auto=[ordered]@{taskName=$autoName;every='PT30M';startWhenAvailable=$true};
  asOf=[ordered]@{taskName=$asOfName;dailyAt=if($AsOfTime){$AsOfTime}else{'REQUIRED_ON_APPLY'};startWhenAvailable=$false};
  bootstrap='manual only'; existing=$existing;
  wouldChange=(@($existing | Where-Object {$_.contractMatches -ne $true}).Count -gt 0) }
$plan | ConvertTo-Json -Depth 6
if (-not $Apply) { exit 0 }

$principal=New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType Interactive -RunLevel Limited
$autoAction=New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -File `"$wrapper`" -Mode Auto -NodePath `"$NodePath`"" -WorkingDirectory $repoRoot
$asOfAction=New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -File `"$wrapper`" -Mode AsOf -NodePath `"$NodePath`"" -WorkingDirectory $repoRoot
$autoTrigger=New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 30)
$parts=$AsOfTime.Split(':'); $dailyAt=(Get-Date).Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
$asOfTrigger=New-ScheduledTaskTrigger -Daily -At $dailyAt
$autoSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -WakeToRun:$false
$asOfSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -WakeToRun:$false
[void](Register-ScheduledTask -TaskPath $taskPath -TaskName $autoName -Action $autoAction -Trigger $autoTrigger -Settings $autoSettings -Principal $principal -Force)
[void](Register-ScheduledTask -TaskPath $taskPath -TaskName $asOfName -Action $asOfAction -Trigger $asOfTrigger -Settings $asOfSettings -Principal $principal -Force)
$post=@((Get-TaskSummary $autoName),(Get-TaskSummary $asOfName))
if (@($post | Where-Object {$_.contractMatches -ne $true}).Count -gt 0) { throw 'Scheduled task post-apply contract failed.' }
$post | ConvertTo-Json -Depth 5
