import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { rescheduleFlight } from '@/lib/scheduling/reschedule';
import { flightRescheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/flights/:id/itinerary
 *
 * Reprograma un vuelo publicado (US-11B): fecha, hora de salida, ruta y avion. La llegada
 * se calcula. Si choca con otro vuelo responde 409; si la ruta o el avion no se pueden
 * cambiar, 422. Deja el antes y el despues en la auditoria.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const input = await parseBody(req, flightRescheduleSchema);

  const result = await rescheduleFlight(id, input);

  await audit({
    userId: user.id,
    action: 'RESCHEDULE',
    entity: 'Flight',
    entityId: id,
    metadata: {
      before: result.before,
      after: result.after,
      affectedPassengers: result.affectedPassengers,
      resizedClasses: result.resizedClasses,
    },
  });

  return ok(result);
});
