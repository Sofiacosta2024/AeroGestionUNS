import { UserRole } from '@prisma/client';
import { ApiError, handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.MOSTRADOR);
  const { bookingCode } = await ctx.params;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: bookingCode.trim().toUpperCase() },
    select: { id: true },
  });

  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const history = await prisma.auditLog.findMany({
    where: { entity: 'Booking', entityId: booking.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return ok(
    history.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt.toISOString(),
      metadata: entry.metadata as Record<string, unknown> | null,
    })),
  );
});
