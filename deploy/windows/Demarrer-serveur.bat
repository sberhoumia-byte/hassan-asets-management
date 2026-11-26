@echo off
REM تشغيل خادم نظام التدبير المادي على هذا الحاسوب
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
