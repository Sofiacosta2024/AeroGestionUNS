import { UserRole } from '@prisma/client';
import { ApiError, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { flightInclude, serializeFlight } from '@/lib/flights';
import { prisma } from '@/lib/prisma';
import { flightStatusUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/flights/:id/status
 * Operacion de mostrador: embarque, despegue, aterrizaje, cancelacion, demora.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, flightStatusUpdateSchema);

  const flight = await prisma.flight
    .update({ where: { id }, data: { status: body.status }, include: flightInclude })
    .catch(() => {
      throw ApiError.notFound('Vuelo no encontrado');
    });

  await audit({
    userId: user.id,
    action: 'STATUS_CHANGE',
    entity: 'Flight',
    entityId: id,
    metadata: { from: 'previous', to: body.status, code: flight.code },
  });

  return ok(serializeFlight(flight));
});
