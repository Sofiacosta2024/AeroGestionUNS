import { requireAdminPage } from '../require-admin';
import AdminReservasClient from './admin-reservas-client';

export const dynamic = 'force-dynamic';

/** Consola interna de busqueda y gestion de reservas (US-14C / RF-14). */
export default async function AdminReservasPage() {
  await requireAdminPage({ allowMostrador: true });

  return <AdminReservasClient />;
}
