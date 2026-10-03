import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

/**
 * Guard de las pantallas de administracion (RF-01).
 *
 * Provisorio hasta que RF-07 defina el suyo: sin sesion se va al login y con otro rol a
 * su pantalla de inicio. Lo llaman el layout y cada pagina, porque Next no vuelve a
 * renderizar el layout al navegar entre paginas hijas. La API exige ADMIN por su cuenta.
 */
export async function requireAdminPage(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== UserRole.ADMIN) redirect('/vuelos');
  return user;
}
