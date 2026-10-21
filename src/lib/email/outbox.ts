import { Prisma } from '@prisma/client';
import type { BookingForDocuments } from '../bookings';
import { toTravelDocuments } from '../travel-documents';
import { receiptSnapshotSchema, type ReceiptSnapshot } from './types';

export function receiptSnapshot(booking: BookingForDocuments): ReceiptSnapshot {
  const payment = booking.payments.find(p => p.status === 'APPROVED');
  if (!payment) throw new Error('No hay pago aprobado para emitir comprobantes');
  return receiptSnapshotSchema.parse({
    version: 1, recipient: booking.contactEmail, greetingName: booking.passengers[0]?.firstName ?? 'Pasajero',
    displayCode: booking.bookingCode.replace(/^AG-/, ''),
    purchasedAt: (payment.paidAt ?? payment.createdAt).toISOString(), documents: toTravelDocuments(booking),
  });
}
export async function enqueueReceipt(tx: Prisma.TransactionClient, input: {
  paymentId: string; bookingId: string; dedupeKey: string; recipient: string; snapshot: ReceiptSnapshot;
}): Promise<{ dispatchId: string }> {
  const snapshot = receiptSnapshotSchema.parse(input.snapshot);
  if (snapshot.recipient !== input.recipient) throw new Error('El destinatario no coincide con el comprobante');
  const dispatch = await tx.emailDispatch.upsert({
    where: { dedupeKey: input.dedupeKey }, update: {},
    create: { ...input, snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
  return { dispatchId: dispatch.id };
}
