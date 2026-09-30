import { BookingStatus, Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManage, getCurrentUser } from '@/lib/auth';
import { bookingInclude, redactBooking, serializeBooking } from '@/lib/bookings';
import { generateBookingCode } from '@/lib/codes';
import { prisma } from '@/lib/prisma';
import { bookingSchema, paginationQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const listQuery = paginationQuery.extend({
  status: z
    .enum(['PENDING', 'CONFIRMED', 'PAID', 'BOARDED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
    .optional(),
  search: z.string().trim().max(120).optional(),
});

/** GET /api/bookings?status=CONFIRMED&search=AG- */
export const GET = handler(async (req: Request) => {
  const user = await getCurrentUser();
  const { page, pageSize, status, search } = parseQuery(req, listQuery);

  // Sin sesion solo se permite consultar por codigo exacto de reserva.
  const publicLookup = !user && !!search && /^[A-Z]{2}-[A-Z0-9]{4,10}$/i.test(search.trim());

  if (!user && !publicLookup) {
    throw ApiError.unauthorized('Inicie sesion para consultar sus reservas');
  }

  const where: Prisma.BookingWhereInput = {
    ...(status ? { status } : {}),
    ...(user
      ? canManage(user)
        ? {}
        : { userId: user.id }
      : { bookingCode: search!.trim().toUpperCase() }),
  };

  const [total, data] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    // Sin sesion la consulta es por codigo exacto: alcanza con conocerlo, asi que
    // se devuelve la vista redacted (sin nombres, documentos ni pagos).
    data: data.map((b) => (user ? serializeBooking(b) : redactBooking(serializeBooking(b)))),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});

/**
 * POST /api/bookings
 *
 * Crea la reserva del paso 1 del flujo (seleccion de vuelo + tarifa).
 * El precio SIEMPRE se resuelve en el servidor a partir de FlightFare:
 * el cliente nunca envia importes.
 */
export const POST = handler(async (req: Request) => {
  const user = await getCurrentUser();
  const body = await parseBody(req, bookingSchema);

  const fareIds = body.flights.map((f) => f.fareId);

  const flights = await prisma.flight.findMany({
    where: { id: { in: body.flights.map((f) => f.flightId) } },
    include: { fares: { where: { fareId: { in: fareIds } } } },
  });

  if (flights.length !== body.flights.length) {
    throw ApiError.badRequest('Alguno de los vuelos seleccionados no existe');
  }

  const items = body.flights.map((requested) => {
    const flight = flights.find((f) => f.id === requested.flightId)!;
    const flightFare = flight.fares.find((f) => f.fareId === requested.fareId);

    if (!flightFare) {
      throw ApiError.badRequest(`La tarifa indicada no esta disponible en el vuelo ${flight.code}`);
    }
    if (flight.status === 'CANCELLED') {
      throw ApiError.conflict(`El vuelo ${flight.code} esta cancelado`);
    }
    if (flightFare.availableSeats < 1) {
      throw ApiError.conflict(`No quedan asientos disponibles en el vuelo ${flight.code}`);
    }

    return {
      flight,
      fareId: requested.fareId,
      price: flightFare.price,
      isReturn: requested.isReturn,
    };
  });

  const unitTotal = items.reduce((acc, i) => acc.add(i.price), new Prisma.Decimal(0));

  const booking = await prisma.$transaction(async (tx) => {
    // Descuento condicional: impide la sobreventa ante reservas concurrentes.
    for (const item of items) {
      const updated = await tx.flightFare.updateMany({
        where: { flightId: item.flight.id, fareId: item.fareId, availableSeats: { gte: 1 } },
        data: { availableSeats: { decrement: 1 } },
      });
      if (updated.count === 0) {
        throw ApiError.conflict(`Se agotaron los asientos del vuelo ${item.flight.code}`);
      }
    }

    return tx.booking.create({
      data: {
        bookingCode: generateBookingCode(),
        userId: user?.id ?? null,
        tripType: body.tripType,
        status: BookingStatus.PENDING,
        cabinClass: body.cabinClass,
        totalAmount: unitTotal,
        contactEmail: user?.email ?? body.contactEmail,
        contactPhone: body.contactPhone ?? null,
        notes: body.notes ?? null,
        flights: {
          create: items.map((i) => ({
            flightId: i.flight.id,
            fareId: i.fareId,
            price: i.price,
            isReturn: i.isReturn,
            departureAt: i.flight.departureAt,
          })),
        },
      },
      include: bookingInclude,
    });
  });

  await audit({
    userId: user?.id ?? null,
    action: 'CREATE',
    entity: 'Booking',
    entityId: booking.id,
    metadata: { bookingCode: booking.bookingCode, flights: items.map((i) => i.flight.code) },
  });

  return created(serializeBooking(booking));
});
