import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadScheduleFormData } from '@/lib/scheduling/form-data';
import { getFlightItinerary } from '@/lib/scheduling/reschedule';
import { requireAdminPage } from '../../../require-admin';
import RescheduleForm from './reschedule-form';

export const metadata: Metadata = { title: 'Reprogramar vuelo · AeroGestión UNS' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/** Reprogramacion de un vuelo publicado (US-11B, WF-11B). Se entra desde la planilla del dia. */
export default async function ReprogramarVueloPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;

  const [flight, data] = await Promise.all([getFlightItinerary(id), loadScheduleFormData()]);
  if (!flight) notFound();

  return (
    <RescheduleForm aircraft={data.aircraft} flight={flight} routes={data.routes} rules={data.rules} today={data.today} />
  );
}
