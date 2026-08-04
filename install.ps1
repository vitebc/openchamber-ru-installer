# OpenChamber RU installer — self-contained one-liner entry point (PowerShell).
#
#   irm https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install.ps1 | iex
#   irm https://raw.githubusercontent.com/vitebc/openchamber-ru-installer/main/install.ps1 | iex   # with $env:OC_ASSETS set to the assets dir
#
# Downloads the patcher + Russian dictionary from the repo into a temp dir and
# applies them to a detected (or env-provided) OpenChamber web UI assets dir.

$ErrorActionPreference = 'Stop'

$Repo   = 'vitebc/openchamber-ru-installer'
$Base   = "https://raw.githubusercontent.com/$Repo/main"
$Mode   = 'install'
$EnvAssets = $env:OC_ASSETS

if ($args -contains '--uninstall') { $Mode = 'uninstall' }

function Get-Node {
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
    "$env:LOCALAPPDATA\Programs\@openchamberelectron\resources\web-dist\assets",
    "$env:APPDATA\npm\node_modules\@openchamber\web\dist\assets",
    "$env:APPDATA\npm\node_modules\openchamber\dist\assets",
    "$PWD\node_modules\@openchamber\web\dist\assets",
    "$PWD\node_modules\openchamber\dist\assets"
  )
  $npmRoot = & npm root -g 2>$null
  if ($npmRoot) {
    $paths += "$npmRoot\@openchamber\web\dist\assets"
    $paths += "$npmRoot\openchamber\dist\assets"
  }
  $reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like '*OpenChamber*' }
  foreach ($r in $reg) {
    if ($r.InstallLocation -and (Test-Path "$($r.InstallLocation)\resources\web-dist\assets")) {
      return "$($r.InstallLocation)\resources\web-dist\assets"
    }
  }
  foreach ($p in $paths) {
    if ((Test-Path $p) -and (Get-ChildItem "$p\useAppFontEffects-*.js" -ErrorAction SilentlyContinue)) {
      return $p
    }
  }
  return $null
}

$node = Get-Node
if (-not $node) {
  Write-Host '[ru-installer] ERROR: Node.js not found. Install it from https://nodejs.org/ and retry.' -ForegroundColor Red
  exit 1
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('oc-ru-' + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  Write-Host "[ru-installer] downloading patcher from $Repo..."
  Invoke-WebRequest -UseBasicParsing "$Base/patch/openchamber-ru-patch.mjs" -OutFile (Join-Path $tmp 'openchamber-ru-patch.mjs')
  Invoke-WebRequest -UseBasicParsing "$Base/patch/ru-ruinstaller.js" -OutFile (Join-Path $tmp 'ru-ruinstaller.js')
} catch {
  Write-Host "[ru-installer] ERROR: failed to download patcher: $_" -ForegroundColor Red
  exit 1
}

$assets = Find-Assets -Hint $EnvAssets
if (-not $assets) {
  Write-Host '[ru-installer] ERROR: OpenChamber install not found.' -ForegroundColor Red
  Write-Host 'Set the assets dir and retry:' -ForegroundColor Yellow
  Write-Host '  $env:OC_ASSETS = "C:\Path\to\@openchamberelectron\resources\web-dist\assets"; irm <url> | iex' -ForegroundColor Yellow
  exit 1
}
Write-Host "[ru-installer] Assets: $assets"

& $node (Join-Path $tmp 'openchamber-ru-patch.mjs') $Mode $assets
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Mode -eq 'install') {
  Write-Host 'Next: fully quit OpenChamber (tray icon -> Quit), start it again, then Settings -> Appearance -> Language -> Russian.'
} else {
  Write-Host 'Done. Original files restored.'
}
