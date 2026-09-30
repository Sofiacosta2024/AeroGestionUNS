import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { routeUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const route = await prisma.route.findUnique({
    where: { id },
    include: {
      originAirport: true,
      destinationAirport: true,
      weeklyFares: { orderBy: { date: 'asc' } },
      _count: { select: { flights: true } },
    },
  });

  if (!route) throw ApiError.notFound('Ruta no encontrada');
  return ok(route);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const body = await parseBody(req, routeUpdateSchema);

  const route = await prisma.route
    .update({ where: { id }, data: body })
    .catch(() => {
      throw ApiError.notFound('Ruta no encontrada');
    });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'Route', entityId: id });
  return ok(route);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  try {
    await prisma.route.delete({ where: { id } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict('No se puede eliminar: la ruta tiene vuelos asociados');
    }
    throw ApiError.notFound('Ruta no encontrada');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Route', entityId: id });
  return noContent();
});
