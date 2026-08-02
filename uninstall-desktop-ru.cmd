@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title OpenChamber RU Uninstaller

set "SCRIPT_DIR=%~dp0"

set "NODE_CMD="
for %%p in (node.exe) do set "NODE_CMD=%%~$PATH:p"
if not defined NODE_CMD (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
)
if not defined NODE_CMD (
  echo [ru-installer] Node.js not found.
  pause
  exit /b 1
)

set "ASSETS=%~1"
if not defined ASSETS (
  if exist "%LOCALAPPDATA%\Programs\@openchamberelectron\resources\web-dist\assets" (
    set "ASSETS=%LOCALAPPDATA%\Programs\@openchamberelectron\resources\web-dist\assets"
  )
)
if not defined ASSETS (
  echo [ru-installer] Could not locate the OpenChamber install.
  echo Usage: uninstall-desktop-ru.cmd [path-to-openchamber\resources\web-dist\assets]
  pause
  exit /b 1
)

echo [ru-installer] Assets: %ASSETS%
"%NODE_CMD%" "%SCRIPT_DIR%patch\openchamber-ru-patch.mjs" uninstall "%ASSETS%"
pause
