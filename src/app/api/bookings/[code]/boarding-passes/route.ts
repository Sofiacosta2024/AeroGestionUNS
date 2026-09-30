import { BookingStatus, UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { getCurrentUser, requireRole } from '@/lib/auth';
import { canViewBookingPii } from '@/lib/bookings';
import { generateShortCode } from '@/lib/codes';
import { prisma } from '@/lib/prisma';
import { boardingPassSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/bookings/:code/boarding-passes — pases emitidos (paso 4 del flujo).
 *
 * El pase es un documento de viaje con datos del pasajero: requiere sesion y que
 * el usuario sea el dueno de la reserva o pertenezca a Operations.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized('Inicie sesion para consultar los pases de embarque');

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, userId: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  if (!canViewBookingPii(user, booking)) {
    throw ApiError.forbidden('La reserva no pertenece a su usuario');
  }

  const data = await prisma.boardingPass.findMany({
    where: { bookingPassenger: { bookingId: booking.id } },
    include: {
      seat: true,
      bookingPassenger: {
        include: {
          booking: { select: { bookingCode: true, contactEmail: true } },
        },
      },
    },
    orderBy: { issuedAt: 'asc' },
  });

  return ok({ data });
});

/**
 * POST /api/bookings/:code/boarding-passes
 * Emision del pase: requiere reserva pagada y pasajero con asiento asignado.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, boardingPassSchema);

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: { flights: { select: { flight: { select: { code: true } }, departureAt: true } } },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  if (booking.status === BookingStatus.PENDING) {
    throw ApiError.conflict('No se puede emitir el pase: la reserva aun no fue pagada');
  }
  if (booking.status === BookingStatus.CANCELLED) {
    throw ApiError.conflict('No se puede emitir el pase: la reserva esta cancelada');
  }

  const passenger = await prisma.bookingPassenger.findFirst({
    where: { id: body.bookingPassengerId, bookingId: booking.id },
    include: { boardingPass: true },
  });
  if (!passenger) throw ApiError.notFound('El pasajero indicado no pertenece a esta reserva');
  if (passenger.boardingPass) throw ApiError.conflict('El pasajero ya tiene un pase emitido');
  if (!passenger.seatId) throw ApiError.conflict('El pasajero todavia no tiene asiento asignado');

  const firstFlight = booking.flights[0];
  if (!firstFlight) throw ApiError.badRequest('La reserva no tiene vuelos asociados');

  const boardingPass = await prisma.boardingPass.create({
    data: {
      code: `BP-${generateShortCode(6)}`,
      bookingPassengerId: passenger.id,
      seatId: passenger.seatId,
      flightCode: firstFlight.flight.code,
      status: 'ISSUED',
    },
    include: { seat: true, bookingPassenger: { include: { booking: true } } },
  });

  await prisma.bookingPassenger.update({
    where: { id: passenger.id },
    data: { checkInStatus: 'DONE' },
  });

  await audit({
    userId: user.id,
    action: 'ISSUE_BOARDING_PASS',
    entity: 'BoardingPass',
    entityId: boardingPass.id,
    metadata: { bookingCode: booking.bookingCode, flightCode: boardingPass.flightCode },
  });

  return created(boardingPass);
});
