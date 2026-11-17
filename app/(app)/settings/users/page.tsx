import { redirect } from 'next/navigation';
import { getPageUser } from '@/auth/session';
import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const user = await getPageUser();
  if (user?.role !== 'admin') redirect('/documents/new');
  return <UsersClient meId={user.id} />;
}
