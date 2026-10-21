import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { canViewBookingPii } from "@/lib/bookings";
import { settlePayment } from "@/lib/payment-service";
import { prisma } from "@/lib/prisma";
import { paymentSchema } from "@/lib/validation";
import { releaseExpiredSeatLocks } from "@/lib/seat-locks";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ code: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    include: { payments: true },
  });
  if (!booking) throw ApiError.notFound("Reserva no encontrada");
  if (!canViewBookingPii(user, booking)) throw ApiError.forbidden();
  return ok({
    data: booking.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  });
});

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const body = await parseBody(req, paymentSchema);
  await releaseExpiredSeatLocks(undefined, code.toUpperCase());
  const result = await prisma.$transaction(async (tx) => {
    return settlePayment(tx, code, user, body);
  }, { timeout: 60000, maxWait: 15000 });
  if (!result.reused)
    await audit({
      userId: user.id,
      action: "PAYMENT",
      entity: "Payment",
      entityId: result.payment.id,
      metadata: {
        bookingCode: code.toUpperCase(),
        status: result.payment.status,
        simulated: true,
      },
    });
  return ok({
    payment: { ...result.payment, amount: Number(result.payment.amount) },
    reused: result.reused,
    email: result.email,
  });
});
