# Instalación y primeros pasos

Guía para dejar Job-radar funcionando desde cero. Dos caminos: **un comando** (Docker) o
**script guiado**. Ambos levantan lo mismo: base de datos + web (CRM) + worker (IA autónoma).

## Requisitos

- **Docker** + **Docker Compose v2** ([instalar](https://docs.docker.com/get-docker/)).
- Nada más. No necesitas Node, Postgres ni n8n en tu máquina: va todo en contenedores.

## Opción A — Script guiado (recomendado para empezar)

Crea el `.env` con contraseñas aleatorias, construye y arranca todo, y te da la URL.

**Linux / macOS**
```bash
git clone https://github.com/IvanjonasFC/Job-radar.git && cd Job-radar
chmod +x setup.sh && ./setup.sh
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/IvanjonasFC/Job-radar.git; cd Job-radar
.\setup.ps1
```

## Opción B — Un comando (Docker)

Si prefieres control manual:
```bash
git clone https://github.com/IvanjonasFC/Job-radar.git && cd Job-radar
cp .env.example .env          # edita DB_PASSWORD (y AUTH_SECRET si quieres login)
docker compose up -d --build  # db + web + worker
```

El esquema de la base de datos se carga **solo** la primera vez. Cuando termine, la web está en
**http://127.0.0.1:3010**.

## Configuración (todo desde la web)

No hace falta tocar ficheros de config. Abre la web → pestaña **Config** y rellena:

1. **Tu perfil** (experiencia, tecnologías) — la IA lo usa para puntuar y redactar.
2. **Zona, modalidades, portales y términos** de búsqueda.
3. **Una clave de IA** (Groq y Gemini tienen plan gratuito). Con una basta; el resto son *fallback*.

A partir de ahí el sistema obedece a esa configuración: el scraper, el scoring y la generación
leen todo de la BD. **No hay que redesplegar ni tocar código** para adaptarlo a otra persona o sector.

## Tu "vault" de resultados

El worker organiza todo en la carpeta **`./salidas`** (cámbiala con `EXPORT_DIR_HOST` en el `.env`).
Se crea sola al arrancar, con esta estructura:

```
salidas/
├─ _TABLERO.md            # panel general (estados, oportunidades, pipeline)
├─ candidaturas.csv       # export para Excel/Sheets
├─ _RECORDATORIOS.md      # entrevistas y seguimientos
├─ _SALUD.md              # healthcheck del sistema
├─ 01_Inbox/              # ofertas con carta+CV generados, por revisar
├─ 02_Postuladas/         # las que ya postulaste (se mueven aquí al aplicar)
└─ 03_Descartadas/        # las descartadas
```

Cada oferta es una subcarpeta con `_Oferta.md`, `Carta de presentacion.md` y `Ajustes CV.md`.
Puedes abrir `salidas/` con Obsidian o cualquier editor de Markdown.

> Si quieres regenerar la estructura a mano: `docker compose exec worker node src/cli.js init`.

## Comandos útiles

```bash
docker compose ps           # estado de los servicios
docker compose logs -f web  # logs de la web (o worker / db)
docker compose down         # parar
docker compose up -d        # arrancar de nuevo
```

Tareas del worker a demanda (sin esperar a los bucles):
```bash
docker compose exec worker node src/cli.js digest        # regenera TABLERO + CSV
docker compose exec worker node src/cli.js recordatorios  # recalcula recordatorios
docker compose exec worker node src/cli.js health         # healthcheck + caducar
```

## Extras opcionales

- **Scraper Python** (Indeed/LinkedIn, además del RSS del worker):
  `docker compose --profile scraper run --rm scraper`
- **Backups diarios** (pg_dump con retención de 7 días): `docker compose --profile backup up -d`
- **n8n** en lugar del worker: ver `automation/n8n/`. El worker cubre lo mismo salvo Telegram
  (detalle en [`automation/worker/PARIDAD-n8n.md`](automation/worker/PARIDAD-n8n.md)).

## Problemas frecuentes

- **El puerto 3010 está ocupado** → cambia `WEB_PORT` en el `.env` y `docker compose up -d`.
- **La web no puntúa/redacta** → falta la clave de IA en Config, o revisa `docker compose logs -f worker`.
- **No veo ficheros en `./salidas`** → asegúrate de que el worker arrancó (`docker compose ps`) y de
  que `EXPORT_FILES` no está a `0`.
