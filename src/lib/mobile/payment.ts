import type { PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/api';
import type { AuthUser } from '@/lib/auth';
import type { settlePayment } from '@/lib/payment-service';
import type { MobilePaymentInput } from '@/lib/validation';

export const MOBILE_PAYMENT_NOT_FOUND = 'Reserva no encontrada';

type SettleResult = Awaited<ReturnType<typeof settlePayment>>;

export type MobilePaymentDeps = {
  db: Pick<PrismaClient, 'booking'>;
  releaseExpiredSeatLocks: (bookingCode: string) => Promise<unknown>;
  settlePayment: (
    bookingCode: string,
    user: AuthUser,
    body: MobilePaymentInput,
  ) => Promise<SettleResult>;
};

export async function payOwnedMobileBooking(
  user: AuthUser,
  body: MobilePaymentInput,
  deps: MobilePaymentDeps,
): Promise<SettleResult> {
  const booking = await deps.db.booking.findUnique({
    where: { bookingCode: body.bookingCode },
    select: { userId: true },
  });
  if (!booking || booking.userId !== user.id) {
    throw ApiError.notFound(MOBILE_PAYMENT_NOT_FOUND);
  }

  await deps.releaseExpiredSeatLocks(body.bookingCode);
  return deps.settlePayment(body.bookingCode, user, body);
}
