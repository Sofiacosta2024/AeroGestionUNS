import type { Metadata } from 'next';
import AdminHeader from './admin-header';
import { requireAdminPage } from './require-admin';

export const metadata: Metadata = { title: 'Administración · AeroGestión UNS' };
export const dynamic = 'force-dynamic';

/**
 * Layout del panel de administracion (RF-01).
 *
 * Usa el tema de /vuelos (`theme-vuelos`): el diseno de Stitch de la consola de alta
 * comparte esos tokens. Es simple a proposito para que RF-07 lo pueda reemplazar.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <div className="theme-vuelos bg-surface font-body-md text-on-surface antialiased min-h-screen">
      <AdminHeader userName={userName} />
      <main className="w-full pt-32 lg:pt-20 pb-space-xl">{children}</main>
    </div>
  );
}
