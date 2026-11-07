import { handler, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { parseMobileBody } from '@/lib/mobile/http';
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

  await releaseExpiredSeatLocks(undefined, body.bookingCode);

  const result = await prisma.$transaction(
    (tx) => settlePayment(tx, body.bookingCode, user, body),
    { timeout: 60000, maxWait: 15000 },
  );

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
