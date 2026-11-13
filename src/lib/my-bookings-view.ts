import { CONTINGENCY_BOOKING_STATUSES } from './contingency-status';

/**
 * US-15 v2.0: panel "Mis Reservas" del pasajero registrado.
 *
 * Este modulo es seguro para el cliente: define las formas que cruzan el limite
 * Server -> Client y las reglas puras de clasificacion (que pestana corresponde
 * a cada estado). No importa Prisma ni `next/server`.
 */

/** Mensaje literal exigido por US-15 para el estado vacio (WF-15-E). */
export const MY_BOOKINGS_EMPTY_MESSAGE =
  'Aún no posees reservas asociadas a tu cuenta. Podés realizar una búsqueda de vuelos desde el inicio.';

export type MyBookingCategory = 'upcoming' | 'past';

/**
 * Estados de la pestana "Proximos Vuelos": reservas activas (incluido el pago
 * pendiente, que todavia no es historial) y las que estan en gestion por
 * contingencia (US-15 v2.0): REPROGRAMACION_PENDIENTE, REASIGNACION_PROPUESTA
 * y SIN_ALTERNATIVA.
 */
export const UPCOMING_BOOKING_STATUSES: readonly string[] = [
  'PENDING',
  'CONFIRMED',
  'PAID',
  'REPROGRAMADA',
  'REASIGNADO',
  ...CONTINGENCY_BOOKING_STATUSES,
];

/** Estados finalizados o cancelados: pestana "Historial / Pasados". */
export const PAST_BOOKING_STATUSES: readonly string[] = [
  'CANCELLED',
  'COMPLETED',
  'BOARDED',
  'NO_SHOW',
];

/**
 * Pestana a la que pertenece una reserva. Tolera mayusculas/minusculas y
 * espacios exteriores. Todo estado no reconocido cae en el historial, que es
 * el bucket de solo lectura (nunca ofrece una accion que la reserva no admite).
 */
export function classifyBookingStatus(status: string | null | undefined): MyBookingCategory {
  const key = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return UPCOMING_BOOKING_STATUSES.includes(key) ? 'upcoming' : 'past';
}

export type MyBookingAirport = { iataCode: string; city: string; name: string };

export type MyBookingFlightView = {
  flightCode: string;
  origin: MyBookingAirport | null;
  destination: MyBookingAirport | null;
  /** ISO 8601 en UTC; la interfaz lo muestra en ART. */
  departureAt: string | null;
  arrivalAt: string | null;
  status: string;
  isReturn: boolean;
  fareName: string | null;
  cabinClass: string;
};

/** Datos mínimos del e-ticket local, disponible al confirmarse el pago. */
export type MyBookingTicketView = {
  bookingCode: string;
  ticketCode: string;
  flightCode: string;
  seat: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  origin: MyBookingAirport | null;
  destination: MyBookingAirport | null;
};

export type MyBookingView = {
  bookingCode: string;
  status: string;
  category: MyBookingCategory;
  tripType: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  /** ISO 8601 en UTC. */
  createdAt: string | null;
  flights: MyBookingFlightView[];
  tickets: MyBookingTicketView[];
  /** Vuelo propuesto por la aerolinea durante una contingencia (si existe). */
  proposedFlight: MyBookingFlightView | null;
  proposalReason: string | null;
  passengerResponse: string | null;
};

export type MyBookingsResponse = {
  upcoming: MyBookingView[];
  past: MyBookingView[];
};

/** Reparte las reservas en las dos pestanas sin alterar el orden recibido. */
export function partitionMyBookings(bookings: MyBookingView[]): MyBookingsResponse {
  const upcoming: MyBookingView[] = [];
  const past: MyBookingView[] = [];
  for (const booking of bookings) {
    (booking.category === 'upcoming' ? upcoming : past).push(booking);
  }
  return { upcoming, past };
}
