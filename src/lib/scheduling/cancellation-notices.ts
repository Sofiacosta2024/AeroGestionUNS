import type { Flight, Prisma } from '@prisma/client';
import { cancellationSnapshotSchema, type CancellationSnapshot } from '@/lib/email/cancellation-snapshot';
import { bookingLookupUrl, type NoticeResult } from './itinerary-notices';

const flightSelect = { code: true, departureAt: true, arrivalAt: true } satisfies Prisma.FlightSelect;

function flightSnapshot(flight: Pick<Flight, keyof typeof flightSelect>): CancellationSnapshot['cancelled'] {
  return {
    flightCode: flight.code,
    departureAt: flight.departureAt.toISOString(),
    arrivalAt: flight.arrivalAt.toISOString(),
  };
}

export async function enqueueCancellationNotices(
  tx: Prisma.TransactionClient,
  flight: Flight,
  reason: CancellationSnapshot['reason'],
  bookingIds: string[],
  origin: string,
): Promise<NoticeResult> {
  if (bookingIds.length === 0) return { queued: 0, skipped: 0 };

  const bookings = await tx.booking.findMany({
    where: { id: { in: bookingIds } },
    select: {
      id: true,
      bookingCode: true,
      contactEmail: true,
      status: true,
      passengers: { select: { firstName: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1 },
      vueloPropuesto: { select: flightSelect },
    },
  });

  const cancelled = flightSnapshot(flight);
  const bookingUrl = bookingLookupUrl(origin);
  const data: Prisma.EmailDispatchCreateManyInput[] = [];
  for (const booking of bookings) {
    const result = cancellationSnapshotSchema.safeParse({
      version: 1,
      recipient: booking.contactEmail.trim().toLowerCase(),
      greetingName: booking.passengers[0]?.firstName ?? 'Pasajero',
      displayCode: booking.bookingCode.replace(/^AG-/, ''),
      bookingUrl,
      reason,
      status: booking.status,
      cancelled,
      proposed: booking.vueloPropuesto ? flightSnapshot(booking.vueloPropuesto) : null,
    });
    if (!result.success) continue;

    data.push({
      kind: 'FLIGHT_CANCELLED',
      dedupeKey: `cancel-${flight.id}-${booking.id}`,
      bookingId: booking.id,
      recipient: result.data.recipient,
      snapshot: result.data,
    });
  }

  const queued = data.length
    ? (await tx.emailDispatch.createMany({ data, skipDuplicates: true })).count
    : 0;
  return { queued, skipped: bookings.length - data.length };
}
