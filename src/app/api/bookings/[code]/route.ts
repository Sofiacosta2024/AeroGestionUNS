import { BookingStatus, UserRole } from '@prisma/client';
import { ApiError, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManage, getCurrentUser, requireRole } from '@/lib/auth';
import {
  bookingInclude,
  canViewBookingPii,
  redactBooking,
  serializeBooking,
} from '@/lib/bookings';
import { prisma } from '@/lib/prisma';
import { bookingUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** GET /api/bookings/:code */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: bookingInclude,
  });

  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const user = await getCurrentUser();
  const owner = booking.userId && user?.id === booking.userId;
  // Sin sesion solo se expone la reserva si fue confirmada (consulta publica).
  const publicView = !user && booking.status === BookingStatus.CONFIRMED;

  if (!owner && !publicView && !canManage(user)) {
    throw ApiError.forbidden('No tiene permisos para ver esta reserva');
  }

  // Conocer el codigo no habilita ver los datos nominales: la vista publica
  // (y la de un tercero sin relacion con la reserva) va redactada.
  const serialized = serializeBooking(booking);
  return ok(canViewBookingPii(user, booking) ? serialized : redactBooking(serialized));
});

/** PATCH /api/bookings/:code */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, bookingUpdateSchema);

  const existing = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound('Reserva no encontrada');

  const booking = await prisma.booking.update({
    where: { id: existing.id },
    data: body,
    include: bookingInclude,
  });

  await audit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'Booking',
    entityId: booking.id,
    metadata: { bookingCode: booking.bookingCode, from: existing.status, to: booking.status },
  });

  return ok(serializeBooking(booking));
});

/**
 * DELETE /api/bookings/:code -> cancelacion.
 * Se cancela en vez de borrar para conservar el historial y los pases emitidos,
 * y se devuelve la disponibilidad a las tarifas.
 */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.MOSTRADOR);

  const existing = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: { flights: true },
  });
  if (!existing) throw ApiError.notFound('Reserva no encontrada');

  if (existing.status === BookingStatus.CANCELLED) {
    throw ApiError.conflict('La reserva ya estaba cancelada');
  }

  await prisma.$transaction(async (tx) => {
    for (const bf of existing.flights) {
      await tx.flightFare.updateMany({
        where: { flightId: bf.flightId, fareId: bf.fareId },
        data: { availableSeats: { increment: 1 } },
      });
    }
    await tx.booking.update({
      where: { id: existing.id },
      data: { status: BookingStatus.CANCELLED },
    });
    // Los pases de abordaje emitidos quedan anulados.
    await tx.boardingPass.updateMany({
      where: { bookingPassenger: { bookingId: existing.id } },
      data: { status: 'CANCELLED' },
    });
  });

  await audit({
    userId: user.id,
    action: 'CANCEL',
    entity: 'Booking',
    entityId: existing.id,
    metadata: { bookingCode: existing.bookingCode },
  });

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: existing.id },
    include: bookingInclude,
  });

  return ok(serializeBooking(booking));
});
