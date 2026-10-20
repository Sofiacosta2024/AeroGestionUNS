import { UserRole } from '@prisma/client';
import { ApiError, handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { bookingInclude, serializeBooking } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.MOSTRADOR);
  const { bookingCode } = await ctx.params;
  const code = bookingCode.trim().toUpperCase();

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code },
    include: bookingInclude,
  });

  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  return ok(serializeBooking(booking));
});
