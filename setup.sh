#!/usr/bin/env bash
# ============================================================================
#  Job-radar · instalador guiado (Linux/macOS)
#  Uso:  ./setup.sh
#  Deja el sistema levantado con un comando: crea el .env (con contraseñas
#  aleatorias), construye y arranca db + web + worker, y te da la URL.
#  Tras arrancar, entra en la web -> Config y pon tu perfil + una clave de IA.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "== Job-radar · setup =="

# 1) Requisitos
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker no está instalado. Instálalo desde https://docs.docker.com/get-docker/ y reintenta."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: falta 'docker compose' (Docker Compose v2)."
  exit 1
fi

# 2) .env (no se pisa si ya existe)
if [ -f .env ]; then
  echo "· .env ya existe, lo reutilizo."
else
  echo "· Creando .env con contraseñas aleatorias..."
  rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"; }
  cp .env.example .env
  DBP="$(rand 24)"; SECRET="$(rand 48)"
  # sustituye los valores por defecto
  sed -i.bak "s/^DB_PASSWORD=.*/DB_PASSWORD=${DBP}/" .env
  if grep -q '^AUTH_SECRET=' .env; then sed -i.bak "s/^AUTH_SECRET=.*/AUTH_SECRET=${SECRET}/" .env; fi
  rm -f .env.bak
  echo "  contraseña de BD y AUTH_SECRET generados."
fi

WEB_PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2 | tr -d '[:space:]' || true)"
WEB_PORT="${WEB_PORT:-3010}"

# 3) Arranque
echo "· Construyendo y arrancando (db + web + worker)... esto puede tardar unos minutos la 1ª vez."
docker compose up -d --build

# 4) Espera a que la web responda
echo -n "· Esperando a la web"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 3
done
echo

echo
echo "======================================================================"
echo " Listo. Abre:  http://127.0.0.1:${WEB_PORT}"
echo " Siguiente paso: entra en la pestaña 'Config' y rellena:"
echo "   · tu perfil, zona y portales"
echo "   · UNA clave de IA (Groq y Gemini tienen plan gratuito)"
echo " Tus ficheros (TABLERO, CSV, cartas) aparecerán en:  ./salidas"
echo " Para ver el estado:   docker compose ps"
echo " Para parar:           docker compose down"
echo "======================================================================"
