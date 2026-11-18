'use client';
import { useState } from 'react';
import type { LabelRow } from '@/domain/labels';

export type LabelList = { setId: number; setName: string; title: string; rows: LabelRow[] };
type Label = { id: number; sku: string | null; title: string; text: string; noPrint: boolean; extraLabelId: number | null };

/** 1 наклейка, 2–4 наклейки, 5+ наклейок */
export const labelsWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'наклейка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'наклейки' : 'наклейок';

const STATUS: Record<LabelRow['status'], string> = { ok: 'є наклейка', missing: 'немає наклейки', noPrint: 'не друкувати' };

/** Loads the editable print list (from an order or a nakladna) for one label set. */
export async function loadLabelList(url: string, setId: number): Promise<{ list?: LabelList; error?: string }> {
  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { error: j.error ?? 'Помилка' };
  return { list: { setId, ...j } };
}

/** Confirmation dialog: edit quantities, remove or add articles, then print a PDF of exactly this list. */
export function LabelsDialog({ list, onClose }: { list: LabelList; onClose: () => void }) {
  const [rows, setRows] = useState<(LabelRow & { input: string })[]>(list.rows.map(r => ({ ...r, input: String(r.qty) })));
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const n = (r: { input: string }) => { const v = Number(r.input); return Number.isInteger(v) && v > 0 ? v : 0; };
  const total = rows.filter(r => r.status === 'ok').reduce((s, r) => s + n(r) * (r.extra ? 2 : 1), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const s = sku.trim();
    const q = Number(qty);
    if (!/^\d{4}$/.test(s)) { setError('Артикул — 4 цифри'); return; }
    if (!Number.isInteger(q) || q <= 0) { setError('Кількість — ціле число більше 0'); return; }
    const existing = rows.find(r => r.sku === s);
    if (existing) {
      setRows(rs => rs.map(r => (r.sku === s ? { ...r, input: String(n(r) + q) } : r)));
    } else {
      const res = await fetch(`/api/label-sets/${list.setId}/labels?q=${s}`);
      const found: Label[] = res.ok ? await res.json() : [];
      const l = found.find(x => x.sku === s);
      let extra: string | null = null;
      if (l?.extraLabelId) {
        const all: Label[] = await fetch(`/api/label-sets/${list.setId}/labels`).then(r => (r.ok ? r.json() : []));
        const x = all.find(a => a.id === l.extraLabelId);
        extra = x && !x.noPrint ? (x.title || x.sku || 'додаткова') : null;
      }
      setRows(rs => [...rs, {
        sku: s, name: l ? (l.title || l.text.split('\n')[0] || '') : '', qty: q, input: String(q),
        status: !l ? 'missing' : l.noPrint ? 'noPrint' : 'ok', extra,
      }]);
    }
    setSku(''); setQty('1');
  }

  async function print() {
    setError('');
    const items = rows.filter(r => r.status === 'ok' && n(r) > 0).map(r => ({ sku: r.sku, qty: n(r) }));
    const tab = window.open('', '_blank'); // opened on the click, so the browser doesn't block it
    setBusy(true);
    const res = await fetch(`/api/label-sets/${list.setId}/print`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: list.title, items }),
    });
    setBusy(false);
    if (!res.ok) {
      tab?.close();
      setError((await res.json().catch(() => ({}))).error ?? 'Помилка');
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.href = url;
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-label="Друк наклейок" onClick={e => e.stopPropagation()}>
        <h2>Наклейки · {list.setName} · {list.title}</h2>
        {(() => {
          const printable = rows.filter(r => r.status === 'ok');
          const skipped = rows.filter(r => r.status !== 'ok');
          const row = (r: (typeof rows)[number]) => (
            <tr key={r.sku} className={r.status === 'ok' ? '' : 'muted'}>
              <td>{r.sku || '—'}</td>
              <td>{r.name}</td>
              <td className="num">
                {r.status === 'ok'
                  ? <input aria-label={`К-ть ${r.sku}`} style={{ width: 64, textAlign: 'right' }} inputMode="numeric" value={r.input}
                      onChange={e => setRows(rs => rs.map(x => (x.sku === r.sku ? { ...x, input: e.target.value } : x)))} />
                  : r.qty}
              </td>
              <td>{STATUS[r.status]}{r.extra ? ` + ${r.extra}` : ''}</td>
              <td className="num"><button type="button" aria-label={`Прибрати ${r.sku}`} onClick={() => setRows(rs => rs.filter(x => x.sku !== r.sku))}>×</button></td>
            </tr>
          );
          const head = <thead><tr><th>Артикул</th><th>Назва</th><th className="num">К-ть</th><th>Статус</th><th></th></tr></thead>;
          return (
            <>
              <table>{head}<tbody>
                {printable.length === 0 && <tr><td colSpan={5} className="muted">Немає артикулів з наклейками</td></tr>}
                {printable.map(row)}
              </tbody></table>
              {skipped.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary>Не друкуються (немає наклейки або «не друкувати»): {skipped.length}</summary>
                  <table>{head}<tbody>{skipped.map(row)}</tbody></table>
                </details>
              )}
            </>
          );
        })()}

        <form className="row" style={{ marginTop: 12, alignItems: 'flex-end' }} onSubmit={add}>
          <div><label htmlFor="ld-sku">Артикул</label><input id="ld-sku" value={sku} onChange={e => setSku(e.target.value)} maxLength={4} style={{ width: 90 }} /></div>
          <div><label htmlFor="ld-qty">Кількість</label><input id="ld-qty" value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" style={{ width: 70 }} /></div>
          <button>+ Додати</button>
        </form>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="dialog-footer">
        <p style={{ margin: '0 0 8px' }}><b>{total > 0 ? `Буде надруковано ${total} ${labelsWord(total)}.` : 'Немає наклейок для друку.'}</b></p>
        <div className="row">
          <button className="primary" disabled={busy || total === 0} onClick={print}>{busy ? 'Готую PDF…' : 'Друкувати'}</button>
          <button onClick={onClose}>Закрити</button>
        </div>
        {total > 0 && <p className="muted" style={{ margin: '8px 0 0' }}>Відкриється PDF — натисніть Ctrl+P і оберіть Xprinter (масштаб 100 %, без полів).</p>}
        </div>
      </div>
    </div>
  );
}
