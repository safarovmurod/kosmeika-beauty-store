@echo off
setlocal
chcp 65001 >nul
title Create store administrator
cd /d "%~dp0"
node --import tsx server/create-admin.ts
echo.
pause
