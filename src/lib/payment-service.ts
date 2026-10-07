import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AuthUser } from './auth';
import { ApiError } from './api';
import { bookingInclude, canViewBookingPii } from './bookings';
import { mockPaymentStatus } from './mock-payment';
import type { paymentSchema } from './validation';

/** Se ejecuta dentro de una transacción; el bloqueo evita aprobaciones duplicadas. */
export async function settlePayment(
  tx: Prisma.TransactionClient,
  code: string,
  user: AuthUser,
  body: z.infer<typeof paymentSchema>,
) {
  // Serializa cobros y cancelaciones sobre la misma reserva, incluso en procesos distintos.
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM bookings WHERE booking_code = ${code.toUpperCase()} FOR UPDATE`,
  );
  const booking = await tx.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: bookingInclude,
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  if (!canViewBookingPii(user, booking)) throw ApiError.forbidden();
  if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW')
    throw ApiError.conflict('Esta reserva no admite pagos');
  const existing = booking.payments.find((p) => p.status === 'APPROVED');
  if (existing) return { payment: existing, reused: true, booking };
  if (!['PENDING', 'CONFIRMED'].includes(booking.status))
    throw ApiError.conflict('Esta reserva no admite pagos');
  if (booking.passengers.length !== booking.passengersCount)
    throw ApiError.conflict(
      'Completá los datos de todos los pasajeros antes de pagar',
    );
  if (Number(booking.totalAmount) <= 0)
    throw ApiError.conflict('La reserva no tiene un importe válido');
  const status = mockPaymentStatus(body.cardNumber);
  const payment = await tx.payment.create({
    data: {
      bookingId: booking.id,
      method: 'CREDIT_CARD',
      amount: booking.totalAmount,
      currency: booking.currency,
      status,
      transactionRef: `MOCK-${randomUUID()}`,
      installments: body.installments,
      paidAt: status === 'APPROVED' ? new Date() : null,
    },
  });
  // PAN, CVV, vencimiento y titular no se persisten ni se escriben en logs.
  if (status === 'APPROVED')
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'PAID', contactEmail: body.contactEmail },
    });
  return {
    payment,
    reused: false,
    booking: {
      ...booking,
      contactEmail:
        status === 'APPROVED' ? body.contactEmail : booking.contactEmail,
      payments: [...booking.payments, payment],
    },
  };
}
