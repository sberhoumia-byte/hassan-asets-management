@echo off
REM Installe WSL (necessaire a Docker Desktop), puis demande un redemarrage.
net session >nul 2>&1
if errorlevel 1 (
  echo Une fenetre va demander l'autorisation : cliquez sur Oui.
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo Installation de WSL (quelques minutes, ne fermez pas cette fenetre)...
echo.
wsl --install --no-distribution
echo.
echo ===========================================================
echo  Termine. REDEMARREZ l'ordinateur maintenant.
echo  Apres le redemarrage : ouvrez Docker Desktop, attendez
echo  qu'il soit pret, puis double-cliquez Demarrer-serveur-Hassan.bat
echo ===========================================================
pause
