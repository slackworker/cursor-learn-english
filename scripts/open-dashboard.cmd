@echo off
REM Windows desktop launcher: start WSL dashboard + open browser
set PORT=13180
set URL=http://localhost:%PORT%/

wsl bash ./scripts/open-dashboard.sh
if errorlevel 1 (
  echo Failed to start dashboard in WSL.
  pause
  exit /b 1
)

start "" "%URL%"
