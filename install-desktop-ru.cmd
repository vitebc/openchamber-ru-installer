@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title OpenChamber RU Installer

set "SCRIPT_DIR=%~dp0"

rem --- find node ---
set "NODE_CMD="
for %%p in (node.exe) do set "NODE_CMD=%%~$PATH:p"
if not defined NODE_CMD (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
)
if not defined NODE_CMD (
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)
if not defined NODE_CMD (
  echo [ru-installer] Node.js not found.
  echo Install it from https://nodejs.org/ then run this script again.
  pause
  exit /b 1
)

rem --- find assets dir ---
set "ASSETS=%~1"
if not defined ASSETS (
  if exist "%LOCALAPPDATA%\Programs\@openchamberelectron\resources\web-dist\assets" (
    set "ASSETS=%LOCALAPPDATA%\Programs\@openchamberelectron\resources\web-dist\assets"
  )
)
if not defined ASSETS (
  rem registry fallback
  for /f "skip=2 tokens=2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "OpenChamber" /d 2^>nul ^| findstr /i "InstallLocation"') do (
    if exist "%%B\resources\web-dist\assets" set "ASSETS=%%B\resources\web-dist\assets"
  )
)
if not defined ASSETS (
  echo [ru-installer] Could not locate the OpenChamber install.
  echo Usage: install-desktop-ru.cmd [path-to-openchamber\resources\web-dist\assets]
  pause
  exit /b 1
)

echo [ru-installer] Assets: %ASSETS%
"%NODE_CMD%" "%SCRIPT_DIR%patch\openchamber-ru-patch.mjs" install "%ASSETS%"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Next: fully quit OpenChamber (tray icon -^> Quit), start it again,
  echo then open Settings -^> Appearance -^> Language -^> Russian.
) else (
  echo Something failed. A .bak backup was kept if patching started.
)
pause
exit /b %RC%
