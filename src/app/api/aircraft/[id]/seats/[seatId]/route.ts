import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; seatId: string }> };

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id, seatId } = await ctx.params;

  const seat = await prisma.seat.findFirst({ where: { id: seatId, aircraftId: id } });
  if (!seat) throw ApiError.notFound('Asiento no encontrado');

  const assigned = await prisma.bookingPassenger.count({ where: { seatId } });
  if (assigned > 0) throw ApiError.conflict('No se puede eliminar: el asiento esta asignado a un pasajero');

  await prisma.seat.delete({ where: { id: seatId } });
  await audit({ userId: user.id, action: 'DELETE', entity: 'Seat', entityId: seatId });

  return noContent();
});
