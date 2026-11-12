import { handler, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { mobileErrorResponse, parseMobileBody } from '@/lib/mobile/http';
import { payOwnedMobileBooking } from '@/lib/mobile/payment';
import { withSerializationRetry } from '@/lib/mobile/retry';
import { settlePayment } from '@/lib/payment-service';
import { prisma } from '@/lib/prisma';
import { releaseExpiredSeatLocks } from '@/lib/seat-locks';
import { mobilePaymentSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/mobile/pago
 *
 * Pago simulado de una reserva propia. El codigo de reserva viene en el body
 * y los datos de tarjeta nunca se persisten. Reutiliza `settlePayment`, que ya
 * evita aprobar dos veces la misma reserva.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseMobileBody(req, mobilePaymentSchema);

  let result;
  try {
    result = await withSerializationRetry(() =>
      payOwnedMobileBooking(user, body, {
        db: prisma,
        releaseExpiredSeatLocks: (bookingCode) =>
          releaseExpiredSeatLocks(undefined, bookingCode),
        settlePayment: (bookingCode, currentUser, input) =>
          prisma.$transaction(
            (tx) => settlePayment(tx, bookingCode, currentUser, input),
            { timeout: 60000, maxWait: 15000 },
          ),
      }),
    );
  } catch (err) {
    const response = mobileErrorResponse(err);
    if (response) return response;
    throw err;
  }

  if (!result.reused) {
    await audit({
      userId: user.id,
      action: 'PAYMENT',
      entity: 'Payment',
      entityId: result.payment.id,
      metadata: {
        source: 'mobile',
        bookingCode: body.bookingCode,
        status: result.payment.status,
        simulated: true,
      },
    });
  }

  return ok({
    payment: { ...result.payment, amount: Number(result.payment.amount) },
    reused: result.reused,
    email: result.email,
  });
});
