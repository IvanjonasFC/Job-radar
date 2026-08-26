// Ingesta RSS opcional (sin dependencias): con esto, un montaje básico NO necesita el scraper Python.
// Lee los feeds de Config (settings.rss_feeds) e inserta ofertas nuevas con dedupe por URL.
import { q, logEvent } from './db.js';
import { getSettings } from './config.js';

const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
  return m ? strip(m[1]) : '';
};

function parseItems(xml) {
  const items = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    let link = tag(b, 'link');
    if (!link) { const lm = b.match(/<link[^>]*href=["']([^"']+)["']/i); if (lm) link = lm[1]; } // Atom
    const title = tag(b, 'title');
    const desc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded');
    const pub = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated');
    if (link && title) items.push({ link, title, desc, pub });
  }
  return items;
}

function toDate(s) {
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

export async function ingestRSS() {
  const settings = await getSettings();
  const feeds = Array.isArray(settings.rss_feeds) ? settings.rss_feeds : [];
  if (!feeds.length) return { inserted: 0, feeds: 0, note: 'sin feeds RSS en Config' };

  let inserted = 0;
  for (const url of feeds) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'empleo-worker/1.0' } });
      const xml = await res.text();
      for (const it of parseItems(xml)) {
        const r = await q(
          `INSERT INTO empleo.job_offers (url, title, description, source, posted_at, status, first_seen, updated_at)
           VALUES ($1,$2,$3,'rss',$4,'nueva',now(),now())
           ON CONFLICT (url) DO NOTHING RETURNING id`,
          [it.link, it.title.slice(0, 300), it.desc.slice(0, 6000), toDate(it.pub)]
        );
        if (r.length) inserted++;
      }
    } catch (e) {
      console.error('[ingest] feed falló:', url, e.message);
    }
  }
  if (inserted) await logEvent(null, 'ingesta', `insertadas ${inserted} de ${feeds.length} feeds`);
  return { inserted, feeds: feeds.length };
}
