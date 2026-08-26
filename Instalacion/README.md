# Instalación y funcionamiento del sistema

Guía completa para **entender, instalar y adaptar** el CRM de búsqueda de empleo desde cero. Pensada tanto para levantarlo por primera vez como para saber **dónde tocar** cada cosa cuando quieras cambiarla.

## Índice

1. [Requisitos e instalación](./01-Requisitos-e-instalacion.md) — qué necesitas y cómo levantar la web (local o Docker).
2. [Base de datos](./02-Base-de-datos.md) — el esquema explicado tabla por tabla, permisos y backups.
3. [Automatización: scraper + n8n](./03-Automatizacion-flujos-scraper.md) — de dónde salen las ofertas y cómo la IA puntúa y redacta.
4. [Cómo y dónde hacer cambios](./04-Como-y-donde-hacer-cambios.md) — mapa "quiero cambiar X → se toca aquí".
5. [Mantenimiento y problemas](./05-Mantenimiento-y-problemas.md) — salud del sistema, backups y fallos comunes.

---

## Qué es y cómo funciona (visión de conjunto)

Un **CRM self-hosted** que centraliza toda la búsqueda de empleo: detecta ofertas, las puntúa con IA según tu encaje, genera cartas y ajustes de CV, y te ayuda a hacer seguimiento de cada candidatura. Todo gira alrededor de **una única base de datos PostgreSQL** que es la fuente de verdad; cada pieza lee y escribe ahí.

```
        ┌───────────────┐        ┌──────────────────────┐
        │  Scraper      │        │  n8n (flujos wf1–wf7) │
        │  (JobSpy+RSS) │        │  IA: puntúa · redacta │
        └──────┬────────┘        └──────────┬───────────┘
               │  insert ofertas            │  score, carta, CV, avisos
               ▼                            ▼
        ┌──────────────────────────────────────────────┐
        │        PostgreSQL · schema `empleo`           │  ◄── única fuente de verdad
        │  job_offers · applications · generated ·      │
        │  ai_docs · settings · events                  │
        └──────────────────────────────────────────────┘
               ▲                            ▲
               │  lee config / escribe estado (aplicar, mover, notas, carta)
               ▼                            │
        ┌──────────────────────────────────────────────┐
        │        CRM web (Astro SSR)                    │
        │  Hoy · Ofertas · Pipeline · Analíticas · Config│
        └──────────────────────────────────────────────┘
```

### Las tres capas

| Capa | Qué hace | ¿Obligatoria? |
|---|---|---|
| **Base de datos** | Guarda ofertas, candidaturas, documentos y la configuración. | ✅ Sí. Es el núcleo. |
| **Web (este repo)** | Panel para ver, filtrar, mover en el kanban, editar y configurar. Lee/escribe la BD. | ✅ Sí. |
| **Automatización** | Scraper (mete ofertas) + n8n (IA que puntúa y redacta). | ⚠️ Opcional. Sin ella puedes meter ofertas a mano; pierdes el scoring y la generación automática. |

### El ciclo de vida de una oferta

```
nueva ──(IA puntúa, wf1)──► evaluada ──(digest, wf2)──► notificada
   └──(aplicar en la web / Telegram)──► generada (carta+CV) ──► aplicada
                                                   │
                              (+ descartada  ·  caducada por antigüedad)
```

Y una candidatura (`applications`) avanza por fases: `postulada → prueba_tecnica → entrevista_tecnica → entrevista_rrhh → oferta → aceptada | rechazada`.

### La configuración manda

La pestaña **Config** de la web escribe en `empleo.settings` (una fila JSONB). **Todas** las piezas leen de ahí:

- La **web** aplica al instante tu zona, modalidades, score mínimo y perfil.
- El **scraper** lee portales, países, términos y zona en su siguiente ejecución (`SETTINGS_FROM_DB=1`).
- **n8n** puede leer las keywords de scoring y tu perfil (ver [doc 3](./03-Automatizacion-flujos-scraper.md)).

Por eso el sistema es **modular y duradero**: cambias comportamiento desde la web, sin tocar código.

> ¿Primera vez? Empieza por [Requisitos e instalación](./01-Requisitos-e-instalacion.md).
