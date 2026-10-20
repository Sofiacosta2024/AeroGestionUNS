import { getCurrentUser, toSiteHeaderUser } from '@/lib/auth';
import SiteHeader from '@/components/SiteHeader';
import ConsultaClient from './consulta-client';

export const dynamic = 'force-dynamic';

/**
 * Pagina publica de consulta de reservas (US-14A).
 *
 * El header se resuelve en el servidor con `getCurrentUser()`: sin sesion
 * devuelve null y la barra muestra el chip de invitado con link a /login
 * (el middleware ya trata /reserva como ruta publica). El formulario en si
 * sigue siendo un Client Component que no depende de sesion.
 */
export default async function ReservaPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader activePath="reserva" user={toSiteHeaderUser(user)} />
      {/* El header es fixed (min-h-20 + fila movil): el contenido arranca debajo. */}
      <div className="pt-32 lg:pt-20">
        <ConsultaClient />
      </div>
    </>
  );
}
