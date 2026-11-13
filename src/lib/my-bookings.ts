import type { Prisma, PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';
import { ok } from './api';
import { toAirportOption } from './view-models';
import {
  classifyBookingStatus,
  partitionMyBookings,
  type MyBookingFlightView,
  type MyBookingTicketView,
  type MyBookingView,
} from './my-bookings-view';

/**
 * US-15 v2.0: reservas de un pasajero registrado.
 *
 * Regla "Asociacion Automatica por Email": una reserva pertenece al usuario si
 * fue creada con su sesion (`userId`) o si se hizo como invitado y el correo de
 * contacto coincide con el de su cuenta. Se resuelve en una unica consulta con
 * `OR` (sin mutar la base) para poder inyectar la conexion en las pruebas.
 */

/** Relaciones minimas para el panel: vuelos, tarifas y el vuelo propuesto. */
export const myBookingsInclude = {
  flights: {
    include: {
      flight: {
        include: {
          route: { include: { originAirport: true, destinationAirport: true } },
        },
      },
      fare: true,
    },
  },
  vueloPropuesto: {
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
    },
  },
  passengers: {
    select: {
      id: true,
      seat: { select: { rowNumber: true, columnLetter: true } },
      boardingPass: { select: { code: true, status: true, flightCode: true } },
    },
  },
  payments: { select: { status: true } },
} satisfies Prisma.BookingInclude;

export type MyBookingRecord = Prisma.BookingGetPayload<{ include: typeof myBookingsInclude }>;

type FlightForView = {
  code: string;
  departureAt: Date;
  arrivalAt: Date;
  status: string;
  route: {
    originAirport: { iataCode: string; city: string; name: string };
    destinationAirport: { iataCode: string; city: string; name: string };
  };
};

function toFlightView(
  flight: FlightForView,
  extra: { isReturn: boolean; fareName: string | null; cabinClass: string },
): MyBookingFlightView {
  return {
    flightCode: flight.code,
    origin: flight.route ? toAirportOption(flight.route.originAirport) : null,
    destination: flight.route ? toAirportOption(flight.route.destinationAirport) : null,
    departureAt: flight.departureAt ? new Date(flight.departureAt).toISOString() : null,
    arrivalAt: flight.arrivalAt ? new Date(flight.arrivalAt).toISOString() : null,
    status: flight.status,
    isReturn: extra.isReturn,
    fareName: extra.fareName,
    cabinClass: extra.cabinClass,
  };
}

/** Proyecta la reserva al DTO del panel (sin PII completa ni datos internos). */
export function toMyBookingView(booking: MyBookingRecord): MyBookingView {
  const hasApprovedPayment = booking.payments?.some((payment) => payment.status === 'APPROVED') ?? false;
  const orderedPassengers = [...(booking.passengers ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const tickets: MyBookingTicketView[] = booking.status === 'CANCELLED' || !hasApprovedPayment
    ? []
    : booking.flights.flatMap(({ flight }) =>
        orderedPassengers.map((passenger, passengerIndex) => {
          const pass = passenger.boardingPass;
          const hasOfficialPass = pass?.status === 'ISSUED' && pass.flightCode === flight.code;
          return {
            bookingCode: booking.bookingCode,
            // Keep an issued boarding-pass code when available; otherwise this stable
            // app e-ticket code is generated from the paid booking and needs no staff action.
            ticketCode: hasOfficialPass && pass
              ? pass.code
              : `ET-${booking.bookingCode}-${flight.code}-${passengerIndex + 1}`,
            flightCode: flight.code,
            seat: passenger.seat ? `${passenger.seat.rowNumber}${passenger.seat.columnLetter}` : null,
            departureAt: flight.departureAt ? new Date(flight.departureAt).toISOString() : null,
            arrivalAt: flight.arrivalAt ? new Date(flight.arrivalAt).toISOString() : null,
            origin: flight.route ? toAirportOption(flight.route.originAirport) : null,
            destination: flight.route ? toAirportOption(flight.route.destinationAirport) : null,
          };
        }),
      );
  return {
    bookingCode: booking.bookingCode,
    status: booking.status,
    category: classifyBookingStatus(booking.status),
    tripType: booking.tripType,
    cabinClass: booking.cabinClass,
    passengersCount: booking.passengersCount,
    totalAmount: Number(booking.totalAmount),
    currency: booking.currency,
    createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : null,
    flights: booking.flights.map((bf) =>
      toFlightView(bf.flight, {
        isReturn: bf.isReturn,
        fareName: bf.fare?.name ?? null,
        cabinClass: bf.fare?.cabinClass ?? booking.cabinClass,
      }),
    ),
    tickets,
    proposedFlight: booking.vueloPropuesto
      ? toFlightView(booking.vueloPropuesto, {
          isReturn: false,
          fareName: null,
          cabinClass: booking.cabinClass,
        })
      : null,
    proposalReason: booking.propuestaMotivo ?? null,
    passengerResponse: booking.respuestaPasajero ?? null,
  };
}

/** Reservas del usuario ordenadas de la mas reciente a la mas antigua. */
export async function findMyBookings(
  db: PrismaClient,
  input: { userId: string; email: string },
): Promise<MyBookingView[]> {
  const bookings = await db.booking.findMany({
    where: {
      OR: [
        { userId: input.userId },
        // Invitado: solo se asocia por email, nunca una reserva ya asignada a otro usuario.
        { userId: null, contactEmail: { equals: input.email, mode: 'insensitive' } },
      ],
    },
    include: myBookingsInclude,
    orderBy: { createdAt: 'desc' },
  });
  return bookings.map(toMyBookingView);
}

/**
 * Handler del listado (`GET /api/v1/pasajeros/mis-reservas`). Se separa del
 * Route Handler para poder inyectar la conexion en las pruebas.
 */
export async function executeMyBookingsList(
  db: PrismaClient,
  user: { id: string; email: string },
): Promise<NextResponse> {
  const bookings = await findMyBookings(db, { userId: user.id, email: user.email });
  return ok(partitionMyBookings(bookings));
}
