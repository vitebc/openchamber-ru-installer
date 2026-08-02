# OpenChamber RU Installer (PowerShell)
param([string]$Assets)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Node {
  $candidates = @(
    (Get-Command node -ErrorAction SilentlyContinue).Source,
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  return $null
}

function Find-Assets {
  param([string]$Hint)
  if ($Hint) { return $Hint }
  $paths = @(
    "$env:LOCALAPPDATA\Programs\@openchamberelectron\resources\web-dist\assets"
  )
  $reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like '*OpenChamber*' }
  foreach ($r in $reg) {
    if ($r.InstallLocation -and (Test-Path "$($r.InstallLocation)\resources\web-dist\assets")) {
      return "$($r.InstallLocation)\resources\web-dist\assets"
    }
  }
  foreach ($p in $paths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

$node = Find-Node
if (-not $node) {
  Write-Host "[ru-installer] Node.js not found. Install it from https://nodejs.org/ and retry." -ForegroundColor Red
  exit 1
}

$assets = Find-Assets -Hint $Assets
if (-not $assets) {
  Write-Host "[ru-installer] Could not locate OpenChamber install." -ForegroundColor Red
  Write-Host "Usage: .\install-desktop-ru.ps1 [-Assets <path-to-assets>]" -ForegroundColor Yellow
  exit 1
}

& $node "$ScriptDir\patch\openchamber-ru-patch.mjs" install $assets
exit $LASTEXITCODE
