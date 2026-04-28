import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function AdminLogsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (!session || session.role !== 'superadmin') {
    redirect('/');
  }

  return <>{children}</>;
}
