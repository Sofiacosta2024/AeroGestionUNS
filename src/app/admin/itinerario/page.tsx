import type { Metadata } from 'next';
import { ScheduleStatus } from '@prisma/client';
import { toDateInput } from '@/lib/format';
import { getItinerary } from '@/lib/scheduling/itinerary';
import { serializeSchedule } from '@/lib/scheduling/serializers';
import { listSchedules } from '@/lib/scheduling/service';
import { itineraryQuery } from '@/lib/validation';
import { requireAdminPage } from '../require-admin';
import ItineraryView from './itinerary-view';

export const metadata: Metadata = { title: 'Planilla del día · AeroGestión UNS' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ date?: string | string[] }> };

/** Itinerario = planilla del dia (RF-01): vuelos que salen ese dia y borradores pendientes. */
export default async function ItinerarioPage({ searchParams }: Props) {
  await requireAdminPage();
  const { date: raw } = await searchParams;
  const parsed = itineraryQuery.safeParse({ date: raw });
  const date = parsed.success ? parsed.data.date : toDateInput(new Date());

  const [itinerary, drafts] = await Promise.all([
    getItinerary(date),
    listSchedules({ status: ScheduleStatus.DRAFT, page: 1, pageSize: 50 }),
  ]);

  return (
    <ItineraryView date={date} drafts={drafts.data.map(serializeSchedule)} flights={itinerary.flights} today={toDateInput(new Date())} />
  );
}
