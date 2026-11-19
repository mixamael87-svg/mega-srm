'use client';
import { useEffect, useMemo, useState } from 'react';
import { aggregate, type AggRow } from '@/reports/aggregate';
import type { MatchedLine } from '@/reports/match';
import type { ParsedReport, RawLine } from '@/reports/types';
import { downloadUrl, kop } from '@/ui/money';

type Client = { id: number; name: string; fops: { id: number; name: string }[] };
type OurFop = { id: number; name: string; archived: boolean };
type Parsed = { report: Omit<ParsedReport, 'lines'>; matched: (MatchedLine & { ourName: string | null })[]; unmatched: RawLine[]; conflicts: string[] };
type Kind = 'POVERNENNYA' | 'PEREOTSINKA';
type PartyKey = string; // 'our:ID' | 'client:ID'

const keyOf = (r: AggRow) => `${r.sku}|${r.priceKop}`;
const toKop = (s: string) => { const n = Number(s.replace(',', '.').trim()); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const party = (k: PartyKey) => { const [type, id] = k.split(':'); return { type: type as 'our' | 'client', id: Number(id) }; };

export function ReportsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [ourFops, setOurFops] = useState<OurFop[]>([]);
  const [clientId, setClientId] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Parsed | null>(null);
  const [store, setStore] = useState('ALL');
  const [newPrice, setNewPrice] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/clients').then(r => r.json()).then(setClients);
    void fetch('/api/fops').then(r => r.json()).then((f: OurFop[]) => setOurFops(f.filter(x => !x.archived)));
  }, []);
  const client = clients.find(c => c.id === clientId);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !file) { setError('Оберіть клієнта і файл'); return; }
    setBusy(true); setError(''); setInfo('');
    const fd = new FormData(); fd.set('clientId', String(clientId)); fd.set('file', file);
    const res = await fetch('/api/reports/parse', { method: 'POST', body: fd });
    const j = await res.json().catch(() => ({ error: 'Помилка' }));
    setBusy(false);
    if (!res.ok) { setData(null); setError(j.error ?? 'Помилка'); return; }
    setData(j); setStore('ALL'); setNewPrice({}); setManual({});
  }

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of data?.matched ?? []) if (!m.has(l.sku)) m.set(l.sku, l.ourName ?? `${l.name} (з звіту)`);
    return m;
  }, [data]);
  const rows = useMemo(() => (data ? aggregate(data.matched, store) : []), [data, store]);
  const missingPrice = rows.filter(r => r.qty > 0 && !toKop(newPrice[keyOf(r)] ?? ''));
  const storeLabel = store === 'ALL' ? 'Усі магазини' : store;

  async function mapCode(l: RawLine) {
    const sku = (manual[l.code] ?? '').trim();
    const res = await fetch('/api/reports/codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, code: l.code, sku }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Помилка'); return; }
    setData(d => d && {
      ...d,
      matched: [...d.matched, ...d.unmatched.filter(u => u.code === l.code).map(u => ({ ...u, sku: j.sku, ourName: j.ourName }))],
      unmatched: d.unmatched.filter(u => u.code !== l.code),
    });
  }

  async function exportXlsx() {
    if (!data) return;
    const res = await fetch('/api/reports/export', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meta: { client: client?.name ?? data.report.client, title: data.report.title, kind: data.report.kind, dateFrom: data.report.dateFrom, dateTo: data.report.dateTo, store: storeLabel }, rows: rows.map(r => ({ ...r, name: names.get(r.sku) ?? '', newPriceKop: toKop(newPrice[keyOf(r)] ?? '') })) }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Помилка'); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url });
    a.setAttribute('download', decodeURIComponent(res.headers.get('x-filename') ?? 'report.xlsx'));
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const partyOptions = [
    ...ourFops.map(f => ({ key: `our:${f.id}`, label: `Наш: ${f.name}` })),
    ...(client?.fops ?? []).map(f => ({ key: `client:${f.id}`, label: `Клієнт: ${f.name}` })),
  ];

  return (
    <>
      <h1>Звіти клієнтів</h1>
      <form className="card row" onSubmit={upload}>
        <div><label htmlFor="rc">Клієнт</label>
          <select id="rc" value={clientId} onChange={e => { setClientId(Number(e.target.value)); setData(null); }}>
            <option value={0}>— оберіть —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label htmlFor="rf">Файл звіту (.xls, .xlsx)</label><input id="rf" type="file" accept=".xls,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        <button className="primary" disabled={busy}>Завантажити</button>
      </form>
      {error && <div className="card error" role="status">{error}</div>}
      {info && <div className="card">{info}</div>}

      {data && (
        <>
          <div className="card row" style={{ alignItems: 'center' }}>
            <b style={{ flex: 1 }}>{client?.name} · Bagel · «{data.report.title}» {data.report.dateFrom ? `${data.report.dateFrom} – ${data.report.dateTo}` : `на ${data.report.dateTo}`} · магазинів: {data.report.stores.length}</b>
            <div><label htmlFor="rs">Магазин</label>
              <select id="rs" value={store} onChange={e => setStore(e.target.value)}>
                <option value="ALL">Усі</option>
                {data.report.stores.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>

          {data.unmatched.length > 0 && (
            <div className="card">
              <h2 className="error" style={{ marginTop: 0 }}>⚠ Не розпізнано ({data.unmatched.length})</h2>
              {[...new Map(data.unmatched.map(u => [u.code, u])).values()].map(u => (
                <div key={u.code} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ flex: 1 }}>{u.code} «{u.name}» {u.barcode && <span className="muted">штрихкод {u.barcode}</span>}</span>
                  <input aria-label={`Наш артикул для ${u.code}`} placeholder="наш артикул" style={{ width: 110 }} value={manual[u.code] ?? ''} onChange={e => setManual(m => ({ ...m, [u.code]: e.target.value }))} />
                  <button onClick={() => mapCode(u)}>Зберегти</button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <button onClick={() => setNewPrice(Object.fromEntries(rows.map(r => [keyOf(r), (r.priceKop / 100).toFixed(2)])))}>Заповнити старою ціною</button>
              <button onClick={exportXlsx}>Excel (наш формат)</button>
            </div>
            <table>
              <thead><tr><th>№</th><th>Артикул</th><th>Назва</th>
                {data.report.kind === 'turnover' && <><th className="num">На початок</th><th className="num">Прихід</th><th className="num">Продано</th></>}
                <th className="num">{data.report.kind === 'turnover' ? 'На кінець' : 'К-сть'}</th><th className="num">Стара ціна</th><th className="num">Нова ціна</th><th className="num">Сума стара</th><th className="num">Сума нова</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const np = toKop(newPrice[keyOf(r)] ?? '');
                  return (
                    <tr key={keyOf(r)}>
                      <td>{i + 1}</td><td>{r.sku}</td><td>{names.get(r.sku)}</td>
                      {data.report.kind === 'turnover' && <><td className="num">{r.opening}</td><td className="num">{r.incoming}</td><td className="num">{r.soldRetail + r.soldOther}</td></>}
                      <td className="num">{r.qty}</td><td className="num">{kop(r.priceKop)}</td>
                      <td className="num"><input aria-label={`Нова ціна ${r.sku}`} style={{ width: 90, textAlign: 'right' }} inputMode="decimal" value={newPrice[keyOf(r)] ?? ''} onChange={e => setNewPrice(p => ({ ...p, [keyOf(r)]: e.target.value }))} /></td>
                      <td className="num">{kop(Math.round(r.qty * r.priceKop))}</td><td className="num">{np ? kop(Math.round(r.qty * np)) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ alignItems: 'stretch' }}>
            <DocForm kind="POVERNENNYA" title="Накладна на повернення" hint="За старими цінами зі звіту"
              clientId={clientId} options={partyOptions} defaults={{ supplier: client?.fops[0] ? `client:${client.fops[0].id}` : '', recipient: ourFops[0] ? `our:${ourFops[0].id}` : '' }}
              lines={rows.filter(r => r.qty > 0).map(r => ({ sku: r.sku, name: names.get(r.sku) ?? '', qty: r.qty, priceKop: r.priceKop }))}
              blocker={null} onError={setError} onDone={setInfo} />
            <DocForm kind="PEREOTSINKA" title="Видаткова накладна (переоцінка)" hint="За новими цінами"
              clientId={clientId} options={partyOptions} defaults={{ supplier: ourFops[0] ? `our:${ourFops[0].id}` : '', recipient: client?.fops[0] ? `client:${client.fops[0].id}` : '' }}
              lines={rows.filter(r => r.qty > 0).map(r => ({ sku: r.sku, name: names.get(r.sku) ?? '', qty: r.qty, priceKop: toKop(newPrice[keyOf(r)] ?? '') ?? 0 }))}
              blocker={missingPrice.length ? `Вкажіть нову ціну для всіх рядків (бракує ${missingPrice.length})` : null} onError={setError} onDone={setInfo} />
          </div>
        </>
      )}
    </>
  );
}

function DocForm({ kind, title, hint, clientId, options, defaults, lines, blocker, onError, onDone }: {
  kind: Kind; title: string; hint: string; clientId: number;
  options: { key: string; label: string }[]; defaults: { supplier: PartyKey; recipient: PartyKey };
  lines: { sku: string; name: string; qty: number; priceKop: number }[]; blocker: string | null;
  onError: (s: string) => void; onDone: (s: string) => void;
}) {
  const [supplier, setSupplier] = useState(defaults.supplier);
  const [recipient, setRecipient] = useState(defaults.recipient);
  const [date, setDate] = useState(today());
  const [number, setNumber] = useState('');
  useEffect(() => { setSupplier(s => s || defaults.supplier); setRecipient(r => r || defaults.recipient); }, [defaults.supplier, defaults.recipient]);

  // suggest the next number from our side's counter
  const ours = kind === 'POVERNENNYA' ? recipient : supplier;
  useEffect(() => {
    if (!ours.startsWith('our:') || !date) return;
    void fetch(`/api/report-documents/next-number?kind=${kind}&fopId=${ours.slice(4)}&date=${date}`).then(r => r.json()).then(j => j.number && setNumber(String(j.number)));
  }, [kind, ours, date]);

  async function create(allowDuplicate = false) {
    onError('');
    const res = await fetch('/api/report-documents', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ kind, number: Number(number), date, supplier: party(supplier), recipient: party(recipient), clientId, lines, allowDuplicate }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 409 && j.code === 'DUPLICATE_NUMBER') {
      if (confirm(`${j.error}. Все одно сформувати з цим номером?`)) return create(true);
      return;
    }
    if (!res.ok) { onError(j.issues?.[0]?.message ?? j.error ?? 'Помилка'); return; }
    downloadUrl(`/api/report-documents/${j.id}/file`);
    onDone(`Сформовано: ${j.filename}`);
  }

  const sel = (id: string, label: string, v: string, set: (s: string) => void) => (
    <div style={{ marginBottom: 8 }}><label htmlFor={id}>{label}</label>
      <select id={id} value={v} onChange={e => set(e.target.value)} style={{ width: '100%' }}>
        <option value="">— оберіть —</option>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select></div>
  );
  const id = kind.toLowerCase();
  const disabled = !!blocker || !supplier || !recipient || !Number(number) || lines.length === 0;
  return (
    <div className="card" style={{ flex: 1, minWidth: 300 }}>
      <h2>{title}</h2>
      <div className="muted" style={{ marginBottom: 8 }}>{hint}</div>
      {sel(`${id}-s`, 'Постачальник', supplier, setSupplier)}
      {sel(`${id}-r`, 'Одержувач', recipient, setRecipient)}
      <div className="row">
        <div><label htmlFor={`${id}-d`}>Дата</label><input id={`${id}-d`} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label htmlFor={`${id}-n`}>Номер</label><input id={`${id}-n`} inputMode="numeric" style={{ width: 90 }} value={number} onChange={e => setNumber(e.target.value)} /></div>
      </div>
      <button className="primary" style={{ marginTop: 10 }} disabled={disabled} onClick={() => create()}>{title} (.xlsx)</button>
      {blocker && <div className="error">{blocker}</div>}
    </div>
  );
}
