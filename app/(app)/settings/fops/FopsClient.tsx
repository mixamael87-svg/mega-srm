'use client';
import { useEffect, useState } from 'react';

type Fop = { id: number; name: string; requisites: string; phone: string; isDefault: boolean; sdOrganizationId: number | null };
const EXAMPLE = 'Юр. адреса: м. Київ, вул. …\nIBAN UA… в АТ КБ "ПРИВАТБАНК"\nІПН …';

export function FopsClient() {
  const [fops, setFops] = useState<Fop[]>([]);
  const [msg, setMsg] = useState('');
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
  const read = (f: FormData) => ({ name: f.get('name'), phone: f.get('phone') ?? '', requisites: f.get('requisites') ?? '', isDefault: f.get('isDefault') === 'on' });

  return (
    <>
      <h1>Наші ФОП</h1>
      <div className="card row">
        <button onClick={importSd}>Імпортувати з SalesDrive</button>
        <span className="muted">SalesDrive віддає лише організації, що трапляються в його документах; решту додайте вручну.</span>
      </div>
      {msg && <div className="card">{msg}</div>}
      {fops.map(f => (
        <form key={f.id} className="card" onSubmit={e => { e.preventDefault(); void send('PATCH', { id: f.id, ...read(new FormData(e.currentTarget)) }); }}>
          <FopFields f={f} />
          <button className="primary">Зберегти</button>
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
