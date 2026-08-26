# 1 · Requisitos e instalación

## Requisitos

| Pieza | Versión | Para qué |
|---|---|---|
| **PostgreSQL** | 14+ | Base de datos (núcleo). |
| **Node.js** | 20+ | Ejecutar la web (Astro SSR). |
| **Docker** | opcional | Levantar todo en contenedores. |
| **n8n** | opcional | IA: puntuación y generación de cartas/CV. |
| **Python** | 3.11+ (opcional) | El scraper de ofertas. |

Lo mínimo para tener el CRM en marcha es **Postgres + Node**. El scraper y n8n se añaden después.

---

## Opción A — Local (desarrollo)

```bash
# 1. Base de datos: crea la BD y aplica el esquema
createdb empleo
psql "postgres://ADMIN:PASS@localhost:5432/empleo" -f db/schema.sql

# 2. Variables de entorno
cp .env.example .env
#   edita .env → DATABASE_URL con tu usuario/host

# 3. Dependencias y arranque
npm install
npm run dev            # http://localhost:3010
```

> El esquema (`db/schema.sql`) crea el schema `empleo`, todas las tablas y el rol `empleo_web` con contraseña `CHANGE_ME`. Cámbiala antes de nada (ver [doc 2](./02-Base-de-datos.md)).

## Opción B — Producción (Node)

```bash
npm run build
npm run start          # sirve dist/server/entry.mjs (puerto 3010)
```

Ponlo **siempre tras un reverse proxy** (Caddy, Nginx, Traefik) con TLS. No expongas el 3010 directo a internet.

## Opción C — Docker

```bash
cp docker-compose.example.yml docker-compose.yml
#   ajusta credenciales y DATABASE_URL
docker compose up -d --build
```

El compose de ejemplo levanta un Postgres (con el esquema aplicado al arrancar) + la web. Si ya tienes Postgres, borra el servicio `db` y apunta `DATABASE_URL` al tuyo.

---

## Variables de entorno (`.env`)

| Variable | Obligatoria | Descripción |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Conexión a Postgres. El `search_path=empleo` va en la URL. |
| `N8N_WEBHOOK_BASE` | ❌ | Base del webhook de n8n para los botones IA. Vacío = botones IA inactivos (el CRM sigue siendo un gestor manual). |
| `PORT` | ❌ | Puerto del servidor (por defecto `3010`). |
| `APP_PASSWORD` | ❌ | Si la defines, la web pide contraseña para entrar. Vacío = acceso abierto (solo recomendable en LAN/VPN). |
| `AUTH_SECRET` | ❌ | Cadena larga y aleatoria para firmar la sesión de login. Obligatoria si usas `APP_PASSWORD`. |

---

## Primer arranque: configúralo desde la web

Abre la web y ve a **Config**. Sin tocar código defines:

1. **Tu zona** (ciudades locales) y qué modalidades aceptas dentro y fuera de ella.
2. **Fuentes de scraping**: portales, países, puestos, antigüedad (los lee el scraper).
3. **Tu perfil**: nombre, contacto y CV que usa la IA.
4. **Preferencias**: score mínimo de la "cola de hoy" y marca de la cabecera.

Al guardar, el panel de KPIs de arriba te dice cuántas ofertas **encajan** con esa config. Es el único paso que necesita un usuario nuevo para adaptar el sistema a su caso.

> Detalle de cada ajuste y qué lo consume: [doc 4 · Cómo y dónde hacer cambios](./04-Como-y-donde-hacer-cambios.md).
