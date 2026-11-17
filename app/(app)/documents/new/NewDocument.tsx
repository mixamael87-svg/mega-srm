'use client';
import { useMemo, useState } from 'react';
import type { SdOrder, SdProduct } from '@/domain/types';
import { downloadUrl, uah } from '@/ui/money';
import { RecipientPicker, type RecipientOption } from '@/ui/RecipientPicker';

type Preview = {
  order: SdOrder;
  recipients: RecipientOption[];
  defaultRecipientFopId: number | null;
  mix: { lineIndex: number; colours: SdProduct[] }[];
  fops: { id: number; name: string }[];
  defaultFopId: number | null;
  defaultDate: string;
  documents: { id: number; type: 'RAHUNOK' | 'NAKLADNA'; number: number; status: string }[];
};
/** lineIndex → (variantId → qty as typed) ; absent = "залишити як Мікс" */
type Splits = Record<number, Record<string, string>>;

export function NewDocument() {
  const [orderNo, setOrderNo] = useState('');
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [fopId, setFopId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [splits, setSplits] = useState<Splits>({});
  const [recipientId, setRecipientId] = useState<number | null>(null);

  async function load(e?: React.FormEvent) {
    e?.preventDefault();
    setError(''); setInfo('');
    const n = orderNo.trim();
    if (!/^\d+$/.test(n) || Number(n) <= 0) { setError('Введіть номер замовлення'); return; }
    setBusy(true);
    const res = await fetch(`/api/orders/${n}`);
    setBusy(false);
    const j = await res.json().catch(() => ({ error: 'Помилка' }));
    if (!res.ok) { setP(null); setError(j.error ?? 'Помилка'); return; }
    setP(j); setFopId(j.defaultFopId); setDate(j.defaultDate); setSplits({}); setRecipientId(j.defaultRecipientFopId);
  }

  const mixByLine = useMemo(() => new Map(p?.mix.map(m => [m.lineIndex, m.colours]) ?? []), [p]);
  const splitState = (i: number) => {
    const s = splits[i];
    if (!s) return null;
    const sum = Object.values(s).reduce((a, v) => a + (Number(v.replace(',', '.')) || 0), 0);
    const bad = Object.values(s).some(v => v.trim() !== '' && !(Number(v.replace(',', '.')) >= 0));
    return { sum, ok: !bad && sum === p!.order.lines[i]!.amount };
  };
  const splitErrors = Object.keys(splits).map(Number).filter(i => !splitState(i)?.ok);
  const blockers = [
    !recipientId && 'Оберіть одержувача',
    !fopId && 'Оберіть постачальника',
    !date && 'Вкажіть дату',
    splitErrors.length > 0 && `Розбивка не збігається з кількістю (рядок ${splitErrors.map(i => i + 1).join(', ')})`,
  ].filter(Boolean) as string[];

  async function generate(type: 'RAHUNOK' | 'NAKLADNA') {
    if (!p || !fopId) return;
    setError(''); setInfo(''); setBusy(true);
    const body = {
      type, sdOrderId: p.order.id, fopId, recipientFopId: recipientId, date,
      splits: Object.entries(splits).map(([i, parts]) => ({
        lineIndex: Number(i),
        parts: Object.entries(parts).map(([variantId, q]) => ({ variantId, qty: Number(q.replace(',', '.')) || 0 })).filter(x => x.qty > 0),
      })),
    };
    const res = await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.issues?.[0]?.message ?? j.error ?? 'Помилка');
      return;
    }
    const r = await res.json();
    downloadUrl(`/api/documents/${r.documentId}/file`);
    setInfo(`Сформовано: ${r.filename}`);
  }

  const setQty = (i: number, id: string, v: string) => setSplits(s => ({ ...s, [i]: { ...s[i], [id]: v } }));

  return (
    <>
      <h1>Новий документ</h1>
      <form className="card row" onSubmit={load}>
        <div><label htmlFor="order">№ замовлення SalesDrive</label><input id="order" value={orderNo} onChange={e => setOrderNo(e.target.value)} inputMode="numeric" autoFocus /></div>
        <button className="primary" disabled={busy}>Завантажити</button>
      </form>
      {error && <div className="card error" role="alert">{error}</div>}
      {info && <div className="card">{info}</div>}

      {p && (
        <>
          <div className="card">
            <h2>Замовлення № {p.order.id} · {p.order.contactName} · {p.order.orderTime.slice(0, 10)}</h2>
            {p.documents.length > 0 && (
              <div className="muted">Вже сформовано: {p.documents.map(d => `${d.type === 'RAHUNOK' ? 'Рахунок' : 'Накладна'} № ${d.number}${d.status === 'ANNULLED' ? ' (анульовано)' : ''}`).join(', ')}. Повторне формування активного документа збереже номер; після анулювання рахунок отримає новий номер.</div>
            )}
          </div>

          <div className="row" style={{ alignItems: 'stretch' }}>
            <div className="card" style={{ flex: 1, minWidth: 280 }}>
              <h2>Постачальник</h2>
              {p.fops.length === 0 ? <div className="error">Немає жодного нашого ФОП — додайте в «Наші ФОП».</div> : (
                <select aria-label="Постачальник" value={fopId ?? ''} onChange={e => setFopId(Number(e.target.value))} style={{ width: '100%' }}>
                  {p.fops.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              <div style={{ marginTop: 12 }}><label htmlFor="date">Дата документа</label><input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 280 }}>
              <h2>Одержувач</h2>
              <RecipientPicker
                options={p.recipients}
                value={recipientId}
                onChange={setRecipientId}
                onCreated={o => { setP({ ...p, recipients: [...p.recipients, o] }); setRecipientId(o.id); }}
              />
            </div>
          </div>

          <div className="card">
            <table>
              <thead><tr><th>№</th><th>Артикул</th><th>Назва</th><th className="num">К-ть</th><th className="num">Ціна</th><th className="num">Сума</th><th></th></tr></thead>
              <tbody>
                {p.order.lines.map((l, i) => {
                  const colours = mixByLine.get(i);
                  const st = splitState(i);
                  return [
                    <tr key={i} className={colours ? 'mix' : undefined}>
                      <td>{i + 1}</td><td>{l.sku}</td><td>{l.name}</td>
                      <td className="num">{l.amount}</td><td className="num">{uah(l.price)}</td><td className="num">{uah(l.amount * l.price)}</td>
                      <td className="num">
                        {colours && !splits[i] && <button onClick={() => setSplits(s => ({ ...s, [i]: {} }))}>Розбити по кольорах</button>}
                        {splits[i] && <button onClick={() => setSplits(s => { const n = { ...s }; delete n[i]; return n; })}>залишити як Мікс</button>}
                      </td>
                    </tr>,
                    ...(splits[i] && colours ? [
                      ...colours.map(c => (
                        <tr key={`${i}-${c.id}`} className="mix">
                          <td></td><td></td>
                          <td style={{ paddingLeft: 24 }}>{c.name} {c.inStock != null && <span className="muted">(залишок {c.inStock})</span>}</td>
                          <td className="num"><input aria-label={`К-ть ${c.name}`} style={{ width: 70, textAlign: 'right' }} inputMode="numeric" value={splits[i]![c.id] ?? ''} onChange={e => setQty(i, c.id, e.target.value)} /></td>
                          <td colSpan={3}></td>
                        </tr>
                      )),
                      <tr key={`${i}-sum`} className="mix">
                        <td></td><td></td>
                        <td style={{ paddingLeft: 24 }} className={st?.ok ? 'muted' : 'error'}>Розбито {st?.sum ?? 0} з {l.amount}</td>
                        <td colSpan={4}></td>
                      </tr>,
                    ] : []),
                  ];
                })}
              </tbody>
              <tfoot>
                {p.order.discountAmount > 0 && <tr><td colSpan={5} className="num">Знижка замовлення</td><td className="num">{uah(p.order.discountAmount)}</td><td></td></tr>}
                <tr><td colSpan={5} className="num"><b>До сплати</b></td><td className="num"><b>{uah(p.order.paymentAmount)}</b></td><td></td></tr>
              </tfoot>
            </table>
          </div>

          <div className="card row">
            <button className="primary" disabled={busy || blockers.length > 0} onClick={() => generate('RAHUNOK')}>Рахунок (.xlsx)</button>
            <button className="primary" disabled={busy || blockers.length > 0} onClick={() => generate('NAKLADNA')}>Видаткова накладна (.xlsx)</button>
            {blockers.length > 0 && <span className="error">{blockers.join(' · ')}</span>}
          </div>
        </>
      )}
    </>
  );
}
