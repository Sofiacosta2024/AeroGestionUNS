import { getCurrentUser, toSiteHeaderUser } from '@/lib/auth';
import SiteHeader from '@/components/SiteHeader';
import AdminReservasClient from './admin-reservas-client';

export const dynamic = 'force-dynamic';

export default async function AdminReservasPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader activePath="vuelos" user={toSiteHeaderUser(user)} />
      <div className="pt-32 lg:pt-20">
        <AdminReservasClient user={toSiteHeaderUser(user)} />
      </div>
    </>
  );
}
