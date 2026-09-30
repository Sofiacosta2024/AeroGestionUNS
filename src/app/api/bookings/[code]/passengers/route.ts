import { UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManage, getCurrentUser, requireRole } from '@/lib/auth';
import { generateShortCode } from '@/lib/codes';
import { prisma } from '@/lib/prisma';
import { bookingPassengerSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

const listQuery = z.object({ checkInStatus: z.enum(['NOT_STARTED', 'OPEN', 'DONE']).optional() });

/** GET /api/bookings/:code/passengers */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const q = parseQuery(req, listQuery);
  const booking = await loadBooking(code);
  await assertCanAccess(booking);

  const data = await prisma.bookingPassenger.findMany({
    where: { bookingId: booking.id, ...(q.checkInStatus ? { checkInStatus: q.checkInStatus } : {}) },
    include: { seat: true, baggage: true, boardingPass: true, passenger: true },
    orderBy: { lastName: 'asc' },
  });

  return ok({ data });
});

/**
 * POST /api/bookings/:code/passengers
 * Paso 2 del flujo: asignacion nominal de butacas + datos del pasajero.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.PASAJERO);
  const body = await parseBody(req, bookingPassengerSchema);

  const booking = await loadBooking(code);
  await assertCanAccess(booking);

  if (body.passengerId) {
    const master = await prisma.passenger.findUnique({ where: { id: body.passengerId } });
    if (!master) throw ApiError.badRequest('El pasajero indicado no existe');
  }

  if (body.seatId) {
    const seatTaken = await prisma.bookingPassenger.findFirst({
      where: { seatId: body.seatId },
      select: { id: true },
    });
    if (seatTaken) throw ApiError.conflict('El asiento seleccionado ya esta ocupado');
  }

  const total = await prisma.bookingPassenger.count({ where: { bookingId: booking.id } });
  if (total >= booking.passengersCount) {
    throw ApiError.conflict(
      `La reserva ya tiene su maximo de ${booking.passengersCount} pasajero(s)`,
    );
  }

  const bookingPassenger = await prisma.bookingPassenger.create({
    data: {
      bookingId: booking.id,
      passengerId: body.passengerId ?? null,
      firstName: body.firstName,
      lastName: body.lastName,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      birthDate: body.birthDate ?? null,
      seatId: body.seatId ?? null,
      checkInCode: generateShortCode(),
      checkInStatus: 'NOT_STARTED',
    },
    include: { seat: true, baggage: true, boardingPass: true },
  });

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'BookingPassenger',
    entityId: bookingPassenger.id,
    metadata: { bookingCode: booking.bookingCode },
  });

  return created(bookingPassenger);
});

// --- helpers ---------------------------------------------------------------

async function loadBooking(code: string) {
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true, status: true, passengersCount: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  return booking;
}

async function assertCanAccess(booking: { userId: string | null; bookingCode: string }) {
  const user = await getCurrentUser();
  if (canManage(user)) return;
  if (user && booking.userId === user.id) return;
  throw ApiError.forbidden('No tiene permisos para modificar esta reserva');
}
