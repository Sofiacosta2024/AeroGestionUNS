import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { checkReschedule } from '@/lib/scheduling/reschedule';
import { flightRescheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/flights/:id/itinerary/check
 *
 * Chequeo en vivo de la pantalla de reprogramacion (US-11B): llegada calculada, choques,
 * pasajeros afectados y capacidad por clase con el avion elegido. No guarda nada.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const input = await parseBody(req, flightRescheduleSchema);
  return ok(await checkReschedule(id, input));
});
