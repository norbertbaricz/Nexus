@echo off
setlocal
cd /d "%~dp0"
echo Stop Nexus before importing your personal community.
call npm run setup:community -- setup/community.json
if errorlevel 1 (
  echo Community import did not finish. Read the message above.
  pause
  exit /b 1
)
echo Start Nexus normally to open your server.
pause
