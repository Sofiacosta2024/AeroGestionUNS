import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fareUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const fare = await prisma.fare.findUnique({
    where: { id },
    include: { flightFares: { include: { flight: true } } },
  });
  if (!fare) throw ApiError.notFound('Tarifa no encontrada');
  return ok(fare);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const body = await parseBody(req, fareUpdateSchema);

  const fare = await prisma.fare.update({ where: { id }, data: body }).catch(() => {
    throw ApiError.notFound('Tarifa no encontrada');
  });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'Fare', entityId: id });
  return ok(fare);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  try {
    await prisma.fare.delete({ where: { id } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict('No se puede eliminar: la tarifa esta asociada a vuelos o reservas');
    }
    throw ApiError.notFound('Tarifa no encontrada');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Fare', entityId: id });
  return noContent();
});
