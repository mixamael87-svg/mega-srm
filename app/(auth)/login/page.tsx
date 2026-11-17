'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: f.get('login'), password: f.get('password') }) });
    setBusy(false);
    if (res.ok) location.href = '/documents/new';
    else setError((await res.json().catch(() => ({}))).error ?? 'Помилка входу');
  }
  return (
    <form className="card login" onSubmit={onSubmit}>
      <h1>MEGA SRM</h1>
      <label htmlFor="login">Логін</label>
      <input id="login" name="login" autoComplete="username" required autoFocus />
      <label htmlFor="password">Пароль</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button className="primary" disabled={busy} style={{ width: '100%' }}>Увійти</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
