import { handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { lockSeatsAtomic } from '@/lib/seat-locks';
import { lockSeatsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/flights/:id/lock-seats
 * Bloqueo Transaccional Atómico de Asientos (RF-03).
 * Bloquea entre 1 y 9 asientos para el vuelo especificado por 5 minutos.
 * Aplica exclusión mutua; si algún asiento fue tomado por otro usuario responde 409 Conflict:
 * "Asiento no disponible".
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const body = await parseBody(req, lockSeatsSchema);

  const result = await lockSeatsAtomic({
    flightId: id,
    fareId: body.fareId,
    seatIds: body.seatIds,
    contactEmail: user?.email ?? body.contactEmail,
    contactPhone: body.contactPhone ?? null,
    userId: user?.id ?? null,
    passengers: body.passengers,
  });

  await audit({
    userId: user?.id ?? null,
    action: 'LOCK_SEATS',
    entity: 'Booking',
    entityId: result.bookingId,
    metadata: {
      bookingCode: result.bookingCode,
      flightId: id,
      seatsCount: result.seatsCount,
      expiresAt: result.expiresAt,
    },
  });

  return ok(result);
});
