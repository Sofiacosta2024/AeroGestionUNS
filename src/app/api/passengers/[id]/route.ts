import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { passengerUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.PASAJERO);
  const { id } = await ctx.params;

  const passenger = await prisma.passenger.findUnique({
    where: { id },
    include: { bookingPassengers: { include: { booking: true } } },
  });

  if (!passenger) throw ApiError.notFound('Pasajero no encontrado');
  if (passenger.userId !== user.id && user.role === UserRole.PASAJERO) {
    throw ApiError.forbidden('No tiene permisos para ver este pasajero');
  }

  return ok(passenger);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.PASAJERO);
  const { id } = await ctx.params;
  const body = await parseBody(req, passengerUpdateSchema);

  const current = await prisma.passenger.findUnique({ where: { id }, select: { userId: true } });
  if (!current) throw ApiError.notFound('Pasajero no encontrado');
  if (current.userId !== user.id && user.role === UserRole.PASAJERO) {
    throw ApiError.forbidden('No tiene permisos para modificar este pasajero');
  }

  const passenger = await prisma.passenger
    .update({
      where: { id },
      data: { ...body, ...(body.email === '' ? { email: null } : {}) },
    })
    .catch(() => {
      throw ApiError.conflict('Ya existe un pasajero con ese documento');
    });

  await audit({ userId: user.id, action: 'UPDATE', entity: 'Passenger', entityId: id });
  return ok(passenger);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  try {
    await prisma.passenger.delete({ where: { id } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict('No se puede eliminar: el pasajero tiene reservas asociadas');
    }
    throw ApiError.notFound('Pasajero no encontrado');
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Passenger', entityId: id });
  return noContent();
});
