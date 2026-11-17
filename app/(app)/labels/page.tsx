import { getPageUser } from '@/auth/session';
import { LabelsClient } from './LabelsClient';

export default async function Page() {
  const user = await getPageUser();
  return <LabelsClient isAdmin={user?.role === 'admin'} />;
}
