'use client';
import { useMemo, useState } from 'react';

export type RecipientOption = { id: number; clientId: number; clientName: string; fopName: string; requisites: string };

const ipn = (requisites: string) => requisites.split('\n').find(l => /ІПН|ЄДРПОУ|ЕДРПОУ/i.test(l))?.trim() ?? '';
const label = (o: RecipientOption) => `${o.clientName} — ${o.fopName}${ipn(o.requisites) ? ` (${ipn(o.requisites)})` : ''}`;

/**
 * Recipient FOP picker for «Новий документ»: type to filter by client, FOP or requisites (ІПН/IBAN),
 * shows the chosen FOP's requisites, and lets the manager add a client / FOP without leaving the page.
 */
export function RecipientPicker({ options, value, onChange, onCreated }: {
  options: RecipientOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreated: (option: RecipientOption) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const chosen = options.find(o => o.id === value) ?? null;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter(o => `${o.clientName}\n${o.fopName}\n${o.requisites}`.toLowerCase().includes(s)) : options).slice(0, 50);
  }, [q, options]);
  const clients = useMemo(() => [...new Map(options.map(o => [o.clientId, o.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'uk')), [options]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const clientId = Number(f.get('clientId'));
    const fop = { name: String(f.get('fopName') ?? ''), requisites: String(f.get('requisites') ?? '') };
    const res = clientId
      ? await fetch(`/api/clients/${clientId}/fops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fop) })
      : await fetch('/api/clients', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.get('clientName'), phone: f.get('phone'), fop }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.issues?.[0]?.message ?? j.error ?? 'Помилка'); return; }
    const created = clientId ? j : j.fops[0];
    const clientName = clientId ? clients.find(c => c[0] === clientId)?.[1] ?? '' : j.name;
    onCreated({ id: created.id, clientId: clientId || j.id, clientName, fopName: created.name, requisites: created.requisites });
    setAdding(false);
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          aria-label="Одержувач"
          placeholder="Пошук: клієнт, ФОП або ІПН"
          value={open ? q : chosen ? label(chosen) : q}
          onFocus={() => { setOpen(true); setQ(''); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          style={{ width: '100%' }}
        />
        {open && (
          <ul role="listbox" style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, maxHeight: 260, overflow: 'auto', margin: 0, padding: 0, listStyle: 'none', background: '#fff', border: '1px solid var(--line)', borderRadius: 6 }}>
            {shown.length === 0 && <li className="muted" style={{ padding: '6px 9px' }}>Нічого не знайдено</li>}
            {shown.map(o => (
              <li key={o.id} role="option" aria-selected={o.id === value} onMouseDown={() => { onChange(o.id); setOpen(false); setQ(''); }} style={{ padding: '6px 9px', cursor: 'pointer', background: o.id === value ? 'var(--mix)' : undefined }}>
                {label(o)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {chosen && <div style={{ whiteSpace: 'pre-line', marginTop: 8 }}><b>{chosen.fopName}</b>{'\n'}{chosen.requisites}</div>}
      {!adding && <button type="button" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>+ Новий клієнт / ФОП</button>}
      {adding && (
        <form onSubmit={create} style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <label htmlFor="np-client">Клієнт</label>
          <select id="np-client" name="clientId" defaultValue="0" style={{ width: '100%', marginBottom: 8 }} onChange={e => { (e.currentTarget.form!.elements.namedItem('clientName') as HTMLInputElement).disabled = e.currentTarget.value !== '0'; }}>
            <option value="0">Новий клієнт</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="row" style={{ marginBottom: 8 }}>
            <div style={{ flex: 2 }}><label htmlFor="np-name">Назва нового клієнта</label><input id="np-name" name="clientName" style={{ width: '100%' }} /></div>
            <div style={{ flex: 1 }}><label htmlFor="np-phone">Телефон</label><input id="np-phone" name="phone" style={{ width: '100%' }} /></div>
          </div>
          <label htmlFor="np-fop">Назва ФОП</label>
          <input id="np-fop" name="fopName" required style={{ width: '100%', marginBottom: 8 }} />
          <label htmlFor="np-req">Реквізити ФОП (кожне з нового рядка)</label>
          <textarea id="np-req" name="requisites" required placeholder={'Юр. адреса: …\nIBAN … в …\nІПН …'} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary">Зберегти і обрати</button>
            <button type="button" onClick={() => setAdding(false)}>Скасувати</button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
