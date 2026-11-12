import { redirect } from 'next/navigation';
import { getCurrentUser, toSiteHeaderUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findMyBookings } from '@/lib/my-bookings';
import { partitionMyBookings } from '@/lib/my-bookings-view';
import SiteHeader from '@/components/SiteHeader';
import MisReservasClient from './mis-reservas-client';

export const dynamic = 'force-dynamic';

/**
 * Panel "Mis Reservas" del pasajero registrado (US-15 v2.0).
 *
 * La pantalla es privada (no figura en `isPublic`): el middleware ya redirige a
 * login, y aca se vuelve a verificar la sesion antes de consultar. El listado se
 * arma en el servidor con `findMyBookings` (una sola consulta, sin N+1) para
 * cumplir el SLA de render < 3 s.
 */
export default async function MisReservasPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const bookings = await findMyBookings(prisma, { userId: user.id, email: user.email });
  const { upcoming, past } = partitionMyBookings(bookings);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <>
      <SiteHeader activePath="mis-reservas" user={toSiteHeaderUser(user)} />
      {/* El header es fixed (min-h-20 + fila movil): el contenido arranca debajo. */}
      <div className="pt-32 lg:pt-20">
        <MisReservasClient
          past={past}
          upcoming={upcoming}
          userEmail={user.email}
          userName={fullName}
        />
      </div>
    </>
  );
}
