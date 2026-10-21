import { redirect } from 'next/navigation';
import LoginPortal from '@/components/LoginPortal';
import { getCurrentUser } from '@/lib/auth';
import { roleHome } from '@/lib/role-navigation';

/** Conserva la selección de rol mientras Clerk navega entre los pasos del login. */
export default async function LoginPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));

  return <LoginPortal>{children}</LoginPortal>;
}
