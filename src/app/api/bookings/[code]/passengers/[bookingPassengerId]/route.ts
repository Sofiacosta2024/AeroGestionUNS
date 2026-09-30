import { BookingStatus, UserRole } from '@prisma/client';
import { ApiError, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkInSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string; bookingPassengerId: string }> };

/**
 * PATCH /api/bookings/:code/passengers/:bookingPassengerId
 * Check-in digital: asigna el asiento (por id o por numero, ej. "12A").
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { code, bookingPassengerId } = await ctx.params;
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, checkInSchema);

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true, status: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const passenger = await prisma.bookingPassenger.findFirst({
    where: { id: bookingPassengerId, bookingId: booking.id },
  });
  if (!passenger) throw ApiError.notFound('Pasajero de la reserva no encontrado');

  let seatId = body.seatId ?? null;

  if (!seatId && body.seatNumber) {
    // La UI muestra el asiento como "12A" -> se busca en la aeronave del vuelo.
    const match = /^(\d{1,2})\s*([A-Z])$/i.exec(body.seatNumber.trim());
    if (!match) throw ApiError.badRequest('Formato de asiento invalido (ej. 12A)');

    const rowNumber = Number(match[1]);
    const columnLetter = match[2]!.toUpperCase();

    const flight = await prisma.bookingFlight.findFirst({
      where: { bookingId: booking.id },
      select: { flight: { select: { aircraftId: true } } },
      orderBy: { departureAt: 'asc' },
    });
    if (!flight) throw ApiError.badRequest('La reserva no tiene vuelos asociados');

    const seat = await prisma.seat.findUnique({
      where: {
        aircraftId_rowNumber_columnLetter: {
          aircraftId: flight.flight.aircraftId,
          rowNumber,
          columnLetter,
        },
      },
    });
    if (!seat) throw ApiError.notFound(`El asiento ${body.seatNumber} no existe en la aeronave`);
    seatId = seat.id;
  }

  if (seatId) {
    const taken = await prisma.bookingPassenger.findFirst({
      where: { seatId, NOT: { id: bookingPassengerId } },
      select: { id: true },
    });
    if (taken) throw ApiError.conflict('El asiento seleccionado ya esta ocupado');
  }

  const updated = await prisma.bookingPassenger.update({
    where: { id: bookingPassengerId },
    data: { seatId, checkInStatus: body.checkInStatus },
    include: { seat: true, boardingPass: true, baggage: true },
  });

  if (body.checkInStatus === 'DONE' && booking.status === BookingStatus.CONFIRMED) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.PAID },
    });
  }

  await audit({
    userId: user.id,
    action: 'CHECK_IN',
    entity: 'BookingPassenger',
    entityId: updated.id,
    metadata: { bookingCode: booking.bookingCode, seatId, status: body.checkInStatus },
  });

  return ok(updated);
});
