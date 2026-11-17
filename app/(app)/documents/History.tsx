'use client';
import { useEffect, useState } from 'react';
import { downloadUrl, kop } from '@/ui/money';

type Row = { id: number; type: 'RAHUNOK' | 'NAKLADNA'; number: number; date: string; sdOrderId: number; status: 'ACTIVE' | 'ANNULLED'; clientName: string; fopName: string; createdBy: string; netKop: number };

export function History({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = async (query = q) => {
    const res = await fetch(`/api/documents${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    if (res.ok) setRows(await res.json()); else setError((await res.json()).error);
  };
  useEffect(() => { void load(''); }, []);

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
                  {isAdmin && r.status === 'ACTIVE' && <button onClick={() => annul(r)}>Анулювати</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
