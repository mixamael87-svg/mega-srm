'use client';
import { useEffect, useState } from 'react';

type Fop = { id: number; name: string; requisites: string; phone: string; isDefault: boolean; archived: boolean; sdOrganizationId: number | null };
type Pending = { id: number; name: string; text: string };
const docsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'документ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'документи' : 'документів');
const EXAMPLE = 'Юр. адреса: м. Київ, вул. …\nIBAN UA… в АТ КБ "ПРИВАТБАНК"\nІПН …';

export function FopsClient({ isAdmin }: { isAdmin: boolean }) {
  const [fops, setFops] = useState<Fop[]>([]);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const load = async () => setFops(await (await fetch('/api/fops')).json());
  useEffect(() => { void load(); }, []);

  async function send(method: 'POST' | 'PATCH', body: unknown) {
    const res = await fetch('/api/fops', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    setMsg(res.ok ? 'Збережено' : (j.issues?.[0]?.message ?? j.error));
    if (res.ok) await load();
    return res.ok;
  }
  async function importSd() {
    const res = await fetch('/api/fops/import', { method: 'POST' });
    const j = await res.json();
    setMsg(res.ok ? `Знайдено в SalesDrive: ${j.found}, додано: ${j.created}` : j.error);
    await load();
  }
  /** Step 1 of 2: warning panel — wording depends on whether the FOP has documents. */
  async function askDelete(f: Fop) {
    const res = await fetch(`/api/fops/${f.id}`);
    const u = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(u.error ?? 'Помилка'); return; }
    const text = u.documents
      ? `По ФОП «${f.name}» є ${u.documents} ${docsWord(u.documents)}, тому його не можна видалити назавжди — його буде приховано: він зникне з вибору постачальника, а історія і нумерація рахунків збережуться. Повернути можна кнопкою «Повернути».`
      : `Видалити ФОП «${f.name}»? Документів по ньому немає — його буде видалено назавжди.`;
    setPending({ id: f.id, name: f.name, text });
  }
  /** Step 2 of 2: final confirmation. */
  async function doDelete(p: Pending) {
    if (!confirm(`Остаточно прибрати ФОП «${p.name}»? Це не можна скасувати.`)) return;
    const res = await fetch(`/api/fops/${p.id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    setPending(null);
    setMsg(!res.ok ? (j.error ?? 'Помилка') : j.deleted ? `ФОП «${p.name}» видалено` : `ФОП «${p.name}» приховано (архів)`);
    await load();
  }
  const read = (f: FormData) => ({ name: f.get('name'), phone: f.get('phone') ?? '', requisites: f.get('requisites') ?? '', isDefault: f.get('isDefault') === 'on' });

  return (
    <>
      <h1>Наші ФОП</h1>
      <div className="card row">
        <button onClick={importSd}>Імпортувати з SalesDrive</button>
        <span className="muted">SalesDrive віддає лише організації, що трапляються в його документах; решту додайте вручну.</span>
      </div>
      {msg && <div className="card">{msg}</div>}
      {pending && (
        <div className="card" role="alertdialog" style={{ borderColor: 'var(--warn)', background: '#fbeee9' }}>
          <div className="error" style={{ marginTop: 0, marginBottom: 10 }}>{pending.text}</div>
          <div className="row">
            <button className="primary" style={{ background: 'var(--warn)', borderColor: 'var(--warn)' }} onClick={() => doDelete(pending)}>Так, видалити</button>
            <button onClick={() => setPending(null)}>Скасувати</button>
          </div>
        </div>
      )}
      {fops.map(f => (
        <form key={f.id} className="card" onSubmit={e => { e.preventDefault(); void send('PATCH', { id: f.id, ...read(new FormData(e.currentTarget)) }); }}>
          {f.archived && <div style={{ marginBottom: 8 }}><span className="pill annulled">архів</span> <span className="muted">не пропонується як постачальник</span></div>}
          <FopFields f={f} />
          <div className="row">
            <button className="primary">Зберегти</button>
            {isAdmin && (f.archived
              ? <button type="button" onClick={() => send('PATCH', { id: f.id, archived: false })}>Повернути</button>
              : <button type="button" onClick={() => askDelete(f)}>Видалити</button>)}
          </div>
        </form>
      ))}
      <form className="card" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; if (await send('POST', read(new FormData(form)))) form.reset(); }}>
        <h2>Додати ФОП</h2>
        <FopFields />
        <button className="primary">Додати</button>
      </form>
    </>
  );
}

function FopFields({ f }: { f?: Fop }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{ flex: 2, minWidth: 260 }}>
        <label>Назва</label><input name="name" defaultValue={f?.name} required style={{ width: '100%', marginBottom: 8 }} />
        <label>Реквізити (кожне з нового рядка)</label><textarea name="requisites" defaultValue={f?.requisites} placeholder={EXAMPLE} />
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <label>Телефон</label><input name="phone" defaultValue={f?.phone} style={{ width: '100%', marginBottom: 8 }} />
        <label><input type="checkbox" name="isDefault" defaultChecked={f?.isDefault} /> основний</label>
        {f?.sdOrganizationId && <div className="muted">SalesDrive id {f.sdOrganizationId}</div>}
      </div>
    </div>
  );
}
