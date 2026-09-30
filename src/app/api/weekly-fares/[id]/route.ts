import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weeklyFareUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await prisma.weeklyFare.findUnique({ where: { id }, include: { route: true } });
  if (!data) throw ApiError.notFound('Tarifa semanal no encontrada');
  return ok({ ...data, price: Number(data.price), date: data.date.toISOString().slice(0, 10) });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, weeklyFareUpdateSchema);

  const data = await prisma.weeklyFare
    .update({ where: { id }, data: body })
    .catch(() => {
      throw ApiError.notFound('Tarifa semanal no encontrada');
    });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'WeeklyFare', entityId: id });
  return ok({ ...data, price: Number(data.price), date: data.date.toISOString().slice(0, 10) });
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;

  try {
    await prisma.weeklyFare.delete({ where: { id } });
  } catch {
    throw ApiError.notFound('Tarifa semanal no encontrada');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'WeeklyFare', entityId: id });
  return noContent();
});
