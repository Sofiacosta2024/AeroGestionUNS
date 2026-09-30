import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { aircraftUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const aircraft = await prisma.aircraft.findUnique({
    where: { id },
    include: {
      baseAirport: true,
      seats: { orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }] },
      flights: {
        include: { route: { include: { originAirport: true, destinationAirport: true } } },
        orderBy: { departureAt: 'asc' },
        take: 20,
      },
    },
  });

  if (!aircraft) throw ApiError.notFound('Aeronave no encontrada');
  return ok(aircraft);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const body = await parseBody(req, aircraftUpdateSchema);

  const data = body.imageUrl !== undefined ? { ...body, imageUrl: body.imageUrl || null } : body;

  const aircraft = await prisma.aircraft
    .update({ where: { id }, data })
    .catch(() => {
      throw ApiError.notFound('Aeronave no encontrada');
    });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'Aircraft', entityId: id });
  return ok(aircraft);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  try {
    await prisma.aircraft.delete({ where: { id } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict('No se puede eliminar: la aeronave tiene vuelos o asientos asignados');
    }
    throw ApiError.notFound('Aeronave no encontrada');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Aircraft', entityId: id });
  return noContent();
});
