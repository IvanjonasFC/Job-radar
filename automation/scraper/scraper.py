#!/usr/bin/env python3
"""
empleo-scraper — alimenta empleo.job_offers con JobSpy.
Sitios por defecto: Indeed + LinkedIn. (Google da 0 desde esta IP; Glassdoor roto. Ver README.)

TODO CONFIGURABLE POR VARIABLES DE ENTORNO (ver .env / docker-compose), replicable sin tocar codigo.
Ademas, si SETTINGS_FROM_DB=1 (por defecto), LEE su configuracion de empleo.settings: lo que definas
en la pestaña Config de la web manda (portales, terminos, paises, zona, RSS...). Env = respaldo.

  PG_HOST/PG_PORT/PG_DB/PG_USER/PG_PASS   conexion Postgres
  COUNTRIES      CSV de paises JobSpy (spain,mexico,argentina,...). Def: spain
  SITES          CSV de sitios (indeed,google[,glassdoor,linkedin]). Def: indeed,google
  SEARCH_TERMS   CSV de terminos. Def: stack IT
  HOME_COUNTRY   pais principal (usa HOME_LOCATION). Def: spain
  HOME_LOCATION  localizacion preferida del pais principal. Def: "Asturias, Spain"
  LOCAL_CITIES   CSV que cuenta como "local". Def: Asturias
  IT_KEYWORDS    CSV de keywords de sector para el filtro por titulo. Def: stack IT
  FILTER         it_local_remote | remote_only | off. Def: it_local_remote
  RESULTS_WANTED por busqueda. Def: 25
  HOURS_OLD      antiguedad max (h). Def: 168
  WORKERS        hilos en paralelo para acelerar (robusto: cada tarea aislada). Def: 4
  PROXIES        CSV de proxies opcionales (para reactivar Google/InfoJobs con otra IP). Def: vacio

Regla de pais: HOME_COUNTRY usa FILTER (local o remoto); el RESTO de paises entran SOLO en remoto.
Robustez: cada portal se scrapea en su propia llamada con reintento y en paralelo (WORKERS); un fallo
de un portal/pais no afecta a los demas. Inserta con ON CONFLICT (url) DO NOTHING (status='nueva').
"""
import os
import re
import time
import html as _html
import random
import hashlib
import traceback
from concurrent.futures import ThreadPoolExecutor

import psycopg2
from jobspy import scrape_jobs


def env_csv(name, default):
    raw = os.getenv(name, default) or ""
    return [x.strip() for x in raw.split(",") if x.strip()]


PG = dict(
    host=os.getenv("PG_HOST", "n8n-stack-n8n-db-1"),
    port=int(os.getenv("PG_PORT", "5432")),
    dbname=os.getenv("PG_DB", "empleo"),
    user=os.getenv("PG_USER", "empleo_worker"),
    password=os.getenv("PG_PASS", ""),
)

COUNTRIES = [c.lower() for c in env_csv("COUNTRIES", "spain")]
SITES = env_csv("SITES", "indeed,linkedin")
SEARCH_TERMS = env_csv(
    "SEARCH_TERMS",
    "desarrollador,programador,full stack developer,backend developer,frontend developer,"
    "python developer,react developer,angular developer,node developer,java developer,"
    "php developer,.net developer,javascript developer,devops,administrador de sistemas,"
    "tecnico de sistemas,soporte informatico,helpdesk,data engineer,ingeniero de software,"
    "cloud engineer,flutter developer,informatico,tecnico informatico,administrador de redes,"
    "desarrollador junior,programador junior",
)
HOME_COUNTRY = os.getenv("HOME_COUNTRY", COUNTRIES[0] if COUNTRIES else "spain").lower()
HOME_LOCATION = os.getenv("HOME_LOCATION", "Asturias, Spain")
LOCAL = [x.lower() for x in env_csv(
    "LOCAL_CITIES", "asturias,gijon,gijón,oviedo,aviles,avilés,langreo,mieres,siero")]
