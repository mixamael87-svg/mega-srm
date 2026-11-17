'use client';
import { useEffect, useState } from 'react';

type U = { id: number; login: string; role: 'admin' | 'manager'; active: boolean };

export function UsersClient({ meId }: { meId: number }) {
  const [users, setUsers] = useState<U[]>([]);
  const [error, setError] = useState('');
  const load = async () => setUsers(await (await fetch('/api/users')).json());
  useEffect(() => { void load(); }, []);

  async function call(method: string, body: unknown) {
    setError('');
    const res = await fetch('/api/users', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.issues?.[0]?.message ?? j.error ?? 'Помилка'); return false; }
    await load();
    return true;
  }

  return (
    <>
      <h1>Користувачі</h1>
      <form className="card row" onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget; const f = new FormData(form);
        if (await call('POST', { login: f.get('login'), password: f.get('password'), role: f.get('role') })) form.reset();
      }}>
        <div><label>Логін</label><input name="login" required /></div>
        <div><label>Пароль (мін. 8)</label><input name="password" type="password" required /></div>
        <div><label>Роль</label><select name="role" defaultValue="manager"><option value="manager">менеджер</option><option value="admin">адміністратор</option></select></div>
        <button className="primary">Додати</button>
      </form>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>Логін</th><th>Роль</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.login}</td>
                <td>{u.role === 'admin' ? 'адміністратор' : 'менеджер'}</td>
                <td>{u.active ? 'активний' : <span className="pill annulled">вимкнений</span>}</td>
                <td className="num">
                  {u.id !== meId && <button onClick={() => call('PATCH', { id: u.id, active: !u.active })}>{u.active ? 'Вимкнути' : 'Увімкнути'}</button>}{' '}
                  <button onClick={() => { const p = prompt(`Новий пароль для ${u.login} (мін. 8 символів)`); if (p) void call('PATCH', { id: u.id, password: p }); }}>Пароль</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
