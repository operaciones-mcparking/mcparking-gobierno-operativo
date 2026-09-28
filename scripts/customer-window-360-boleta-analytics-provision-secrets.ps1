#requires -Version 5.1
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$UsePasswordFromClipboard,
  [string]$NodePath,
  [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME",
  [string]$DatabaseHost = 'aws-1-us-east-1.pooler.supabase.com',
  [int]$DatabasePort = 5432,
  [string]$DatabaseName = 'postgres'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'C:\ProgramData\McParking\Customer360BoletaAnalytics'
$config = Join-Path $root 'config'
$passwordPath = Join-Path $config 'runner-password.dpapi'
$settingsPath = Join-Path $config 'settings.json'
$caPath = Join-Path $root 'certs\supabase-ca.crt'
$runner = Join-Path $PSScriptRoot 'customer-window-360-boleta-analytics-v1-runner.mjs'
$databaseUser = 'customer_360_boleta_analytics_runner_login.gyejtqetzumphtatifkl'
$plain = $null; $secure = $null; $bstr = [IntPtr]::Zero
$psi = $null; $proc = $null; $url = $null; $out = $null; $err = $null

function Resolve-Node([string]$Requested) {
  if ($Requested) { if (-not (Test-Path -LiteralPath $Requested -PathType Leaf)) { throw 'Node unavailable.' }; return $Requested }
  $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }
  throw 'Node unavailable.'
}
function Resolve-Sid([string]$Account) {
  return ([Security.Principal.NTAccount]$Account).Translate([Security.Principal.SecurityIdentifier])
}
function New-ReadAcl($Sid, [bool]$Directory) {
  $acl = if ($Directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($entry in @(
    @([Security.Principal.SecurityIdentifier]'S-1-5-18', [Security.AccessControl.FileSystemRights]::FullControl),
    @([Security.Principal.SecurityIdentifier]'S-1-5-32-544', [Security.AccessControl.FileSystemRights]::FullControl),
    @($Sid, [Security.AccessControl.FileSystemRights]::ReadAndExecute))) {
    if ($Directory) {
      [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($entry[0],$entry[1],
        [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
    } else { [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($entry[0],$entry[1],[Security.AccessControl.AccessControlType]::Allow)) }
  }
  return $acl
}
function Publish-Bundle($Writes, $Sid) {
  $items = @()
  try {
    foreach ($write in $Writes) {
      $token = [guid]::NewGuid().ToString('N')
      $item = [pscustomobject]@{ Path=$write.Path; Temp="$($write.Path).$token.tmp"; Backup="$($write.Path).$token.bak"; Existed=(Test-Path $write.Path); Published=$false }
      $items += $item
      [IO.File]::WriteAllText($item.Temp, $write.Content, [Text.UTF8Encoding]::new($false))
    }
    foreach ($item in $items) {
      if ($item.Existed) { [IO.File]::Replace($item.Temp,$item.Path,$item.Backup) } else { [IO.File]::Move($item.Temp,$item.Path) }
      $item.Published=$true
    }
    foreach ($item in $items) { Set-Acl $item.Path (New-ReadAcl $Sid $false) }
  } catch {
    for ($i=$items.Count-1; $i -ge 0; $i--) {
      $item=$items[$i]; if (-not $item.Published) { continue }
      if ($item.Existed -and (Test-Path $item.Backup)) { [IO.File]::Replace($item.Backup,$item.Path,$null) }
      elseif (Test-Path $item.Path) { Remove-Item $item.Path -Force }
    }
    throw
  } finally {
    foreach ($item in $items) { foreach ($path in @($item.Temp,$item.Backup)) { if (Test-Path $path) { Remove-Item $path -Force } } }
  }
}

[ordered]@{ mode=if($Apply){'apply'}else{'plan'}; dpapiScope='CurrentUser'; passwordSource=if($UsePasswordFromClipboard){'clipboard'}else{'secure prompt'};
  validatesBeforeWrite=$true; databaseUser=$databaseUser; configAclFinal='taskUser ReadAndExecute'; plaintextOnDisk=$false } | ConvertTo-Json -Compress
if (-not $Apply) { exit 0 }
if (-not (Test-Path $config -PathType Container) -or -not (Test-Path $caPath -PathType Leaf)) { throw 'Operational provisioning is incomplete.' }
$node=Resolve-Node $NodePath; $sid=Resolve-Sid $TaskUser
try {
  if ($UsePasswordFromClipboard) {
    $plain=(Get-Clipboard -Raw).Trim(); if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Clipboard password is empty.' }
    $secure=ConvertTo-SecureString $plain -AsPlainText -Force
  } else { $secure=Read-Host 'Customer 360 BOLETA analytics runner password' -AsSecureString }
  $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  if ($null -eq $plain) { $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Runner password is empty.' }
  $settings=[ordered]@{ version=1; dpapiScope='CurrentUser'; databaseHost=$DatabaseHost; databasePort=$DatabasePort; databaseName=$DatabaseName;
    databaseUser=$databaseUser; caPath=$caPath; caSha256=(Get-FileHash $caPath -Algorithm SHA256).Hash;
    configUserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
  $url="postgresql://$([Uri]::EscapeDataString($databaseUser)):$([Uri]::EscapeDataString($plain))@${DatabaseHost}:$DatabasePort/${DatabaseName}?sslmode=verify-full&sslrootcert=$([Uri]::EscapeDataString($caPath))"
  $psi=[Diagnostics.ProcessStartInfo]::new(); $psi.FileName=$node; $psi.WorkingDirectory=Split-Path -Parent $PSScriptRoot
  $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
  $psi.Arguments='"'+$runner+'" --check-connection'; $psi.EnvironmentVariables['BOLETA_ANALYTICS_DATABASE_URL']=$url
  $proc=[Diagnostics.Process]::new(); $proc.StartInfo=$psi; [void]$proc.Start(); $out=$proc.StandardOutput.ReadToEnd(); $err=$proc.StandardError.ReadToEnd(); $proc.WaitForExit()
  try { $probe=$out.Trim() | ConvertFrom-Json } catch { throw 'Connection validation returned invalid output.' }
  if ($proc.ExitCode -ne 0 -or $probe.ok -ne $true -or $probe.privilegeContractValid -ne $true -or $probe.containsSecrets -ne $false) { throw 'Connection validation failed.' }
  $encrypted=ConvertFrom-SecureString $secure
  Publish-Bundle @([pscustomobject]@{Path=$passwordPath;Content=$encrypted},[pscustomobject]@{Path=$settingsPath;Content=($settings|ConvertTo-Json -Compress)}) $sid
  Set-Acl $config (New-ReadAcl $sid $true)
  Write-Host 'Encrypted runner configuration provisioned and validated.'
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($psi) { [void]$psi.EnvironmentVariables.Remove('BOLETA_ANALYTICS_DATABASE_URL') }
  if ($proc) { $proc.Dispose() }
  $plain=$null; $secure=$null; $url=$null; $out=$null; $err=$null
}
