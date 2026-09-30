import { BookingStatus, UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManage, getCurrentUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { paymentSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** GET /api/bookings/:code/payments */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const booking = await loadBooking(code);
  await assertCanAccess(booking);

  const data = await prisma.payment.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: 'asc' },
  });

  return ok({ data: data.map((p) => ({ ...p, amount: Number(p.amount) })) });
});

/**
 * POST /api/bookings/:code/payments  (paso 3 del flujo)
 *
 * Si el pago se aprueba, la reserva pasa a PAID. Nunca se almacenan datos de
 * tarjeta: solo el `transactionRef` devuelto por el gateway.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.PASAJERO);
  const body = await parseBody(req, paymentSchema);

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true, status: true, totalAmount: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  await assertCanAccess(booking);

  if (booking.status === BookingStatus.CANCELLED) {
    throw ApiError.conflict('No se puede pagar una reserva cancelada');
  }

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        bookingId: booking.id,
        method: body.method,
        amount: body.amount ?? booking.totalAmount,
        currency: body.currency,
        status: body.status,
        transactionRef: body.transactionRef ?? null,
        installments: body.installments ?? null,
        paidAt: body.status === 'APPROVED' ? new Date() : null,
      },
    });

    if (body.status === 'APPROVED') {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.PAID },
      });
    }

    return p;
  });

  await audit({
    userId: user.id,
    action: 'PAYMENT',
    entity: 'Payment',
    entityId: payment.id,
    metadata: {
      bookingCode: booking.bookingCode,
      method: payment.method,
      status: payment.status,
    },
  });

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true },
  });

  return created({
    payment: { ...payment, amount: Number(payment.amount) },
    bookingStatus: updated.status,
  });
});

// --- helpers ---------------------------------------------------------------

async function loadBooking(code: string) {
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true, status: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  return booking;
}

async function assertCanAccess(booking: { userId: string | null; bookingCode: string }) {
  const user = await getCurrentUser();
  if (canManage(user)) return;
  if (user && booking.userId === user.id) return;
  throw ApiError.forbidden('No tiene permisos para esta reserva');
}
