import { getPageUser } from '@/auth/session';
import { History } from './History';

export default async function Page() {
  const user = await getPageUser();
  return <History isAdmin={user?.role === 'admin'} />;
}
