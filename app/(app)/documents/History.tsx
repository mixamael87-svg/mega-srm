'use client';
import { useEffect, useState } from 'react';
import { LabelsDialog, loadLabelList, type LabelList } from '@/ui/LabelsDialog';
import { downloadUrl, kop } from '@/ui/money';

type LabelSet = { id: number; name: string };

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
  const [labels, setLabels] = useState<LabelList | null>(null);
  useEffect(() => {
    void load('');
    void fetch('/api/label-sets').then(r => (r.ok ? r.json() : [])).then(setSets);
  }, []);

  async function openLabels(r: Row, set: LabelSet) {
    setError('');
    const { list, error } = await loadLabelList(`/api/documents/${r.id}/labels?set=${set.id}`, set.id);
    if (error) setError(error); else setLabels(list!);
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
      {labels && <LabelsDialog list={labels} onClose={() => setLabels(null)} />}
      <ReportDocuments />
    </>
  );
}

type ReportRow = { id: number; kind: 'POVERNENNYA' | 'PEREOTSINKA'; number: number; date: string; status: 'ACTIVE' | 'ANNULLED'; clientName: string; netKop: number; createdBy: string };

/** Revaluation documents (from «Звіти клієнтів») — listed here next to order documents. */
function ReportDocuments() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState('');
  const load = async () => { const r = await fetch('/api/report-documents'); if (r.ok) setRows(await r.json()); };
  useEffect(() => { void load(); }, []);
  async function annul(r: ReportRow) {
    if (!confirm(`Анулювати ${r.kind === 'POVERNENNYA' ? 'накладну на повернення' : 'накладну (переоцінка)'} № ${r.number}?`)) return;
    const res = await fetch(`/api/report-documents/${r.id}/annul`, { method: 'POST' });
    if (res.ok) await load(); else setError((await res.json()).error);
  }
  if (rows.length === 0) return null;
  return (
    <>
      <h2 style={{ marginTop: 24 }}>Документи переоцінки</h2>
      {error && <div className="card error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Тип</th><th>№</th><th>Дата</th><th>Клієнт</th><th className="num">Сума</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.kind === 'POVERNENNYA' ? 'Повернення' : 'Накладна (переоцінка)'}</td>
                <td>{r.number}</td>
                <td>{r.date.split('-').reverse().join('.')}</td>
                <td>{r.clientName}</td>
                <td className="num">{kop(r.netKop)}</td>
                <td>{r.status === 'ANNULLED' ? <span className="pill annulled">анульовано</span> : <span className="pill">активний</span>}</td>
                <td className="num">
                  <button onClick={() => downloadUrl(`/api/report-documents/${r.id}/file`)}>Завантажити</button>{' '}
                  {r.status === 'ACTIVE' && <button onClick={() => annul(r)}>Анулювати</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
