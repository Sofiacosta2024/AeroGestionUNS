import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { flightInclude, serializeFlight } from '@/lib/flights';
import { prisma } from '@/lib/prisma';
import { flightUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const flight = await prisma.flight.findUnique({
    where: { id },
    include: {
      ...flightInclude,
      _count: { select: { bookingFlights: true } },
    },
  });

  if (!flight) throw ApiError.notFound('Vuelo no encontrado');
  return ok(serializeFlight(flight));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, flightUpdateSchema);

  const flight = await prisma.flight
    .update({ where: { id }, data: body, include: flightInclude })
    .catch(() => {
      throw ApiError.notFound('Vuelo no encontrado');
    });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'Flight', entityId: id });
  return ok(serializeFlight(flight));
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  try {
    await prisma.flight.delete({ where: { id } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict('No se puede eliminar: el vuelo tiene reservas o rutas asociadas');
    }
    throw ApiError.notFound('Vuelo no encontrado');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Flight', entityId: id });
  return noContent();
});
