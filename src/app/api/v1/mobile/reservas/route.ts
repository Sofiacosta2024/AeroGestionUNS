import { created, handler } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { mobileErrorResponse, parseMobileBody } from '@/lib/mobile/http';
import { withSerializationRetry } from '@/lib/mobile/retry';
import { lockSeatsAtomic } from '@/lib/seat-locks';
import { mobileReservationSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mobile/reservas
 *
 * Bloquea de 1 a 9 asientos para el usuario autenticado con Bearer token de
 * Clerk y crea la reserva PENDING por 5 minutos. Reutiliza exactamente la
 * logica transaccional de RF-03; el email de contacto sale de la sesion.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseMobileBody(req, mobileReservationSchema);

  let result;
  try {
    result = await withSerializationRetry(() =>
      lockSeatsAtomic(
        {
          flightId: body.flightId,
          fareId: body.fareId,
          quotedTotal: body.quotedTotal,
          seatMode: body.seatMode,
          seatIds: body.seatIds,
          contactEmail: user.email,
          contactPhone: body.contactPhone ?? null,
          userId: user.id,
          passengers: body.passengers,
        },
        undefined,
        { rethrowSerialization: true },
      ),
    );
  } catch (err) {
    const response = mobileErrorResponse(err);
    if (response) return response;
    throw err;
  }

  await audit({
    userId: user.id,
    action: 'LOCK_SEATS',
    entity: 'Booking',
    entityId: result.bookingId,
    metadata: {
      source: 'mobile',
      bookingCode: result.bookingCode,
      flightId: body.flightId,
      seatsCount: result.seatsCount,
      expiresAt: result.expiresAt,
    },
  });

  return created(result);
});
