import { Prisma } from "@prisma/client";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { bookingInclude, canViewBookingPii } from "@/lib/bookings";
import { enqueueReceipt, receiptSnapshot } from "@/lib/email/outbox";
import { queuedEmail } from "@/lib/email/types";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ code: string }> };
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  // Bloqueo + registro durable limitan reenvíos concurrentes a uno por minuto.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM bookings WHERE booking_code = ${code.toUpperCase()} FOR UPDATE`,
    );
    const booking = await tx.booking.findUnique({
      where: { bookingCode: code.toUpperCase() },
      include: bookingInclude,
    });
    if (!booking) throw ApiError.notFound("Reserva no encontrada");
    if (!canViewBookingPii(user, booking)) throw ApiError.forbidden();
    const payment = booking.payments.find((p) => p.status === "APPROVED");
    if (!payment || booking.status === "CANCELLED")
      throw ApiError.conflict("No hay un pago aprobado para reenviar");
    const last = await tx.auditLog.findFirst({
      where: {
        entity: "Payment",
        entityId: payment.id,
        action: "PAYMENT_EMAIL_REQUEST",
      },
      orderBy: { createdAt: "desc" },
    });
    if (last && Date.now() - last.createdAt.getTime() < 60000)
      throw ApiError.conflict("Esperá un minuto antes de volver a reenviar");
    const attempt = await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "PAYMENT_EMAIL_REQUEST",
        entity: "Payment",
        entityId: payment.id,
      },
    });
    return enqueueReceipt(tx, { bookingId: booking.id, paymentId: payment.id,
      dedupeKey: `payment-${payment.id}-resend-${attempt.id}`, recipient: booking.contactEmail,
      snapshot: receiptSnapshot(booking) });
  }, { timeout: 60000, maxWait: 15000 });
  return ok({ email: queuedEmail(result.dispatchId) }, 202);
});
