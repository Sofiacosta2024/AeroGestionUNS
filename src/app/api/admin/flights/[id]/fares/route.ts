import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { updateFlightFares } from '@/lib/scheduling/flight-fares';
import { flightFaresUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/flights/:id/fares
 *
 * Edita precio y capacidad por clase de un vuelo publicado (US-11A; la US lo nombra
 * `PATCH /api/v1/admin/vuelos/{id}/tarifas`). Lo vendido conserva su precio. Si la
 * capacidad queda por debajo de lo vendido o se pasa de la cabina del avion responde 422;
 * si el vuelo ya no es editable, 409. Deja el antes y el despues en la auditoria.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const input = await parseBody(req, flightFaresUpdateSchema);

  const result = await updateFlightFares(id, input);

  await audit({
    userId: user.id,
    action: 'UPDATE_FARES',
    entity: 'Flight',
    entityId: id,
    metadata: { code: result.flight.code, changes: result.changes },
  });

  return ok(result);
});
