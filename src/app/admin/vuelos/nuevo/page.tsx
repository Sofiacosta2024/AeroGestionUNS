import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ScheduleStatus } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { loadScheduleFormData } from '@/lib/scheduling/form-data';
import { serializeSchedule, type SerializedSchedule } from '@/lib/scheduling/serializers';
import { getSchedule } from '@/lib/scheduling/service';
import { requireAdminPage } from '../../require-admin';
import FlightScheduleForm from './flight-schedule-form';

export const metadata: Metadata = { title: 'Alta de vuelos · AeroGestión UNS' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ borrador?: string | string[] }> };

/** Alta y publicacion de vuelos (RF-01). Con `?borrador=<id>` abre un borrador guardado. */
export default async function NuevoVueloPage({ searchParams }: Props) {
  await requireAdminPage();
  const { borrador } = await searchParams;
  const draftId = typeof borrador === 'string' ? borrador : null;

  const [data, draft] = await Promise.all([loadScheduleFormData(), draftId ? loadDraft(draftId) : null]);
  return <FlightScheduleForm data={data} draft={draft} />;
}

/** El borrador a editar; si ya se publico, se muestra en la planilla de su primer dia. */
async function loadDraft(id: string): Promise<SerializedSchedule> {
  try {
    const schedule = serializeSchedule(await getSchedule(id));
    if (schedule.status !== ScheduleStatus.DRAFT) redirect(`/admin/itinerario?date=${schedule.validFrom}`);
    return schedule;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
