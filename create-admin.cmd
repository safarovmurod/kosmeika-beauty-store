@echo off
setlocal
cd /d "%~dp0"
call npm run admin:create
echo.
pause
