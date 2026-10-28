@echo off
setlocal
cd /d "%~dp0"
node scripts\require-node.js
if errorlevel 1 goto failed
echo Stop Nexus before importing your personal community.
node --env-file-if-exists=.env scripts\setup-community.js setup/community.json
if errorlevel 1 goto failed
echo Start Nexus normally to open your server.
pause
exit /b 0
:failed
echo Community import did not finish. Read the message above.
pause
exit /b 1
