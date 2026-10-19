import type { PrismaClient } from '@prisma/client';

/** Cliente Prisma o cliente de transaccion: solo se usa el delegate de comprobantes. */
type Db = Pick<PrismaClient, 'comprobante'>;

/**
 * Registra la emision de los comprobantes de una reserva paga (RF-05).
 *
 * Idempotente: se apoya en el unique (bookingId, tipo), asi que se puede volver
 * a llamar sin duplicar filas (reintento del pago, backfill, etc.).
 */
export async function emitirComprobantes(
  db: Db,
  payment: { id: string; transactionRef: string | null },
  bookingId: string,
) {
  for (const tipo of ['PASAJE', 'FACTURA'] as const)
    await db.comprobante.upsert({
      where: { bookingId_tipo: { bookingId, tipo } },
      create: {
        bookingId,
        paymentId: payment.id,
        tipo,
        transactionRef: payment.transactionRef,
      },
      update: {},
    });
}
