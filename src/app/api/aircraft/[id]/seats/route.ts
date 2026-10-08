import { UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { canManage, getCurrentUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { seatBulkSchema, seatSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const listQuery = z.object({
  flightId: z.string().optional(),
  cabinClass: z.enum(['ECONOMY', 'PREMIUM', 'BUSINESS', 'FIRST']).optional(),
  type: z.enum(['WINDOW', 'AISLE', 'MIDDLE', 'EXIT']).optional(),
  free: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/**
 * GET /api/aircraft/:id/seats
 * Mapa de cabina para el paso 2 del flujo de reserva.
 * `free=true` devuelve solo los asientos sin BookingPassenger asignado.
 *
 * El mapa es publico (hace falta para elegir butaca), pero los nombres de quien
 * ya esta asignado SOLO se muestran a Operations: alcanza con conocer el endpoint.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const q = parseQuery(req, listQuery);
  const staff = canManage(await getCurrentUser());

  const aircraft = await prisma.aircraft.findUnique({
    where: { id },
    select: { id: true, registration: true, model: true, layout: true, seatCount: true },
  });
  if (!aircraft) throw ApiError.notFound('Aeronave no encontrada');

  const activeLocks = q.flightId
    ? await prisma.seatLock.findMany({
        where: {
          flightId: q.flightId,
          expiresAt: { gt: new Date() },
        },
        select: { seatId: true },
      })
    : [];
  const lockedSeatIds = new Set(activeLocks.map((l) => l.seatId));

  const where = {
    aircraftId: id,
    ...(q.cabinClass ? { cabinClass: q.cabinClass } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.free === undefined
      ? {}
      : q.free
        ? {
            bookingPassengers: { none: {} },
            id: { notIn: Array.from(lockedSeatIds) },
          }
        : {}),
  };

  const orderBy = [{ rowNumber: 'asc' as const }, { columnLetter: 'asc' as const }];

  // Dos consultas y no una con `select` dinamico: Prisma no acepta un `select`
  // anidado sin ningun campo verdadero.
  const seats = staff
    ? await prisma.seat.findMany({
        where,
        orderBy,
        include: {
          bookingPassengers: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              checkInStatus: true,
              booking: { select: { bookingCode: true } },
            },
          },
        },
      })
    : await prisma.seat.findMany({
        where,
        orderBy,
        include: { bookingPassengers: { select: { id: true } } },
      });

  return ok({
    aircraft,
    data: seats.map((s) => ({
      ...s,
      occupied: s.bookingPassengers.length > 0 || lockedSeatIds.has(s.id),
      locked: lockedSeatIds.has(s.id),
      bookingPassengers: s.bookingPassengers,
    })),
  });
});

/** POST /api/aircraft/:id/seats — alta de un asiento (Operations). */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, seatSchema);

  const aircraft = await prisma.aircraft.findUnique({ where: { id }, select: { id: true } });
  if (!aircraft) throw ApiError.notFound('Aeronave no encontrada');

  const seat = await prisma.seat.create({ data: { ...body, aircraftId: id } }).catch(() => {
    throw ApiError.conflict('Ya existe ese asiento en la aeronave');
  });

  return created(seat);
});

/** PUT /api/aircraft/:id/seats — carga masiva del mapa de cabina (Operations). */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, seatBulkSchema);

  const aircraft = await prisma.aircraft.findUnique({ where: { id }, select: { id: true } });
  if (!aircraft) throw ApiError.notFound('Aeronave no encontrada');

  const result = await prisma.seat.createMany({
    data: body.seats.map((s) => ({ ...s, aircraftId: id })),
    skipDuplicates: true,
  });

  return ok({ inserted: result.count });
});