IT_KW = [x.lower() for x in env_csv(
    "IT_KEYWORDS",
    "developer,programador,desarrollador,full stack,fullstack,backend,frontend,python,java,react,"
    "angular,vue,node,nestjs,php,devops,sysadmin,administrador,sistemas,software,fastapi,sql,"
    "datos,data,ingeniero,engineer,ia,cloud,aws,docker,"
    "informatico,informático,tecnico,técnico,soporte,redes,helpdesk,ciberseguridad,seguridad,"
    "microinformatica,analista,qa,tester")]
FILTER = os.getenv("FILTER", "it_local_remote").lower()
RESULTS_PER_SEARCH = int(os.getenv("RESULTS_WANTED", "40"))
HOURS_OLD = int(os.getenv("HOURS_OLD", "168"))
WORKERS = max(1, int(os.getenv("WORKERS", "4")))
# Proxies opcionales (JobSpy) — util si algun dia quieres reactivar Google/InfoJobs con otra IP.
# Formato CSV: "user:pass@host:port,host:port". Vacio = sin proxy (salida directa del host).
PROXIES = env_csv("PROXIES", "")
# Feeds RSS extra de remoto global (ingles). El scraper tiene internet (host) -> los lee directo,
# sin Caddy ni normalizador en WF1. Insertan en la misma tabla; WF1 los puntua/filtra igual.
RSS_FEEDS = env_csv(
    "RSS_FEEDS",
    "https://weworkremotely.com/categories/remote-programming-jobs.rss,"
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss")

REMOTO = ['remote', 'remoto', 'teletrabajo', 'en remoto', 'anywhere', 'desde casa', 'home office']

# Titulos NO-IT a descartar (respaldo por env; la web puede sobrescribirlo con exclude_keywords).
NONIT = tuple(x.lower() for x in env_csv(
    "EXCLUDE_KEYWORDS",
    "comercial,ventas,captacion,captación,teleoperador,televenta,marketing,dependiente,camarero,"
    "mozo,carretillero,recepcionista,vendedor,promotor,azafat,limpieza,cocinero,repartidor,"
    "conductor,peluquer,esteticista,fisioterapeuta,enfermer,celador,administrativo,contable,"
    "atencion al cliente"))

COUNTRY_LABEL = {
    "spain": "Spain", "mexico": "Mexico", "argentina": "Argentina", "colombia": "Colombia",
    "chile": "Chile", "peru": "Peru", "uruguay": "Uruguay", "ecuador": "Ecuador",
    "costa rica": "Costa Rica", "panama": "Panama", "guatemala": "Guatemala",
    "venezuela": "Venezuela", "bolivia": "Bolivia", "paraguay": "Paraguay",
    "dominican republic": "Dominican Republic", "usa": "USA",
}


def build_tasks():
    """Lista de (term, location, country, site) — una tarea por busqueda y portal."""
    tasks = []
    for country in COUNTRIES:
        label = COUNTRY_LABEL.get(country, country.title())
        locs = list(dict.fromkeys([HOME_LOCATION, label])) if country == HOME_COUNTRY else [label]
        for loc in locs:
            for term in SEARCH_TERMS:
                for site in SITES:
                    tasks.append((term, loc, country, site))
    return tasks


def google_time_phrase(hours):
    if hours <= 24:
        return "since yesterday"
    if hours <= 72:
        return "in the last 3 days"
    if hours <= 168:
        return "in the last week"
    return "in the last month"


def google_query(term, loc, remote_only):
    # Google Jobs ignora search_term/location/hours_old: TODO va aqui, con sintaxis exacta
    # "<puesto> jobs near <Ciudad, Pais> in the last week" (doc oficial JobSpy).
    where = "remote" if remote_only else f"near {loc}"
    return f"{term} jobs {where} {google_time_phrase(HOURS_OLD)}"


def scrape_one(site, term, loc, country, remote_only):
    kwargs = dict(
        site_name=[site], search_term=term, location=loc,
        results_wanted=RESULTS_PER_SEARCH, hours_old=HOURS_OLD,
        country_indeed=country, verbose=0,
    )
    if site == "google":
        kwargs["google_search_term"] = google_query(term, loc, remote_only)
    if remote_only:
        kwargs["is_remote"] = True
    if PROXIES:
        kwargs["proxies"] = PROXIES  # salir con otra IP (reactivar Google/InfoJobs bloqueados)
    last = None
    for attempt in range(2):
        try:
            return scrape_jobs(**kwargs)
        except Exception as e:
            last = e
            time.sleep(1.5 + attempt * 2)
    print(f"[scrape ERROR] {site} '{term}' @ {loc} ({country}): {last}")
    return None


def viable(title, location, is_remote, country):
    if FILTER == "off":
        return True
    t = (title or "").lower()
    if any(k in t for k in NONIT):
        return False
    if IT_KW and not any(k in t for k in IT_KW):
        return False
    loc = (location or "").lower()
    is_rem = bool(is_remote) or any(k in loc for k in REMOTO)
    if country != HOME_COUNTRY:
        return is_rem
    if FILTER == "remote_only":
        return is_rem
    if is_rem:
        return True
    return any(k in loc for k in LOCAL)


def fetch_task(task):
    """Scrapea una (busqueda, portal) y devuelve filas listas para insertar."""
    term, loc, country, site = task
    remote_only = (country != HOME_COUNTRY) or (FILTER == "remote_only")
    df = scrape_one(site, term, loc, country, remote_only)
    time.sleep(random.uniform(0.3, 0.9))  # pequeña cortesia anti rate-limit
    rows = []
    if df is None or df.empty:
        return rows
    for _, row in df.iterrows():
        title = str(row.get("title") or "").strip()
        url = str(row.get("job_url") or "").strip()
        location = str(row.get("location") or "").strip()
        is_remote = bool(row.get("is_remote"))
        if not url or not title:
            continue
        if not viable(title, location, is_remote, country):
            continue
        if not location:
            location = COUNTRY_LABEL.get(country, country.title())
        dp = row.get("date_posted")
        posted = str(dp)[:10] if dp is not None and str(dp) not in ("NaT", "nan", "None", "") else None
        rows.append((
            url,
            hashlib.sha1(url.encode("utf-8")).hexdigest(),
            title,
            str(row.get("company") or "").strip(),
            str(row.get("site") or site),
            location,
            str(row.get("description") or "")[:6000],
            posted,
        ))
    return rows


def strip_html(s):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return _html.unescape(re.sub(r'\s+', ' ', s)).strip()


def scrape_rss(url):
    """Lee un RSS de empleo remoto (WeWorkRemotely, etc.) y devuelve filas listas para insertar."""
    rows = []
    try:
        import requests
        import feedparser
        r = requests.get(url, timeout=20, headers={'User-Agent': 'Mozilla/5.0'})
        feed = feedparser.parse(r.content)
    except Exception:
        print(f"[rss ERROR] {url}")
        traceback.print_exc()
        return rows
    src = 'weworkremotely' if 'weworkremotely' in url else 'rss'
    for e in feed.entries:
        raw = str(getattr(e, 'title', '') or '').strip()
        link = str(getattr(e, 'link', '') or '').strip()
        if not raw or not link:
            continue
        # WeWorkRemotely trae el titulo como "Empresa: Puesto"
        if ':' in raw:
            company, title = [x.strip() for x in raw.split(':', 1)]
        else:
            company, title = '', raw
        location = str(getattr(e, 'region', '') or '').strip() or 'Remote'
        desc = strip_html(getattr(e, 'summary', '') or getattr(e, 'description', ''))[:6000]
        pp = getattr(e, 'published_parsed', None) or getattr(e, 'updated_parsed', None)
        posted = time.strftime('%Y-%m-%d', pp) if pp else None
        # remoto global -> is_remote=True; se filtra por IT y (remoto/local) como el resto
        if not viable(title, location, True, HOME_COUNTRY):
            continue
        rows.append((
            link,
            hashlib.sha1(link.encode('utf-8')).hexdigest(),
            title,
            company,
            src,
            location,
            desc,
            posted,
        ))
    return rows


def _get_db_settings():
    """Lee empleo.settings (la web) para que el scraper obedezca a la config de la web.
    Desactivable con SETTINGS_FROM_DB=0 (usaria solo variables de entorno)."""
    if os.getenv("SETTINGS_FROM_DB", "1").lower() in ("0", "false", "no"):
        return None
    try:
        conn = psycopg2.connect(**PG)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT data FROM empleo.settings WHERE id=1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row[0] if row and row[0] else None
    except Exception as e:
        print(f"[cfg] settings de BD no disponible ({e}); uso variables de entorno")
        return None


def apply_db_settings():
    """Sobrescribe la config con lo definido en la web (empleo.settings). Env = respaldo."""
    d = _get_db_settings()
    if not d:
        return
    global COUNTRIES, SITES, SEARCH_TERMS, HOME_COUNTRY, HOME_LOCATION, LOCAL, IT_KW, NONIT
    global RESULTS_PER_SEARCH, HOURS_OLD, RSS_FEEDS

    def lst(k):
        v = d.get(k)
        if isinstance(v, list):
            out = [str(x).strip() for x in v if str(x).strip()]
            return out or None
        return None

    if lst("sites"):
        SITES = lst("sites")
    if lst("search_terms"):
        SEARCH_TERMS = lst("search_terms")
    if lst("countries"):
        COUNTRIES = [c.lower() for c in lst("countries")]
        HOME_COUNTRY = COUNTRIES[0]
    if d.get("home_location"):
        HOME_LOCATION = str(d["home_location"])
    if lst("local_cities"):
        LOCAL = [x.lower() for x in lst("local_cities")]
    if lst("include_keywords"):
        IT_KW = [x.lower() for x in lst("include_keywords")]
    if lst("exclude_keywords"):
        NONIT = tuple(x.lower() for x in lst("exclude_keywords"))
    if isinstance(d.get("results_wanted"), (int, float)):
        RESULTS_PER_SEARCH = int(d["results_wanted"])
    if isinstance(d.get("hours_old"), (int, float)):
        HOURS_OLD = int(d["hours_old"])
    if lst("rss_feeds"):
        RSS_FEEDS = lst("rss_feeds")
    print("[cfg] configuracion cargada desde empleo.settings (la web manda)")


def main():
    apply_db_settings()
    tasks = build_tasks()
    print(f"[cfg] countries={COUNTRIES} home={HOME_COUNTRY} sites={SITES} terms={len(SEARCH_TERMS)} "
          f"filter={FILTER} results={RESULTS_PER_SEARCH} workers={WORKERS} tasks={len(tasks)} rss={len(RSS_FEEDS)}")

    # 1) Scraping en paralelo (I/O-bound). Cada tarea aislada -> robusto.
    all_rows = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for rows in ex.map(fetch_task, tasks):
            all_rows.extend(rows)

    # 1b) Feeds RSS extra (remoto global). El scraper tiene internet directo (host).
    for url in RSS_FEEDS:
        rss_rows = scrape_rss(url)
        print(f"[rss] {url.split('/')[-1]} -> {len(rss_rows)}")
        all_rows.extend(rss_rows)

    # 2) Insercion secuencial (una conexion, thread-safe).
    conn = psycopg2.connect(**PG)
    conn.autocommit = True
    cur = conn.cursor()
    total = 0
    per_source = {}
    for r in all_rows:
        try:
            cur.execute(
                """INSERT INTO empleo.job_offers
                     (url, guid, title, company, source, location, description, posted_at, status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'nueva')
                   ON CONFLICT (url) DO NOTHING""",
                r,
            )
            if cur.rowcount:
                total += cur.rowcount
                src = r[4]
                per_source[src] = per_source.get(src, 0) + cur.rowcount
        except Exception:
            print("[insert ERROR]")
            traceback.print_exc()

    print(f"[OK] insertadas {total} ofertas nuevas | por sitio: {per_source or '{}'}")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
