import { Prisma, UserRole } from '@prisma/client';
import { ApiError, handler, ok, parseQuery } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adminBookingSearchQuery, normalizeBookingCode } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const bookingInclude = {
  flights: {
    include: {
      flight: {
        include: {
          route: { include: { originAirport: true, destinationAirport: true } },
          aircraft: { select: { registration: true, model: true } },
        },
      },
      fare: true,
    },
  },
  passengers: {
    include: {
      passenger: true,
      seat: true,
    },
  },
} satisfies Prisma.BookingInclude;

function normalizeDocumentNumber(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, '').trim();
}

function toAdminRow(booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  const [firstPassenger] = booking.passengers;
  const [firstFlight] = booking.flights;

  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    status: booking.status,
    totalAmount: Number(booking.totalAmount),
    currency: booking.currency,
    mainPassenger:
      firstPassenger ? `${firstPassenger.firstName} ${firstPassenger.lastName}`.trim() : 'Sin pasajero',
    documentNumber: firstPassenger?.documentNumber ?? null,
    flightCode: firstFlight?.flight.code ?? null,
    departureAt: firstFlight ? new Date(firstFlight.departureAt).toISOString() : null,
    createdAt: new Date(booking.createdAt).toISOString(),
    passengers: booking.passengers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      documentType: p.documentType,
      documentNumber: p.documentNumber,
      birthDate: p.birthDate ? new Date(p.birthDate).toISOString() : null,
      passengerId: p.passengerId,
    })),
  };
}

export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.MOSTRADOR);
  const { bookingCode, documentNumber, lastName, flightCode, page, pageSize } = parseQuery(
    req,
    adminBookingSearchQuery,
  );

  const cleanedBookingCode = bookingCode?.trim() ? normalizeBookingCode(bookingCode) : undefined;
  const cleanedDocument = documentNumber?.trim() ? normalizeDocumentNumber(documentNumber) : undefined;
  const cleanedLastName = lastName?.trim() ? lastName.trim() : undefined;
  const cleanedFlightCode = flightCode?.trim() ? flightCode.trim().toUpperCase() : undefined;

  const insensitiveMode: Prisma.QueryMode = 'insensitive';

  const where: Prisma.BookingWhereInput = {
    AND: [
      ...(cleanedBookingCode ? [{ bookingCode: cleanedBookingCode }] : []),
      ...(cleanedDocument
        ? [
            {
              passengers: {
                some: {
                  documentNumber: { contains: cleanedDocument, mode: insensitiveMode },
                },
              },
            },
          ]
        : []),
      ...(cleanedLastName
        ? [
            {
              passengers: {
                some: {
                  lastName: { contains: cleanedLastName, mode: insensitiveMode },
                },
              },
            },
          ]
        : []),
      ...(cleanedFlightCode
        ? [
            {
              flights: {
                some: {
                  flight: {
                    code: { contains: cleanedFlightCode, mode: insensitiveMode },
                  },
                },
              },
            },
          ]
        : []),
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  if (total === 0) {
    return ok({
      data: [],
      pagination: { page, pageSize, total, pages: 0 },
      message: 'No se encontraron reservas con los criterios de búsqueda ingresados.',
    });
  }

  return ok({
    data: rows.map(toAdminRow),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});
