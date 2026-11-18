import { getPageUser } from '@/auth/session';
import { FopsClient } from './FopsClient';

/** Managers create and edit our FOPs too; deleting / archiving stays with admin. */
export default async function Page() {
  const user = await getPageUser();
  return <FopsClient isAdmin={user?.role === 'admin'} />;
}
