'use client';
import { useEffect, useMemo, useState } from 'react';
import { aggregateByCode, type CodeRow } from '@/reports/aggregate';
import type { ParsedReport, RawLine } from '@/reports/types';
import { downloadUrl, kop } from '@/ui/money';

type Client = { id: number; name: string; fops: { id: number; name: string }[] };
type OurFop = { id: number; name: string; archived: boolean };
type Source = 'barcode' | 'saved' | 'name' | null;
type Line = RawLine & { sku: string | null; source: Source };
type Parsed = { report: Omit<ParsedReport, 'lines'>; lines: Line[]; conflicts: string[]; catalog: Record<string, string> };
type Kind = 'POVERNENNYA' | 'PEREOTSINKA';
type PartyKey = string; // 'our:ID' | 'client:ID'
type SkuState = { sku: string; source: Source };

const keyOf = (r: CodeRow) => `${r.code}|${r.priceKop}`;
const toKop = (s: string) => { const n = Number(s.replace(',', '.').trim()); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const party = (k: PartyKey) => { const [type, id] = k.split(':'); return { type: type as 'our' | 'client', id: Number(id) }; };
const exact = (s: Source) => s === 'barcode' || s === 'saved';
const DOT: Record<string, string> = { exact: '🟢', name: '🟡', none: '⚪' };
const dot = (st: SkuState | undefined) => (st && exact(st.source) ? DOT.exact : st?.sku && st.source === 'name' ? DOT.name : DOT.none);

export function ReportsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [ourFops, setOurFops] = useState<OurFop[]>([]);
  const [clientId, setClientId] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Parsed | null>(null);
  const [store, setStore] = useState('ALL');
  const [skus, setSkus] = useState<Record<string, SkuState>>({}); // by client code
  const [newPrice, setNewPrice] = useState<Record<string, string>>({}); // by code|price
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
    const p = j as Parsed;
    const st: Record<string, SkuState> = {};
    for (const l of p.lines) if (!st[l.code] || (exact(l.source) && !exact(st[l.code]!.source))) st[l.code] = { sku: l.sku ?? '', source: l.source };
    const prices: Record<string, string> = {};
    for (const r of aggregateByCode(p.lines, 'ALL')) prices[keyOf(r)] = (r.priceKop / 100).toFixed(2); // new price starts as the purchase price
    setData(p); setSkus(st); setNewPrice(prices); setStore('ALL');
  }

  const rows = useMemo(() => (data ? aggregateByCode(data.lines, store) : []), [data, store]);
  const nameFor = (r: CodeRow) => { const sku = skus[r.code]?.sku; return (sku && data?.catalog[sku]) || `${r.name} (з звіту)`; };
  const pending = rows.filter(r => !exact(skus[r.code]?.source ?? null) || !/^\d{4}$/.test(skus[r.code]?.sku ?? ''));
  const yellow = pending.filter(r => skus[r.code]?.source === 'name' && /^\d{4}$/.test(skus[r.code]!.sku));
  const storeLabel = store === 'ALL' ? 'Усі магазини' : store;

  async function saveCodes(items: { code: string; sku: string }[]) {
    if (items.length === 0) return;
    setError('');
    const res = await fetch('/api/reports/codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, items }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Помилка'); return; }
    setSkus(s => { const n = { ...s }; for (const it of j.items as { code: string; sku: string; ourName: string | null }[]) n[it.code] = { sku: it.sku, source: 'saved' }; return n; });
    setData(d => d && { ...d, catalog: { ...d.catalog, ...Object.fromEntries((j.items as { sku: string; ourName: string | null }[]).filter(i => i.ourName).map(i => [i.sku, i.ourName!])) } });
  }

  /** Document/Excel lines grouped by our SKU and price. */
  function docLines(price: (r: CodeRow) => number) {
    const m = new Map<string, { sku: string; name: string; qty: number; priceKop: number }>();
    for (const r of rows) {
      if (r.qty <= 0) continue;
      const sku = skus[r.code]!.sku, p = price(r), k = `${sku}|${p}`;
      const x = m.get(k) ?? { sku, name: nameFor(r), qty: 0, priceKop: p };
      x.qty += r.qty; m.set(k, x);
    }
    return [...m.values()];
  }

  async function exportXlsx() {
    if (!data) return;
    const bySku = new Map<string, { sku: string; name: string; priceKop: number; newPriceKop: number | null; qty: number; opening: number; incoming: number; soldRetail: number; soldOther: number }>();
    for (const r of rows) {
      const sku = skus[r.code]!.sku, np = toKop(newPrice[keyOf(r)] ?? ''), k = `${sku}|${r.priceKop}|${np}`;
      const x = bySku.get(k) ?? { sku, name: nameFor(r), priceKop: r.priceKop, newPriceKop: np, qty: 0, opening: 0, incoming: 0, soldRetail: 0, soldOther: 0 };
      x.qty += r.qty; x.opening += r.opening; x.incoming += r.incoming; x.soldRetail += r.soldRetail; x.soldOther += r.soldOther;
      bySku.set(k, x);
    }
    const res = await fetch('/api/reports/export', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meta: { client: client?.name ?? data.report.client, title: data.report.title, kind: data.report.kind, dateFrom: data.report.dateFrom, dateTo: data.report.dateTo, store: storeLabel }, rows: [...bySku.values()] }),
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
  const skuBlocker = pending.length ? `Підтвердіть або виправте артикули: ${pending.length}` : null;
  const missingPrice = rows.filter(r => r.qty > 0 && !toKop(newPrice[keyOf(r)] ?? ''));

  return (
    <>
      <h1>Звіти клієнтів</h1>
      <form className="card row" onSubmit={upload}>
        <div><label htmlFor="rc">Клієнт</label>
          <select id="rc" value={clientId} onChange={e => { setClientId(Number(e.target.value)); setData(null); }}>
            <option value={0}>— оберіть —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div style={{ flex: 1, minWidth: 260 }}><label htmlFor="rf">Файл звіту (.xls, .xlsx)</label><FileDrop file={file} onFile={setFile} /></div>
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

          <div className="card">
            <div className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
              <span className="muted" style={{ flex: 1 }}>🟢 точно (штрихкод або збережено) · 🟡 підібрано за назвою — перевірте · ⚪ не знайдено — впишіть артикул</span>
              {yellow.length > 0 && <button onClick={() => saveCodes(yellow.map(r => ({ code: r.code, sku: skus[r.code]!.sku })))}>Підтвердити всі 🟡 ({yellow.length})</button>}
              <button onClick={exportXlsx} disabled={!!skuBlocker}>Excel (наш формат)</button>
            </div>
            {skuBlocker && <div className="error" style={{ marginBottom: 8 }}>{skuBlocker}</div>}
            <table>
              <thead><tr><th>№</th><th>Товар у звіті клієнта</th><th>Артикул</th><th>Наша назва</th>
                {data.report.kind === 'turnover' && <><th className="num">На початок</th><th className="num">Прихід</th><th className="num">Продано</th></>}
                <th className="num">{data.report.kind === 'turnover' ? 'На кінець' : 'К-сть'}</th><th className="num">Стара ціна</th><th className="num">Нова ціна</th><th className="num">Сума стара</th><th className="num">Сума нова</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = skus[r.code];
                  const np = toKop(newPrice[keyOf(r)] ?? '');
                  return (
                    <tr key={keyOf(r)}>
                      <td>{i + 1}</td>
                      <td>{r.name} <span className="muted">· {r.code}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span title={st?.source ?? ''}>{dot(st)}</span>{' '}
                        <input aria-label={`Артикул ${r.code}`} style={{ width: 64 }} inputMode="numeric" value={st?.sku ?? ''}
                          onChange={e => setSkus(s => ({ ...s, [r.code]: { sku: e.target.value.trim(), source: null } }))}
                          onBlur={e => { const v = e.target.value.trim(); if (/^\d{4}$/.test(v) && !exact(skus[r.code]?.source ?? null) && skus[r.code]?.source !== 'name') void saveCodes([{ code: r.code, sku: v }]); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                        {st?.source === 'name' && /^\d{4}$/.test(st.sku) && <button aria-label={`Підтвердити ${r.code}`} style={{ marginLeft: 4, padding: '2px 8px' }} onClick={() => saveCodes([{ code: r.code, sku: st.sku }])}>✓</button>}
                      </td>
                      <td>{st?.sku && data.catalog[st.sku] ? data.catalog[st.sku] : <span className="muted">—</span>}</td>
                      {data.report.kind === 'turnover' && <><td className="num">{r.opening}</td><td className="num">{r.incoming}</td><td className="num">{r.soldRetail + r.soldOther}</td></>}
                      <td className="num">{r.qty}</td><td className="num">{kop(r.priceKop)}</td>
                      <td className="num"><input aria-label={`Нова ціна ${r.code}`} style={{ width: 90, textAlign: 'right' }} inputMode="decimal" value={newPrice[keyOf(r)] ?? ''} onChange={e => setNewPrice(p => ({ ...p, [keyOf(r)]: e.target.value }))} /></td>
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
              lines={skuBlocker ? [] : docLines(r => r.priceKop)}
              blocker={skuBlocker} onError={setError} onDone={setInfo} />
            <DocForm kind="PEREOTSINKA" title="Видаткова накладна (переоцінка)" hint="За новими цінами"
              clientId={clientId} options={partyOptions} defaults={{ supplier: ourFops[0] ? `our:${ourFops[0].id}` : '', recipient: client?.fops[0] ? `client:${client.fops[0].id}` : '' }}
              lines={skuBlocker ? [] : docLines(r => toKop(newPrice[keyOf(r)] ?? '') ?? 0)}
              blocker={skuBlocker ?? (missingPrice.length ? `Вкажіть нову ціну для всіх рядків (бракує ${missingPrice.length})` : null)} onError={setError} onDone={setInfo} />
          </div>
        </>
      )}
    </>
  );
}

/** Drop zone for the report file: drag a file onto it or click to choose. */
function FileDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [drag, setDrag] = useState(false);
  const ok = (f: File | undefined) => (f && /\.(xls|xlsx)$/i.test(f.name) ? f : null);
  return (
    <label
      htmlFor="rf"
      data-testid="report-drop"
      className={drag ? 'drop drag' : 'drop'}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = ok(e.dataTransfer.files?.[0]); if (f) onFile(f); }}
    >
      <input id="rf" type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={e => onFile(ok(e.target.files?.[0] ?? undefined))} />
      {file ? <><b>{file.name}</b> <span className="muted">· натисніть або перетягніть інший файл</span></> : <span className="muted">Перетягніть файл сюди або натисніть, щоб вибрати</span>}
    </label>
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
