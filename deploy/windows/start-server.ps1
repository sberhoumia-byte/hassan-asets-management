#Requires -Version 5.1
<#
  Hassan Assets - one-click local server for Windows 10/11.
  Runs the system on this computer with Docker Desktop. Phones and other PCs on the
  same Wi-Fi connect to http://<this-PC-IP>:8080 .
  Secrets are generated on first run into .env (never commit it) and a copy of the
  setup token and backup key is written to the Desktop for the administrator.
#>
$ErrorActionPreference = 'Stop'
# Any unexpected error: show it and keep the window open, and keep a log on the Desktop.
$Log = Join-Path $PSScriptRoot 'Hassan-serveur-log.txt'
try { Start-Transcript -Path $Log -Append | Out-Null } catch {}
trap {
  Write-Host "`n!! ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "   (journal : $Log)" -ForegroundColor Red
  Read-Host "`nPrenez une photo de cette fenetre, puis appuyez sur Entree pour fermer"
  exit 1
}
$Port = 8080
$RuleName = 'Hassan Assets (port 8080)'

function Say($m)  { Write-Host "`n>> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`n!! $m" -ForegroundColor Red; Read-Host "`nAppuyez sur Entree pour fermer"; exit 1 }

# Administrator rights are needed once for the firewall rule (the .bat asks for them).
$me = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fail "Lancez Demarrer-serveur.bat (il demande l'autorisation administrateur)."
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
if (-not (Test-Path 'docker\docker-compose.yml')) { Fail "Fichiers du projet introuvables. Gardez ce fichier dans le dossier deploy\windows du projet." }

# 1) Docker Desktop
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say "Installation de Docker Desktop (quelques minutes)..."
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Fail "Docker Desktop est installe. Redemarrez l'ordinateur, ouvrez Docker Desktop une fois (acceptez les conditions), puis relancez ce fichier."
  }
  Start-Process 'https://www.docker.com/products/docker-desktop/'
  Fail "Installez Docker Desktop depuis la page ouverte, redemarrez, puis relancez ce fichier."
}

# Docker Desktop needs WSL 2.
& wsl.exe --status *> $null
if ($LASTEXITCODE -ne 0) {
  Say "Installation de WSL (necessaire a Docker, quelques minutes)..."
  & wsl.exe --install --no-distribution
  Fail "WSL est installe. REDEMARREZ l'ordinateur, ouvrez Docker Desktop, attendez qu'il soit pret, puis relancez ce fichier."
}

function DockerUp { & docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (DockerUp)) {
  $dd = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $dd) { Start-Process $dd }
  Say "Demarrage de Docker Desktop..."
  $ok = $false
  for ($i = 0; $i -lt 72; $i++) { Start-Sleep 5; if (DockerUp) { $ok = $true; break } }
  if (-not $ok) { Fail "Docker ne demarre pas. Ouvrez Docker Desktop manuellement, attendez qu'il soit pret, puis relancez." }
}

# 2) Adresse de ce PC sur le reseau local
$net = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $net) { Fail "Aucun reseau. Connectez l'ordinateur au Wi-Fi puis relancez." }
$Ip = @($net.IPv4Address)[0].IPAddress
$Url = "http://${Ip}:$Port"

# 3) Secrets (premier lancement seulement)
function RandHex([int]$n) {
  $b = New-Object byte[] $n
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}
$EnvFile = Join-Path $Root '.env'
if (-not (Test-Path $EnvFile)) {
  $setup = RandHex 12
  $bk = RandHex 24
  @(
    'POSTGRES_USER=hassan'
    'POSTGRES_DB=hassan_assets'
    "POSTGRES_PASSWORD=$(RandHex 24)"
    "JWT_ACCESS_SECRET=$(RandHex 32)"
    "JWT_REFRESH_SECRET=$(RandHex 32)"
    "SETUP_TOKEN=$setup"
    "BACKUP_ENCRYPTION_KEY=$bk"
    'BACKUP_DAILY_HOUR=13'
    "WEB_ORIGIN=$Url"
    'COOKIE_SECURE=false'
    "WEB_PORT=$Port"
  ) | Set-Content -Path $EnvFile -Encoding ASCII
}
# L'adresse du PC peut changer : on la met a jour a chaque lancement.
(Get-Content $EnvFile) -replace '^WEB_ORIGIN=.*', "WEB_ORIGIN=$Url" | Set-Content -Path $EnvFile -Encoding ASCII
$vals = @{}
Get-Content $EnvFile | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $vals[$Matches[1]] = $Matches[2] } }

# 4) Pare-feu : autoriser les telephones du reseau local
if ((Get-NetConnectionProfile -InterfaceIndex $net.InterfaceIndex).NetworkCategory -eq 'Public') {
  Say "Le reseau Wi-Fi est en mode Public : passage en mode Prive pour que le telephone puisse se connecter."
  Set-NetConnectionProfile -InterfaceIndex $net.InterfaceIndex -NetworkCategory Private
}
if (-not (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private,Domain | Out-Null
}

# 5) Construction et demarrage
Say "Construction et demarrage du systeme (la premiere fois : 10 a 20 minutes)..."
& docker compose -f docker/docker-compose.yml --env-file .env up -d --build
if ($LASTEXITCODE -ne 0) { Fail "Echec du demarrage. Verifiez la connexion Internet puis relancez." }

Say "Attente du serveur..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:$Port/api/v1/health").Content -match '"ok"') { $ready = $true; break } } catch {}
  Start-Sleep 5
}
if (-not $ready) { Fail "Le serveur ne repond pas. Relancez ce fichier ; si le probleme continue, envoyez une capture d'ecran." }

# 6) Fiche pour l'administrateur (sur le Bureau)
$info = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hassan-serveur.txt'
$text = @"
نظام التدبير المادي — مدرسة حسان بن ثابت
==========================================
عنوان الخادم (اكتبه في تطبيق الهاتف):  $Url
يجب أن يكون الهاتف متصلاً بنفس شبكة Wi-Fi، وأن يبقى هذا الحاسوب مشغّلاً.

رمز الإعداد الأول (SETUP_TOKEN):  $($vals['SETUP_TOKEN'])
مفتاح تشفير النسخ الاحتياطية:      $($vals['BACKUP_ENCRYPTION_KEY'])
احتفظ بهذه المعلومات في مكان آمن (ورقة أو مفتاح USB). دون مفتاح التشفير لا يمكن استعادة أي نسخة احتياطية.
"@
[IO.File]::WriteAllText($info, $text, (New-Object Text.UTF8Encoding $true))
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'Hassan-serveur.txt'), $text, (New-Object Text.UTF8Encoding $true))

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host "  Serveur pret :  $Url" -ForegroundColor Green
Write-Host "  (fiche enregistree sur le Bureau : Hassan-serveur.txt)" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Start-Process notepad.exe $info
Start-Process "http://localhost:$Port"
Read-Host "`nAppuyez sur Entree pour fermer (le serveur continue de fonctionner)"
