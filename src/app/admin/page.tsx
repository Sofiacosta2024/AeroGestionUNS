import { redirect } from 'next/navigation';
import { requireAdminPage } from './require-admin';

/** Entrada del panel de administración: abre la planilla del día. */
export default async function AdminPage() {
  await requireAdminPage();
  redirect('/admin/itinerario');
}
