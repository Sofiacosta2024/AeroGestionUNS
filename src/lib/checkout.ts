import { prisma } from './prisma';
import {
  bookingInclude,
  canViewBookingPii,
  type BookingWithRelations,
} from './bookings';
import { getCurrentUser } from './auth';
import { notFound, redirect } from 'next/navigation';
import type { Receipt } from './payment-email';

export async function loadCheckout(code: string) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: bookingInclude,
  });
  if (!booking || !canViewBookingPii(user, booking)) notFound();
  return { user, booking };
}

export function toReceipt(booking: BookingWithRelations): Receipt {
  const payment = booking.payments.find((p) => p.status === 'APPROVED');
  return {
    code: booking.bookingCode,
    email: booking.contactEmail,
    reference: payment?.transactionRef ?? payment?.id ?? '',
    amount: Number(payment?.amount ?? booking.totalAmount),
    currency: booking.currency,
    flights: [...booking.flights]
      .sort((a, b) => +a.departureAt - +b.departureAt)
      .map(({ flight }) => ({
        code: flight.code,
        origin: `${flight.route.originAirport.iataCode} · ${flight.route.originAirport.city}`,
        destination: `${flight.route.destinationAirport.iataCode} · ${flight.route.destinationAirport.city}`,
        departureAt: flight.departureAt.toISOString(),
        arrivalAt: flight.arrivalAt.toISOString(),
        isDirect: flight.isDirect,
      })),
    passengers: booking.passengers.map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      seat: p.seat
        ? `${p.seat.rowNumber}${p.seat.columnLetter}`
        : 'Sin asignar',
    })),
  };
}
