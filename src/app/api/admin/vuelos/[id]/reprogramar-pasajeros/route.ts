import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { reprogramarPasajeros } from '@/lib/contingencias';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const reprogramarSchema = z.object({
  newFlightId: z.string().min(1, 'Debe especificar el nuevo vuelo de reemplazo'),
  bookingIds: z.array(z.string()).optional(),
});

/**
 * POST /api/admin/vuelos/:id/reprogramar-pasajeros
 * US-12B: Reasignación masiva y atómica de pasajeros afectados a un nuevo vuelo.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const body = await parseBody(req, reprogramarSchema);

  const result = await reprogramarPasajeros({
    flightId: id,
    newFlightId: body.newFlightId,
    bookingIds: body.bookingIds,
    userId: user.id,
  });

  return ok(result);
});
