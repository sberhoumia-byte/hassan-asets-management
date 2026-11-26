@echo off
setlocal
cd /d "%~dp0"
echo Demarrage du serveur Hassan Assets...
REM Demander les droits administrateur si necessaire (fenetre "Oui / Non")
net session >nul 2>&1
if errorlevel 1 (
  echo Une fenetre va demander l'autorisation : cliquez sur Oui.
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >> "%~dp0Hassan-lanceur-log.txt" 2>&1
  if errorlevel 1 (
    echo.
    echo L'autorisation a ete refusee ou a echoue. Relancez et cliquez sur Oui.
    pause
  )
  exit /b
)
echo [%date% %time%] lance en administrateur >> "%~dp0Hassan-lanceur-log.txt"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" 2>> "%~dp0Hassan-lanceur-log.txt"
echo [%date% %time%] fin, code %errorlevel% >> "%~dp0Hassan-lanceur-log.txt"
echo.
pause
