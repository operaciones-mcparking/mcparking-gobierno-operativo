#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Apply, [string]$TaskUser = "$env:USERDOMAIN\$env:USERNAME")

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'C:\ProgramData\McParking\Customer360BoletaAnalytics'
$sourceCa = 'C:\Temp\supabase-ca.crt'
$paths = @($root, (Join-Path $root 'config'), (Join-Path $root 'certs'),
  (Join-Path $root 'logs'), (Join-Path $root 'state'))
$destinationCa = Join-Path $root 'certs\supabase-ca.crt'

function Resolve-Sid([string]$Account) {
  return ([Security.Principal.NTAccount]$Account).Translate([Security.Principal.SecurityIdentifier])
}
function New-DirectoryAcl($Sid, [Security.AccessControl.FileSystemRights]$Rights) {
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  foreach ($entry in @(
    @([Security.Principal.SecurityIdentifier]'S-1-5-18', [Security.AccessControl.FileSystemRights]::FullControl),
    @([Security.Principal.SecurityIdentifier]'S-1-5-32-544', [Security.AccessControl.FileSystemRights]::FullControl),
    @($Sid, $Rights))) {
    [void]$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $entry[0], $entry[1], $inherit, [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow))
  }
  return $acl
}

[ordered]@{
  mode = if ($Apply) { 'apply' } else { 'plan' }
  root = $root; taskUser = $TaskUser; certificateSource = $sourceCa; certificateDestination = $destinationCa
  acl = [ordered]@{ system = 'FullControl'; administrators = 'FullControl';
    taskUserFinal = 'root/config/certs: ReadAndExecute; logs/state: Modify'; inheritance = 'disabled' }
} | ConvertTo-Json -Depth 4
if (-not $Apply) { exit 0 }

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Apply requires elevation.' }
if (-not (Test-Path -LiteralPath $sourceCa -PathType Leaf)) { throw 'Source CA is unavailable.' }
$sid = Resolve-Sid $TaskUser
foreach ($path in $paths) {
  [void](New-Item -ItemType Directory -Force -Path $path)
  $rights = if ((Split-Path -Leaf $path) -in @('logs','state')) {
    [Security.AccessControl.FileSystemRights]::Modify
  } else { [Security.AccessControl.FileSystemRights]::ReadAndExecute }
  Set-Acl -LiteralPath $path -AclObject (New-DirectoryAcl $sid $rights)
}
$temporary = "$destinationCa.$([guid]::NewGuid().ToString('N')).tmp"
$backup = "$destinationCa.$([guid]::NewGuid().ToString('N')).bak"
try {
  Copy-Item -LiteralPath $sourceCa -Destination $temporary
  if ((Get-FileHash $sourceCa -Algorithm SHA256).Hash -ne (Get-FileHash $temporary -Algorithm SHA256).Hash) {
    throw 'CA hash mismatch.'
  }
  if (Test-Path -LiteralPath $destinationCa -PathType Leaf) { [IO.File]::Replace($temporary, $destinationCa, $backup) }
  else { [IO.File]::Move($temporary, $destinationCa) }
} finally {
  foreach ($path in @($temporary,$backup)) { if (Test-Path -LiteralPath $path) { Remove-Item $path -Force } }
}
Write-Host 'BOLETA analytics operational paths provisioned.'
