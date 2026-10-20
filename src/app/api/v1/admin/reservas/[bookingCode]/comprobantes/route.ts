import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { ApiError, handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { bookingInclude, serializeBooking } from '@/lib/bookings';
import { buildPasajePdf } from '@/lib/pasaje-pdf';
import { buildFacturaPdf } from '@/lib/factura-pdf';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireRole(UserRole.MOSTRADOR);
  const { bookingCode } = await ctx.params;
  const booking = await prisma.booking.findUnique({ where: { bookingCode: bookingCode.trim().toUpperCase() }, include: bookingInclude });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? 'PASAJE';
  const serialized = serializeBooking(booking);

  if (type === 'FACTURA') {
    const payment = booking.payments.find((p) => p.status === 'APPROVED') ?? booking.payments[0];
    if (!payment) throw ApiError.notFound('La reserva no tiene pagos aprobados');
    const pdf = buildFacturaPdf({
      bookingCode: serialized.bookingCode,
      status: serialized.status,
      cabinClass: serialized.cabinClass,
      passengersCount: serialized.passengersCount,
      totalAmount: serialized.totalAmount,
      currency: serialized.currency,
      payment: {
        method: payment.method,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        paidAt: payment.paidAt,
        installments: payment.installments,
        transactionRef: payment.transactionRef,
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="factura-${booking.bookingCode}.pdf"`,
      },
    });
  }

  const pdf = buildPasajePdf({
    bookingCode: serialized.bookingCode,
    status: serialized.status,
    tripType: serialized.tripType,
    cabinClass: serialized.cabinClass,
    passengersCount: serialized.passengersCount,
    totalAmount: serialized.totalAmount,
    currency: serialized.currency,
    createdAt: serialized.createdAt,
    flights: serialized.flights.map((flight) => ({
      flightCode: flight.flight.code,
      origin: flight.flight.route.originAirport,
      destination: flight.flight.route.destinationAirport,
      departureAt: flight.flight.departureAt,
      arrivalAt: flight.flight.arrivalAt,
      status: flight.flight.status,
      isReturn: flight.isReturn,
      price: flight.price,
      fare: { name: flight.fare.name, cabinClass: flight.fare.cabinClass },
    })),
    passengers: serialized.passengers.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      documentType: p.documentType,
      documentNumber: p.documentNumber,
      seatNumber: p.seat ? `${p.seat.rowNumber}${p.seat.columnLetter}` : null,
      checkInStatus: p.checkInStatus,
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="pasaje-${booking.bookingCode}.pdf"`,
    },
  });
});
