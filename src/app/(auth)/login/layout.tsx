import { redirect } from 'next/navigation';
import LoginPortal from '@/components/LoginPortal';
import { getCurrentUser } from '@/lib/auth';

/** Conserva la selección de rol mientras Clerk navega entre los pasos del login. */
export default async function LoginPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'ADMIN' ? '/admin' : '/');

  return <LoginPortal>{children}</LoginPortal>;
}
