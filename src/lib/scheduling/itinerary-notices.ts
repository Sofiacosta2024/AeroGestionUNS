import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { enqueueItineraryChanges, type ItineraryNotice } from '@/lib/email/itinerary-outbox';
import { itinerarySnapshotSchema, type ItineraryLeg } from '@/lib/email/itinerary-snapshot';
import * as repo from './repository';
import type { NoticeBooking } from './repository';

/**
 * Avisos por email de un cambio de itinerario (US-06A).
 * Se encolan dentro de la transacción del cambio y el worker de la US-13 los envía.
 */

type Db = Prisma.TransactionClient;

export type NoticeResult = {
  /** Avisos encolados. */
  queued: number;
  /** Reservas sin aviso porque sus datos no alcanzan para el correo (ver `itineraryNotice`). */
  skipped: number;
};

/** Link de «Ver Mi Reserva»: la consulta publica de la US-14A. */
export function bookingLookupUrl(origin: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, '')}/reserva`;
}

/**
 * Aviso para una reserva, o null si sus datos no alcanzan para el correo (un email invalido o
 * un codigo que no es de 6 caracteres, como las reservas de demo AG-DEMOx). Ese caso no debe
 * frenar el cambio de itinerario.
 */
export function itineraryNotice(
  booking: NoticeBooking,
  before: ItineraryLeg,
  after: ItineraryLeg,
  url: string,
  eventId: string,
): ItineraryNotice | null {
  const snapshot = itinerarySnapshotSchema.safeParse({
    version: 1,
    recipient: booking.contactEmail,
    greetingName: booking.passengers[0]?.firstName ?? 'Pasajero',
    displayCode: booking.bookingCode.replace(/^AG-/, ''),
    bookingUrl: url,
    before,
    after,
  });
  if (!snapshot.success) return null;
  return { bookingId: booking.id, dedupeKey: `itinerary-${eventId}-${booking.id}`, snapshot: snapshot.data };
}

async function enqueue(
  db: Db,
  bookings: readonly NoticeBooking[],
  before: ItineraryLeg,
  after: ItineraryLeg,
  origin: string,
): Promise<NoticeResult> {
  // Un id por cambio: reprogramar dos veces el mismo vuelo manda dos avisos distintos.
  const eventId = randomUUID();
  const url = bookingLookupUrl(origin);
  const notices = bookings.map((b) => itineraryNotice(b, before, after, url, eventId));
  const valid = notices.filter((n): n is ItineraryNotice => n !== null);
  return { queued: await enqueueItineraryChanges(db, valid), skipped: notices.length - valid.length };
}

/** US-11B: avisa a cada reserva con pasaje del vuelo. Llamar despues de guardar el nuevo itinerario. */
export async function notifyFlightRescheduled(
  db: Db,
  flightId: string,
  before: ItineraryLeg,
  origin: string,
): Promise<NoticeResult> {
  const [after, bookings] = await Promise.all([repo.loadFlightLeg(db, flightId), repo.findTicketedBookings(db, flightId)]);
  if (!after) return { queued: 0, skipped: 0 };
  return enqueue(db, bookings, before, after, origin);
}

/**
 * Avisa al contacto de la reserva cuando se confirma su cambio de vuelo.
 */
export async function notifyBookingRescheduled(
  db: Db,
  input: { bookingId: string; fromFlightId: string; toFlightId: string; origin: string },
): Promise<NoticeResult> {
  const [booking, before, after] = await Promise.all([
    repo.findNoticeBooking(db, input.bookingId),
    repo.loadFlightLeg(db, input.fromFlightId),
    repo.loadFlightLeg(db, input.toFlightId),
  ]);
  if (!booking || !before || !after) return { queued: 0, skipped: 0 };
  return enqueue(db, [booking], before, after, input.origin);
}
