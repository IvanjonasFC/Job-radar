import { useState, type CSSProperties } from 'react';

type Card = { id: number; company: string; title: string; ubi?: string; cerca?: boolean; score: number; fecha?: string };
type Cols = Record<string, Card[]>;

const COLS = [
  { key: 'abiertas', label: 'Abiertas', hint: 'Detectadas y puntuadas' },
  { key: 'cv', label: 'CV listo', hint: 'Documentos generados' },
  { key: 'postulada', label: 'Postuladas', hint: 'Ya te has inscrito' },
  { key: 'entrevista', label: 'Entrevista', hint: 'Proceso en marcha' },
  { key: 'resuelta', label: 'Resuelta', hint: 'Oferta / cerrada' },
];

const badgeClass = (s: number) => (s >= 80 ? 'badge-good' : s >= 60 ? 'badge-mid' : 'badge-low');

export default function KanbanBoard({ initial, abiertasOcultas = 0 }: { initial: Cols; abiertasOcultas?: number }) {
  const [cols, setCols] = useState<Cols>(initial);
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  async function move(id: number, from: string, to: string) {
    if (from === to) return;
    const snapshot = cols;
    setCols((prev) => {
      const card = prev[from]?.find((c) => c.id === id);
      if (!card) return prev;
      return { ...prev, [from]: prev[from].filter((c) => c.id !== id), [to]: [card, ...(prev[to] || [])] };
    });
    try {
      const r = await fetch('/api/mover', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offerId: id, col: to }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'error');
    } catch {
      setCols(snapshot); // revertir si falla
    }
  }

  const onDrop = (to: string) => {
    if (drag) move(drag.id, drag.from, to);
    setDrag(null); setOver(null);
  };

  const colStyle = (key: string): CSSProperties => ({
    background: over === key ? 'rgba(255,107,0,0.06)' : 'var(--color-surface)',
    border: `1px solid ${over === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 14, transition: 'background .12s, border-color .12s',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 210px)', minHeight: 200,
  });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS.length}, 1fr)`, gap: 12, alignItems: 'start' }}>
        {COLS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={() => onDrop(col.key)}
            style={colStyle(col.key)}
          >
            {/* Cabecera fija de la columna */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', borderBottom: '1px solid var(--color-border)',
              position: 'sticky', top: 0, zIndex: 1,
              background: 'rgba(10,10,12,0.86)', backdropFilter: 'blur(6px)', borderRadius: '14px 14px 0 0',
            }}>
              <div>
                <strong style={{ fontSize: '.92rem' }}>{col.label}</strong>
                <div style={{ fontSize: '.68rem', color: 'var(--color-muted)' }}>{col.hint}</div>
              </div>
              <span className="badge badge-low">{cols[col.key]?.length ?? 0}</span>
            </div>
            {/* Lista con scroll propio: una columna larga NO empuja la página */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflowY: 'auto', flex: 1 }}>
              {(cols[col.key] ?? []).map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDrag({ id: c.id, from: col.key })}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => { window.location.href = `/ofertas/${c.id}`; }}
                  title="Arrastra para mover · clic para abrir"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: `1px solid ${c.cerca ? 'rgba(255,107,0,0.5)' : 'var(--color-border)'}`,
                    borderRadius: 10, padding: 10, cursor: 'grab',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className={`badge ${badgeClass(c.score ?? 0)}`}>{c.score ?? 0}</span>
                    <strong style={{ fontSize: '.86rem', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company}</strong>
                    {c.cerca && <span title="Cerca de tu zona" style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)', flex: '0 0 auto' }} />}
                  </div>
                  <div style={{ fontSize: '.82rem', color: 'var(--color-text)' }}>{c.title}</div>
                  <div style={{ fontSize: '.74rem', color: 'var(--color-muted)', marginTop: 4 }}>
                    {c.ubi || '—'}{c.fecha ? ` · ${c.fecha}` : ''}
                  </div>
                </div>
              ))}
              {(cols[col.key]?.length ?? 0) === 0 && (
                <div style={{ color: 'var(--color-muted)', fontSize: '.8rem', padding: 8, textAlign: 'center' }}>—</div>
              )}
              {col.key === 'abiertas' && abiertasOcultas > 0 && (
                <a href="/ofertas?sort=encaje" style={{ fontSize: '.76rem', color: 'var(--color-muted)', textAlign: 'center', padding: '6px 0' }}>
                  +{abiertasOcultas} más en Ofertas →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver('descartada'); }}
        onDragLeave={() => setOver((o) => (o === 'descartada' ? null : o))}
        onDrop={() => onDrop('descartada')}
        style={{
          marginTop: 16, padding: 14, textAlign: 'center', borderRadius: 12,
          border: `1px dashed ${over === 'descartada' ? 'var(--color-danger)' : 'var(--color-border)'}`,
          background: over === 'descartada' ? 'rgba(248,81,73,0.08)' : 'transparent',
          color: 'var(--color-muted)', fontSize: '.85rem', transition: 'all .12s',
        }}
      >
        Arrastra aquí para descartar
      </div>
    </div>
  );
}
