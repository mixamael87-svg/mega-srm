'use client';
import { useEffect, useState } from 'react';
import { downloadUrl, kop } from '@/ui/money';

type LabelSet = { id: number; name: string };
type Skipped = { sku: string; name: string; qty: number };
type LabelSummary = { docId: number; docNumber: number; setId: number; setName: string; printedCount: number; missing: Skipped[]; noPrint: Skipped[] };

/** 1 наклейка, 2–4 наклейки, 5+ наклейок */
export const labelsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'наклейка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'наклейки' : 'наклейок');

type Row = { id: number; type: 'RAHUNOK' | 'NAKLADNA'; number: number; date: string; sdOrderId: number; status: 'ACTIVE' | 'ANNULLED'; clientName: string; fopName: string; createdBy: string; netKop: number };

export function History() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = async (query = q) => {
    const res = await fetch(`/api/documents${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    if (res.ok) setRows(await res.json()); else setError((await res.json()).error);
  };
  const [sets, setSets] = useState<LabelSet[]>([]);
  const [summary, setSummary] = useState<LabelSummary | null>(null);
  useEffect(() => {
    void load('');
    void fetch('/api/label-sets').then(r => (r.ok ? r.json() : [])).then(setSets);
  }, []);

  async function openLabels(r: Row, set: LabelSet) {
    setError('');
    const res = await fetch(`/api/documents/${r.id}/labels?set=${set.id}&format=json`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Помилка'); return; }
    setSummary({ docId: r.id, docNumber: r.number, setId: set.id, ...j });
  }

  const download = (id: number) => downloadUrl(`/api/documents/${id}/file`);
  async function annul(r: Row) {
    if (!confirm(`Анулювати ${r.type === 'RAHUNOK' ? 'рахунок' : 'накладну'} № ${r.number}? Номер залишиться зайнятим; для замовлення можна буде сформувати новий документ${r.type === 'RAHUNOK' ? ' з наступним номером' : ''}.`)) return;
    const res = await fetch(`/api/documents/${r.id}/annul`, { method: 'POST' });
    if (res.ok) await load(); else setError((await res.json()).error);
  }

  return (
    <>
      <h1>Історія документів</h1>
      <form className="card row" onSubmit={e => { e.preventDefault(); void load(); }}>
        <div><label htmlFor="q">Пошук: № документа, № замовлення або клієнт</label><input id="q" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button>Знайти</button>
      </form>
      {error && <div className="card error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Тип</th><th>№</th><th>Дата</th><th>Клієнт</th><th>Замовлення</th><th className="num">Сума</th><th>Постачальник</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="muted">Документів ще немає</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.type === 'RAHUNOK' ? 'Рахунок' : 'Накладна'}</td>
                <td>{r.number}</td>
                <td>{r.date.split('-').reverse().join('.')}</td>
                <td>{r.clientName}</td>
                <td>{r.sdOrderId}</td>
                <td className="num">{kop(r.netKop)}</td>
                <td>{r.fopName}</td>
                <td>{r.status === 'ANNULLED' ? <span className="pill annulled">анульовано</span> : <span className="pill">активний</span>}</td>
                <td className="num">
                  <button onClick={() => download(r.id)}>Завантажити</button>{' '}
                  {r.status === 'ACTIVE' && <button onClick={() => annul(r)}>Анулювати</button>}
                  {r.type === 'NAKLADNA' && r.status === 'ACTIVE' && sets.map(set => (
                    <div key={set.id} style={{ marginTop: 4 }}><button onClick={() => openLabels(r, set)}>Наклейки: {set.name}</button></div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary && <LabelsDialog s={summary} onClose={() => setSummary(null)} />}
    </>
  );
}

function SkippedTable({ title, items }: { title: string; items: Skipped[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h2 style={{ marginTop: 14 }}>{title}</h2>
      <table>
        <thead><tr><th>Артикул</th><th>Назва</th><th className="num">К-ть</th></tr></thead>
        <tbody>{items.map(i => <tr key={i.sku}><td>{i.sku || '—'}</td><td>{i.name}</td><td className="num">{i.qty}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function LabelsDialog({ s, onClose }: { s: LabelSummary; onClose: () => void }) {
  const url = `/api/documents/${s.docId}/labels?set=${s.setId}&format=pdf`;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog" role="dialog" aria-label="Друк наклейок" onClick={e => e.stopPropagation()}>
        <h2>Наклейки до накладної № {s.docNumber} · {s.setName}</h2>
        <p>{s.printedCount > 0 ? `Буде надруковано ${s.printedCount} ${labelsWord(s.printedCount)}.` : 'Немає наклейок для друку.'}</p>
        <SkippedTable title="Немає наклейки — не друкуються" items={s.missing} />
        <SkippedTable title="Позначені «не друкувати»" items={s.noPrint} />
        <div className="row" style={{ marginTop: 16 }}>
          {s.printedCount > 0 && <button className="primary" onClick={() => window.open(url, '_blank')}>Друкувати</button>}
          <button onClick={onClose}>Закрити</button>
        </div>
        {s.printedCount > 0 && <p className="muted" style={{ marginTop: 10 }}>Відкриється PDF — натисніть Ctrl+P і оберіть Xprinter (масштаб 100 %, без полів).</p>}
      </div>
    </div>
  );
}
