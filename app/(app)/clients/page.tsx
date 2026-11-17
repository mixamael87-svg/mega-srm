import { getPageUser } from '@/auth/session';
import { ClientsClient } from './ClientsClient';

export default async function Page() {
  const user = await getPageUser();
  return <ClientsClient isAdmin={user?.role === 'admin'} />;
}
