# OpenChamber RU Uninstaller (PowerShell)
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
  $p = "$env:LOCALAPPDATA\Programs\@openchamberelectron\resources\web-dist\assets"
  if (Test-Path $p) { return $p }
  return $null
}

$node = Find-Node
if (-not $node) {
  Write-Host "[ru-installer] Node.js not found." -ForegroundColor Red
  exit 1
}

$assets = Find-Assets -Hint $Assets
if (-not $assets) {
  Write-Host "[ru-installer] Could not locate OpenChamber install." -ForegroundColor Red
  exit 1
}

& $node "$ScriptDir\patch\openchamber-ru-patch.mjs" uninstall $assets
exit $LASTEXITCODE
