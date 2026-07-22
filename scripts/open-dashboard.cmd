@echo off
REM Windows desktop launcher: start WSL dashboard + open browser
set PORT=13180
set URL=http://localhost:%PORT%/

REM Resolve this script's directory in WSL without hardcoding user/path
for /f "usebackq delims=" %%i in (`wsl wslpath -a "%~dp0."`) do set "WSL_SCRIPT_DIR=%%i"
wsl bash "%WSL_SCRIPT_DIR%/open-dashboard.sh"
if errorlevel 1 (
  echo Failed to start dashboard in WSL.
  pause
  exit /b 1
)

start "" "%URL%"
