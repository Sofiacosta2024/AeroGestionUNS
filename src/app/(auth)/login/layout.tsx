import LoginPortal from '@/components/LoginPortal';

/** Conserva la selección de rol mientras Clerk navega entre los pasos del login. */
export default function LoginPortalLayout({ children }: { children: React.ReactNode }) {
  return <LoginPortal>{children}</LoginPortal>;
}
