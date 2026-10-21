import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlightFares } from '@/lib/scheduling/flight-fares';
import { requireAdminPage } from '../../../require-admin';
import FaresForm from './fares-form';

export const metadata: Metadata = { title: 'Editar tarifas · AeroGestión UNS' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/** Edicion de precio y capacidad por clase de un vuelo publicado (US-11A, WF-11A). Se entra desde la planilla del dia. */
export default async function EditarTarifasPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;

  const flight = await getFlightFares(id);
  if (!flight) notFound();

  return <FaresForm flight={flight} />;
}
