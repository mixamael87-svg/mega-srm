import { redirect } from 'next/navigation';
import { getPageUser } from '@/auth/session';
import { FopsClient } from './FopsClient';

export default async function Page() {
  const user = await getPageUser();
  if (user?.role !== 'admin') redirect('/documents/new');
  return <FopsClient />;
}
