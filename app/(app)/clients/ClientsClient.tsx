'use client';
import { useEffect, useState } from 'react';

type Fop = { id: number; name: string; requisites: string; archived: boolean };
type Client = { id: number; name: string; phone: string; comment: string; fops: Fop[] };
const REQ_HINT = 'Юр. адреса: …\nIBAN … в …\nІПН …';

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.issues?.[0]?.message ?? j.error ?? 'Помилка';
}

export function ClientsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [edit, setEdit] = useState<string | null>(null); // 'client:ID' | 'fop:ID' | 'addfop:ID' | 'new'
  const [error, setError] = useState('');

  const load = async (query = q, arch = archived) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (arch) params.set('archived', '1');
    const res = await fetch(`/api/clients?${params}`);
    if (res.ok) setClients(await res.json());
  };
  useEffect(() => { void load('', false); }, []);

  async function save(url: string, method: 'POST' | 'PATCH', body: unknown) {
    setError('');
    const err = await send(url, method, body);
    if (err) { setError(err); return false; }
    setEdit(null);
    await load();
    return true;
  }
  const fd = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget); };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Клієнти</h1>
        <button className="primary" onClick={() => { setEdit('new'); setError(''); }}>+ Новий клієнт</button>
      </div>

      {edit === 'new' && (
        <form className="card" onSubmit={async e => {
          const f = fd(e);
          const fopName = String(f.get('fopName') ?? '').trim();
          await save('/api/clients', 'POST', { name: f.get('name'), phone: f.get('phone'), comment: f.get('comment'), ...(fopName ? { fop: { name: fopName, requisites: f.get('requisites') } } : {}) });
        }}>
          <h2>Новий клієнт</h2>
          <ClientFields />
          <label htmlFor="new-fop">Перший ФОП (можна додати пізніше)</label>
          <input id="new-fop" name="fopName" placeholder="ФОП Прізвище Ім'я По батькові" style={{ width: '100%', marginBottom: 8 }} />
          <label htmlFor="new-req">Реквізити ФОП</label>
          <textarea id="new-req" name="requisites" placeholder={REQ_HINT} />
          <FormButtons onCancel={() => setEdit(null)} />
        </form>
      )}

      <form className="card row" onSubmit={e => { e.preventDefault(); void load(); }}>
        <div style={{ flex: 1 }}><label htmlFor="cq">Пошук: клієнт, телефон, ФОП, ІПН</label><input id="cq" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%' }} /></div>
        <button>Знайти</button>
        <label style={{ marginBottom: 8 }}><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); void load(q, e.target.checked); }} /> показати архівні ФОП</label>
      </form>
      {error && <div className="card error" role="status">{error}</div>}

      <div className="card">
        {clients.length === 0 && <div className="muted">Клієнтів не знайдено</div>}
        {clients.map(c => {
          const open = openId === c.id || !!q.trim();
          return (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              {edit === `client:${c.id}` ? (
                <form onSubmit={async e => { const f = fd(e); await save(`/api/clients/${c.id}`, 'PATCH', { name: f.get('name'), phone: f.get('phone'), comment: f.get('comment') }); }}>
                  <ClientFields c={c} />
                  <FormButtons onCancel={() => setEdit(null)} />
                </form>
              ) : (
                <div className="row" style={{ alignItems: 'center' }}>
                  <button type="button" onClick={() => setOpenId(open && openId === c.id ? null : c.id)} style={{ border: 0, background: 'none', padding: 0, fontWeight: 600, textAlign: 'left', flex: 1 }}>
                    {open ? '▾' : '▸'} {c.name}
                    <span className="muted" style={{ fontWeight: 400 }}>{c.phone && ` · ${c.phone}`} · {c.fops.length} ФОП{c.comment && ` · ${c.comment}`}</span>
                  </button>
                  <button onClick={() => { setEdit(`client:${c.id}`); setError(''); }}>Змінити</button>
                </div>
              )}

              {open && (
                <div style={{ paddingLeft: 22, marginTop: 6 }}>
                  {c.fops.map(f => edit === `fop:${f.id}` ? (
                    <form key={f.id} onSubmit={async e => { const d = fd(e); await save(`/api/client-fops/${f.id}`, 'PATCH', { name: d.get('fopName'), requisites: d.get('requisites') }); }} style={{ margin: '6px 0' }}>
                      <FopFields f={f} />
                      <FormButtons onCancel={() => setEdit(null)} />
                    </form>
                  ) : (
                    <div key={f.id} className="row" style={{ alignItems: 'flex-start', margin: '6px 0', opacity: f.archived ? 0.55 : 1 }}>
                      <div style={{ flex: 1, whiteSpace: 'pre-line' }}><b>{f.name}</b>{f.archived && <span className="pill annulled" style={{ marginLeft: 6 }}>архів</span>}{'\n'}<span className="muted">{f.requisites}</span></div>
                      <button onClick={() => { setEdit(`fop:${f.id}`); setError(''); }}>Змінити</button>
                      <button onClick={() => save(`/api/client-fops/${f.id}`, 'PATCH', { archived: !f.archived })}>{f.archived ? 'Повернути з архіву' : 'В архів'}</button>
                    </div>
                  ))}
                  {edit === `addfop:${c.id}` ? (
                    <form onSubmit={async e => { const d = fd(e); await save(`/api/clients/${c.id}/fops`, 'POST', { name: d.get('fopName'), requisites: d.get('requisites') }); }} style={{ margin: '6px 0' }}>
                      <FopFields />
                      <FormButtons onCancel={() => setEdit(null)} />
                    </form>
                  ) : (
                    <button onClick={() => { setEdit(`addfop:${c.id}`); setError(''); }}>+ Додати ФОП</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ClientFields({ c }: { c?: Client }) {
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <div style={{ flex: 2, minWidth: 200 }}><label>Назва клієнта</label><input name="name" aria-label="Назва клієнта" defaultValue={c?.name} required style={{ width: '100%' }} /></div>
      <div style={{ flex: 1, minWidth: 140 }}><label>Телефон</label><input name="phone" aria-label="Телефон" defaultValue={c?.phone} style={{ width: '100%' }} /></div>
      <div style={{ flex: 2, minWidth: 200 }}><label>Коментар</label><input name="comment" aria-label="Коментар" defaultValue={c?.comment} style={{ width: '100%' }} /></div>
    </div>
  );
}

function FopFields({ f }: { f?: Fop }) {
  return (
    <>
      <label>Назва ФОП</label>
      <input name="fopName" aria-label="Назва ФОП" defaultValue={f?.name} required style={{ width: '100%', marginBottom: 8 }} />
      <label>Реквізити ФОП (кожне з нового рядка)</label>
      <textarea name="requisites" aria-label="Реквізити ФОП" defaultValue={f?.requisites} required placeholder={REQ_HINT} />
    </>
  );
}

function FormButtons({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="row" style={{ marginTop: 8 }}>
      <button className="primary">Зберегти</button>
      <button type="button" onClick={onCancel}>Скасувати</button>
    </div>
  );
}
