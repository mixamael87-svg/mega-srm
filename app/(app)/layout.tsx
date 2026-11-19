import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getPageUser } from '@/auth/session';
import { LogoutButton } from './LogoutButton';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getPageUser();
  if (!user) redirect('/login');
  return (
    <>
      <header className="top">
        <b>MEGA SRM</b>
        <nav>
          <a href="/documents/new">Новий документ</a>
          <a href="/documents">Історія</a>
          <a href="/clients">Клієнти</a>
          <a href="/reports">Звіти клієнтів</a>
          <a href="/labels">Наклейки</a>
          <a href="/settings/fops">Наші ФОП</a>
          {user.role === 'admin' && <a href="/settings/users">Користувачі</a>}
        </nav>
        <span className="muted">{user.login}</span>
        <LogoutButton />
      </header>
      <main className="page">{children}</main>
    </>
  );
}
