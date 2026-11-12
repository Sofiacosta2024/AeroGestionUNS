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
export default async function ReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  // US-15 v2.0: el panel "Mis Reservas" llega con `?code=AG-XXXXXX` para
  // precargar el codigo en la consulta (el apellido sigue siendo obligatorio).
  const initialCode = typeof params.code === 'string' ? params.code : '';

  return (
    <>
      <SiteHeader activePath="reserva" user={toSiteHeaderUser(user)} />
      {/* El header es fixed (min-h-20 + fila movil): el contenido arranca debajo. */}
      <div className="pt-32 lg:pt-20">
        <ConsultaClient initialCode={initialCode} />
      </div>
    </>
  );
}
