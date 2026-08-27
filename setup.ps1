# ============================================================================
#  Job-radar · instalador guiado (Windows / PowerShell)
#  Uso:  .\setup.ps1
#  Deja el sistema levantado con un comando: crea el .env (con contraseñas
#  aleatorias), construye y arranca db + web + worker, y te da la URL.
#  Tras arrancar, entra en la web -> Config y pon tu perfil + una clave de IA.
# ============================================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "== Job-radar - setup ==" -ForegroundColor Cyan

# 1) Requisitos
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Docker no esta instalado. Instala Docker Desktop desde https://docs.docker.com/get-docker/ y reintenta." -ForegroundColor Red
  exit 1
}
try { docker compose version | Out-Null } catch {
  Write-Host "ERROR: falta 'docker compose' (Docker Compose v2)." -ForegroundColor Red
  exit 1
}

# 2) .env (no se pisa si ya existe)
function New-Rand([int]$n) {
  -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $n | ForEach-Object { [char]$_ })
}
if (Test-Path .env) {
  Write-Host "- .env ya existe, lo reutilizo."
} else {
  Write-Host "- Creando .env con contrasenas aleatorias..."
  Copy-Item .env.example .env
  $dbp = New-Rand 24
  $secret = New-Rand 48
  (Get-Content .env) `
    -replace '^DB_PASSWORD=.*', "DB_PASSWORD=$dbp" `
    -replace '^AUTH_SECRET=.*', "AUTH_SECRET=$secret" |
    Set-Content .env
  Write-Host "  contrasena de BD y AUTH_SECRET generados."
}

$webPort = (Select-String -Path .env -Pattern '^WEB_PORT=(.*)$').Matches.Groups[1].Value
if ([string]::IsNullOrWhiteSpace($webPort)) { $webPort = '3010' }

# 3) Arranque
Write-Host "- Construyendo y arrancando (db + web + worker)... la 1a vez tarda unos minutos."
docker compose up -d --build

# 4) Espera a que la web responda
Write-Host -NoNewline "- Esperando a la web"
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$webPort/" -UseBasicParsing -TimeoutSec 3 | Out-Null
    break
  } catch { Write-Host -NoNewline "."; Start-Sleep -Seconds 3 }
}
Write-Host ""

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " Listo. Abre:  http://127.0.0.1:$webPort"
Write-Host " Siguiente paso: entra en la pestana 'Config' y rellena:"
Write-Host "   - tu perfil, zona y portales"
Write-Host "   - UNA clave de IA (Groq y Gemini tienen plan gratuito)"
Write-Host " Tus ficheros (TABLERO, CSV, cartas) apareceran en:  .\salidas"
Write-Host " Para ver el estado:   docker compose ps"
Write-Host " Para parar:           docker compose down"
Write-Host "======================================================================" -ForegroundColor Green
