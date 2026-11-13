import type { Prisma } from '@prisma/client';
import { bookingCancellationSnapshotSchema } from '@/lib/email/cancellation-snapshot';
import { bookingLookupUrl } from './itinerary-notices';
import { findNoticeBooking } from './repository';

export async function notifyBookingCancelled(
  tx: Prisma.TransactionClient,
  bookingId: string,
  origin: string,
  refundPending = false,
) {
  const booking = await findNoticeBooking(tx, bookingId);
  if (!booking) return;
  const snapshot = bookingCancellationSnapshotSchema.safeParse({
    version: 1,
    recipient: booking.contactEmail.trim().toLowerCase(),
    greetingName: booking.passengers[0]?.firstName ?? 'Pasajero',
    displayCode: booking.bookingCode.replace(/^AG-/, ''),
    bookingUrl: bookingLookupUrl(origin),
    refundPending,
  });
  if (!snapshot.success) return;
  await tx.emailDispatch.createMany({
    data: [{
      kind: 'BOOKING_CANCELLED',
      dedupeKey: `booking-cancelled-${bookingId}`,
      bookingId,
      recipient: snapshot.data.recipient,
      snapshot: snapshot.data,
    }],
    skipDuplicates: true,
  });
}
