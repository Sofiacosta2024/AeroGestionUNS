import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { roleHome } from '@/lib/role-navigation';

/** Raiz: los visitantes van al portal de autenticacion. */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(roleHome(user.role));
}
