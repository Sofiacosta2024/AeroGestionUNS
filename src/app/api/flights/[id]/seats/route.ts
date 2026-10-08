import { z } from 'zod';
import { handler, ok, parseQuery } from '@/lib/api';
import { getFlightSeatsStatus } from '@/lib/seat-locks';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const querySchema = z.object({
  fareId: z.string().optional(),
  bookingCode: z.string().optional(),
});

/**
 * GET /api/flights/:id/seats?fareId=...&bookingCode=...
 * Retorna el mapa interactivo de asientos para el vuelo, con estados en vivo:
 * FREE (disponible), LOCKED (bloqueado por otro usuario en ventana de 5 min),
 * OCCUPIED (pagado/confirmado) o SELECTED (bloqueado por la reserva actual).
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { fareId, bookingCode } = parseQuery(req, querySchema);

  const data = await getFlightSeatsStatus(id, fareId, bookingCode);

  return ok(data);
});
