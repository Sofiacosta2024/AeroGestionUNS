import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

/**
 * Guard de las pantallas de administracion (RF-01).
 *
 * Provisorio hasta que RF-07 defina el suyo: sin sesion se va al login y con otro rol a
 * su pantalla de inicio. Lo llaman el layout y cada pagina, porque Next no vuelve a
 * renderizar el layout al navegar entre paginas hijas. La API exige ADMIN por su cuenta.
 *
 * `allowMostrador` (US-14C): la consola de reservas esta abierta a MOSTRADOR y ADMIN.
 * El layout lo usa porque envuelve tambien /admin/reservas; cada pagina refuerza su
 * propio nivel (itinerario y alta de vuelos siguen exigiendo ADMIN).
 */
type RequireAdminOptions = { allowMostrador?: boolean };

export async function requireAdminPage(options: RequireAdminOptions = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const allowed =
    user.role === UserRole.ADMIN ||
    (options.allowMostrador === true && user.role === UserRole.MOSTRADOR);
  if (!allowed) redirect('/vuelos');
  return user;
}
