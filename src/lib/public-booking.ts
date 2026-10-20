import { NextResponse } from 'next/server';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError, ok, toErrorResponse } from './api';
import { bookingPublicLookupSchema, normalizeLastName } from './validation';
import { toAirportOption } from './view-models';

/**
 * Consulta publica de una reserva (US-14A / RF-14).
 *
 * El codigo de reserva (`AG-XXXXXX`) es publico, por lo que por si solo no puede
 * habilitar la vista: se exige ademas el apellido de un pasajero de la reserva.
 * Ambas condiciones se resuelven en una unica consulta (sin N+1) y la respuesta
 * se proyecta a un DTO minimo y sin datos personales completos.
 */

/** Mensajes exactos que la vista publica muestra al usuario. */
export const PUBLIC_LOOKUP_MESSAGES = {
  empty: 'Por favor, complete ambos campos para realizar la búsqueda.',
  notFound:
    'No encontramos ninguna reserva que coincida con el código y apellido ingresados. Por favor verifique sus datos.',
} as const;

/** Relaciones minimas que necesita la vista publica (una sola consulta). */
const publicBookingInclude = {
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
  passengers: { include: { seat: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.BookingInclude;

export type PublicBookingRecord = Prisma.BookingGetPayload<{
  include: typeof publicBookingInclude;
}>;

/** Proyeccion publica: solo los campos que la vista necesita. */
export type PublicBookingView = {
  bookingCode: string;
  status: string;
  tripType: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  flights: Array<{
    flightCode: string;
    origin: ReturnType<typeof toAirportOption>;
    destination: ReturnType<typeof toAirportOption>;
    departureAt: Date;
    arrivalAt: Date;
    status: string;
    isReturn: boolean;
    price: number;
    fare: { name: string; cabinClass: string; seatSelection: boolean };
  }>;
  passengers: Array<{
    firstName: string;
    lastName: string;
    documentType: string;
    /** Documento enmascarado: nunca se expone el DNI completo. */
    documentNumber: string;
    seatNumber: string | null;
    checkInStatus: string;
  }>;
};

/** Enmascara un documento dejando visibles solo los ultimos 3 caracteres. */
export function maskDocument(documentNumber: string): string {
  const visible = documentNumber.slice(-3);
  return `${'*'.repeat(Math.max(documentNumber.length - 3, 0))}${visible}`;
}

/** Proyecta la reserva a la vista publica (sin PII completa ni datos internos). */
export function toPublicBookingView(booking: PublicBookingRecord): PublicBookingView {
  return {
    bookingCode: booking.bookingCode,
    status: booking.status,
    tripType: booking.tripType,
    cabinClass: booking.cabinClass,
    passengersCount: booking.passengersCount,
    totalAmount: Number(booking.totalAmount),
    currency: booking.currency,
    createdAt: booking.createdAt,
    flights: booking.flights.map((bf) => ({
      flightCode: bf.flight.code,
      origin: toAirportOption(bf.flight.route.originAirport),
      destination: toAirportOption(bf.flight.route.destinationAirport),
      departureAt: bf.flight.departureAt,
      arrivalAt: bf.flight.arrivalAt,
      status: bf.flight.status,
      isReturn: bf.isReturn,
      price: Number(bf.price),
      fare: {
        name: bf.fare.name,
        cabinClass: bf.fare.cabinClass,
        seatSelection: bf.seatSelectionIncluded || bf.fare.seatSelection,
      },
    })),
    passengers: booking.passengers.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      documentType: p.documentType,
      documentNumber: maskDocument(p.documentNumber),
      seatNumber: p.seat ? `${p.seat.rowNumber}${p.seat.columnLetter}` : null,
      checkInStatus: p.checkInStatus,
    })),
  };
}

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

/**
 * Resuelve la consulta contra la base. Devuelve la reserva solo si existe y el
 * apellido pertenece a alguno de sus pasajeros; en cualquier otro caso devuelve
 * `null` (misma respuesta para "no existe" y "apellido incorrecto").
 */
export async function findPublicBooking(
  db: PrismaClient,
  input: { code: string; lastName: string },
): Promise<PublicBookingRecord | null> {
  const booking = await db.booking.findUnique({
    where: { bookingCode: input.code },
    include: publicBookingInclude,
  });

  if (!booking) return null;

  const surname = input.lastName.toLowerCase();
  const matches = booking.passengers.some(
    (p) => normalizeLastName(p.lastName).toLowerCase() === surname,
  );

  return matches ? booking : null;
}

/**
 * Handler del endpoint publico (`POST /api/v1/reservas/consulta`).
 * Se separa del Route Handler para poder inyectar la conexion en las pruebas.
 */
export async function executePublicBookingLookup(
  req: Request,
  db: PrismaClient,
): Promise<NextResponse> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw ApiError.badRequest('El cuerpo de la peticion debe ser JSON valido');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    if (isMissing(body.code) || isMissing(body.lastName)) {
      throw ApiError.badRequest(PUBLIC_LOOKUP_MESSAGES.empty);
    }

    // Validacion/normalizacion en el servidor (independiente del frontend).
    const { code, lastName } = bookingPublicLookupSchema.parse(raw);

    const booking = await findPublicBooking(db, { code, lastName });
    if (!booking) {
      // Misma respuesta para codigo inexistente y apellido incorrecto: evita
      // que un atacante pueda enumerar reservas.
      throw ApiError.notFound(PUBLIC_LOOKUP_MESSAGES.notFound);
    }

    return ok(toPublicBookingView(booking));
  } catch (err) {
    return toErrorResponse(err);
  }
}
