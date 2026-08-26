# Empleo CRM

CRM web **self-hosted** para automatizar y centralizar la búsqueda de empleo. Reúne en un solo sitio las ofertas detectadas, su puntuación por IA, la carta y los ajustes de CV generados, y el seguimiento de cada candidatura (kanban + recordatorios). Construido con **Astro SSR** sobre una base de datos **PostgreSQL** que actúa como **única fuente de verdad**.

> Pensado para ayudarte a **actuar**, no solo a informarte: la pantalla de inicio es una "cola de hoy" con las mejores ofertas abiertas que aún no has postulado.

![Estado](https://img.shields.io/badge/estado-beta-orange) ![Licencia](https://img.shields.io/badge/licencia-MIT-blue)

> 📘 **¿Instalas desde cero o quieres entender el sistema a fondo?** Empieza por la carpeta **[`Instalacion/`](./Instalacion/)** — cómo funciona, base de datos, flujos, y dónde tocar cada cosa.

---

## ✨ Qué hace

| Página | Para qué |
|---|---|
| **Hoy** | Cola diaria: mejores ofertas abiertas, frescas y sin postular + KPIs accionables. |
| **Ofertas** | Tabla filtrable (encaje, estado, modalidad, texto) con ubicación normalizada y marca 📍 para ofertas locales. |
| **Pipeline** | Kanban con arrastrar-y-soltar (Abiertas → CV → Postuladas → Entrevista → Resuelta) + recordatorios de entrevistas y próximas acciones. |
| **Config** | Define tu zona, modalidades aceptadas dentro/fuera de ella, score mínimo, fuentes de scraping, palabras clave y **tu perfil** (nombre, contacto y CV que usa la IA) — todo guardado en la BD y aplicado al instante. Sin tocar código ni el vault. |
| **Analíticas** | Embudo de conversión (detección → oferta), actividad por semana, tecnologías más pedidas, tasa y velocidad de respuesta, tu tiempo de reacción, conversión por encaje/fuente/modalidad y salud del sistema. |
| **Ficha de oferta** | Por qué encaja (veredicto + razones + keywords), carta editable/copiable, ajustes de CV, y documentos IA (prep entrevista, análisis de carencias). |

Características transversales:

- **Ubicación robusta:** normaliza las cadenas sucias de los portales (códigos `MD`→Madrid, `remote`→Remoto…) y resalta las ofertas cercanas.
- **Ciclo de vida completo:** `nueva → evaluada → notificada → generada → aplicada` (+ `descartada` / `caducada`).
- **Limpieza automática** de ofertas antiguas (marcado, sin borrado físico).
- **Estética dark** con acento naranja, tipografías Space Grotesk + Inter y glass.

---

## 🧱 Stack

- **[Astro](https://astro.build) 5** en modo servidor (`output: 'server'`, adaptador `@astrojs/node` standalone).
- **React 19** para las islas interactivas (kanban).
- **Tailwind CSS 4** (tema en `src/styles/global.css`).
- **PostgreSQL** vía [`postgres.js`](https://github.com/porsager/postgres) (SQL parametrizado; drizzle-orm disponible para tipado).
- Fuentes servidas desde [Bunny Fonts](https://fonts.bunny.net) (sin dependencias npm).

---

## 🏗️ Arquitectura

```
┌─────────────┐    inserta ofertas     ┌──────────────────┐
│  Scraper /  │ ─────────────────────► │                  │
│  n8n (IA)   │    puntúa, genera      │   PostgreSQL     │  ◄── fuente de verdad única
└─────────────┘ ◄───────────────────── │   (schema empleo)│
      ▲            webhooks (opcional)  └──────────────────┘
      │                                          ▲
      │ botones "aplicar / generar / IA"         │ lee y escribe
      │                                          │
┌─────┴───────────────────────────────────────── ┴──┐
│              Empleo CRM (este repo)                │
│   Astro SSR · React · Tailwind · postgres.js       │
└────────────────────────────────────────────────────┘
```

El CRM **no tiene BD propia**: lee y escribe directamente sobre `empleo`. La ingesta de ofertas y la IA (puntuación, generación de carta/CV) son **opcionales** y externas (un scraper, n8n, o lo que prefieras). Si solo quieres el CRM, puedes insertar ofertas a mano en `empleo.job_offers`.

---

## 🚀 Puesta en marcha

> ¿Quieres adaptarlo a tu perfil (marca, zona, portales, rúbrica de IA)? Todo lo personalizable está en **[docs/CONFIGURACION.md](./docs/CONFIGURACION.md)**.

### ⚡ Opción rápida: todo con un comando (Docker)

Levanta **Postgres + web + worker (IA)** de una vez. No necesitas n8n ni el scraper Python.

```bash
cp .env.example .env          # pon al menos DB_PASSWORD (y APP_PASSWORD si publicas)
docker compose up -d --build
# abre http://localhost:3010 → Config → IA: pega tu clave (Groq/Gemini/xAI). Con una basta.
```

Perfiles opcionales: `docker compose --profile scraper up -d` (añade Indeed/LinkedIn) y
`docker compose --profile backup up -d` (backups diarios `pg_dump` a `./backups`). Ponlo siempre tras un
**reverse proxy** con TLS; no expongas el puerto a internet.

> El resto de esta sección es el montaje **manual** (sin Docker), por si lo prefieres.

### Requisitos (manual)

- **Node 20+** y una instancia de **PostgreSQL 14+**.

### 1. Base de datos

```bash
# Crea la BD y aplica el esquema (crea schema, tablas, índices y el rol empleo_web)
createdb empleo
psql "postgres://ADMIN:PASS@localhost:5432/empleo" -f db/schema.sql
```

Edita `db/schema.sql` y cambia la contraseña del rol `empleo_web` (`CHANGE_ME`) antes de aplicarlo, o cámbiala después con `ALTER ROLE empleo_web PASSWORD '...';`.

### 2. Variables de entorno

```bash
cp .env.example .env
# Edita .env y pon tu DATABASE_URL
```

| Variable | Obligatoria | Descripción |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Conexión a Postgres. El `search_path=empleo` va en la URL. |
| `N8N_WEBHOOK_BASE` | ❌ | Base del webhook de n8n para acciones IA. Vacío = botones IA inactivos. |
| `PORT` | ❌ | Puerto del servidor (por defecto `3010`). |

### 3. Desarrollo

```bash
npm install
npm run dev        # http://localhost:3010
```

### 4. Producción

```bash
npm run build
npm run start      # sirve dist/server/entry.mjs
```

### 5. Docker

Ver la **opción rápida** al principio de esta sección (`docker compose up -d --build`, incluye Postgres + web + worker).

### 6. Primer arranque (configura desde la web)

Abre la web y ve a **Config**. Desde ahí, sin tocar código, defines:

- **Tu zona** (ciudades locales) y qué modalidades aceptas dentro y fuera de ella.
- **Fuentes de scraping**: portales, países, puestos, antigüedad — el scraper los lee de la BD.
- **Tu perfil**: nombre, contacto y CV que la IA usa para cartas y prep de entrevista.
- **Preferencias**: score mínimo de la "cola de hoy" y marca de la cabecera.

Todo se guarda en `empleo.settings` y se aplica al instante. Es el único paso que necesita un usuario nuevo para adaptar el sistema a su caso.

---

## 🗂️ Estructura del proyecto

```
app/
├── db/
│   ├── schema.sql              # esquema consolidado + rol de solo-web
│   └── retention.sql           # mantenimiento opcional (índices, retención, particionado)
├── src/
│   ├── components/
│   │   └── KanbanBoard.tsx     # kanban React (drag & drop)
│   ├── layouts/
│   │   └── Base.astro          # cabecera glass + navegación
│   ├── lib/
│   │   ├── db.ts               # cliente Postgres (postgres.js)
│   │   ├── queries.ts          # consultas de lectura
│   │   └── loc.ts              # normalización de ubicación/modalidad
│   ├── pages/
│   │   ├── index.astro         # "Hoy" (cola diaria + KPIs)
│   │   ├── ofertas/            # tabla + ficha [id]
│   │   ├── pipeline.astro      # kanban + recordatorios
│   │   ├── analiticas.astro    # métricas
│   │   └── api/                # endpoints SSR (mover, aplicar, limpiar, carta…)
│   └── styles/global.css       # tema (Tailwind 4 @theme)
├── automation/                # capa opcional de ingesta + IA (ver su README)
│   ├── worker/                # motor IA autónomo (Node) — alternativa ligera a n8n
│   ├── scraper/               # recolector de ofertas (JobSpy + RSS)
│   └── n8n/                   # flujos wf1–wf7 + profile.example.md
├── .env.example
├── docker-compose.yml          # despliegue 3 piezas: db + web + worker (docker compose up)
├── Dockerfile
└── astro.config.mjs
```

---

## 🔌 Motor de IA: worker autónomo **o** n8n (elige)

Los botones **Aplicar**, **Generar CV**, **Analizar** y los documentos IA hacen `POST` a `${N8N_WEBHOOK_BASE}/...`. Ese destino puede ser:

- **Worker autónomo** ([`automation/worker/`](./automation/worker/)) — un servicio Node ligero (solo `pg`) que puntúa, redacta y (opcional) ingesta RSS. Reduce el sistema a **3 piezas: Postgres + web + worker**, sin n8n ni pasarelas. Apunta `N8N_WEBHOOK_BASE=http://empleo-worker:8080/empleo` y listo. **La forma más rápida de que cualquiera lo despliegue.**
- **n8n** ([`automation/n8n/`](./automation/)) — los 7 flujos, para quien además quiera Telegram, escritura en Obsidian y automatizaciones visuales.

Puedes usar **uno, otro, o los dos a la vez** (ambos leen la config y escriben la misma BD). Sin ninguno, el CRM sigue siendo un gestor manual (kanban, notas, estados). El esquema es agnóstico del origen: cualquier proceso que inserte en `empleo.job_offers` alimenta el CRM.

**Claves de IA:** se ponen en la pestaña **Config → IA** de la web (o en el `.env` del worker). Con una (p. ej. Groq) basta; el resto es fallback. Todo con placeholders en el repo — ningún dato ni clave real.

---

## 🔒 Seguridad

- El rol `empleo_web` tiene **privilegios mínimos**: `SELECT` en todo, `INSERT/UPDATE` solo en las tablas del CRM y `UPDATE` de columnas concretas en `job_offers`.
- **Login opcional**: define `APP_PASSWORD` (y un `AUTH_SECRET` aleatorio) para exigir contraseña; déjalo vacío para acceso abierto en LAN/VPN.
- `.env` está en `.gitignore`. **Nunca** subas credenciales al repo.
- Mantén el puerto tras un proxy con TLS y autenticación si lo publicas.

---

## 📄 Licencia

MIT — ver [LICENSE](./LICENSE). Úsalo, modifícalo y adáptalo a tu búsqueda.
