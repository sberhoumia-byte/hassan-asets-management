@echo off
echo Demarrage du serveur Hassan Assets...
echo Une fenetre va demander l'autorisation : cliquez sur Oui.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
if errorlevel 1 pause
