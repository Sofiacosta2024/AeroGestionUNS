import type { Prisma } from '@prisma/client';
import { canManage, type AuthUser } from './auth';

/** Include estandar de una reserva con todo lo que muestra la interfaz. */
export const bookingInclude = {
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
      seat: true,
      baggage: { select: { id: true, tagCode: true, type: true, status: true, weightKg: true } },
      boardingPass: true,
    },
  },
  payments: true,
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Convierte los Decimal de Prisma a number para que el frontend no tenga que parsearlos. */
export function serializeBooking(booking: BookingWithRelations) {
  return {
    ...booking,
    totalAmount: Number(booking.totalAmount),
    flights: booking.flights.map((bf) => ({
      ...bf,
      price: Number(bf.price),
      flight: {
        ...bf.flight,
        punctualityPct:
          bf.flight.punctualityPct === null ? null : Number(bf.flight.punctualityPct),
      },
    })),
    payments: booking.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  };
}

export type SerializedBooking = ReturnType<typeof serializeBooking>;

/**
 * El codigo de reserva (AG-XXXXXX) es publico y se usa para consultar una reserva
 * sin sesion, asi que alcanza SOLO con él no puede devolver datos nominales.
 * Esta vista conserva lo operativo (vuelos, estado, butacas) y oculta lo personal.
 */
export function redactBooking(booking: SerializedBooking) {
  return {
    ...booking,
    // Identificador interno de la base: el cliente no lo necesita.
    userId: null,
    contactEmail: maskEmail(booking.contactEmail),
    contactPhone: booking.contactPhone ? '********' : null,
    notes: null,
    payments: [],
    passengers: booking.passengers.map((p) => ({
      ...p,
      firstName: 'Pasajero',
      lastName: `${String(p.lastName ?? ' ').charAt(0).toUpperCase()}.`,
      documentNumber: '********',
      birthDate: null,
      checkInCode: null,
      boardingPass: null,
    })),
  };
}

/** El usuario puede ver los datos personales de la reserva? (dueno o Operations). */
export function canViewBookingPii(
  user: AuthUser | null,
  booking: { userId: string | null },
): boolean {
  if (!user) return false;
  return canManage(user) || booking.userId === user.id;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  const head = local?.slice(0, 1) ?? '';
  return `${head}***@${domain}`;
}
