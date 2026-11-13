import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { bookingCancellationSnapshotSchema, cancellationSnapshotSchema } from './cancellation-snapshot';
import { itinerarySnapshotSchema } from './itinerary-snapshot';
import { DeliveryError, sendBookingCancellationEmail, sendCancellationEmail, sendItineraryEmail, sendReceiptEmail } from './provider';
import { receiptSnapshotSchema } from './types';

export const RETRY_DELAYS_MS = [5000, 15000, 30000] as const;
export const MAX_EMAIL_ATTEMPTS = 4;
type Options = {
  db?: PrismaClient; now?: () => Date; send?: typeof sendReceiptEmail; sendItinerary?: typeof sendItineraryEmail; recipient?: string;
  sendCancellation?: typeof sendCancellationEmail;
  sendBookingCancellation?: typeof sendBookingCancellationEmail;
};

export async function processReceiptDispatch(dispatchId: string, options: Options = {}) {
  const db = options.db ?? prisma;
  const now = options.now ?? (() => new Date());
  const leaseToken = randomUUID();
  const dispatch = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM email_dispatches WHERE id = ${dispatchId} FOR UPDATE`;
    const row = await tx.emailDispatch.findUnique({ where: { id: dispatchId } });
    if (options.recipient && row?.recipient !== options.recipient) return null;
    const at = now();
    if (!row || row.status !== 'PENDIENTE' || row.nextAttemptAt > at || (row.leaseUntil && row.leaseUntil > at)) return null;
    if (row.attempts >= MAX_EMAIL_ATTEMPTS) {
      await tx.emailDispatch.update({ where: { id: row.id }, data: { status: 'FALLIDO', leaseUntil: null, leaseToken: null, lastError: 'Se agotó el presupuesto de intentos' } });
      return null;
    }
    const claimed = await tx.emailDispatch.update({ where: { id: row.id }, data: {
      attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(at.getTime() + 90000),
    } });
    await tx.emailDispatchAttempt.create({ data: { dispatchId, attempt: claimed.attempts, startedAt: at } });
    return claimed;
  });
  if (!dispatch) return;
  try {
    let sent: { providerMessageId: string };
    if (dispatch.kind === 'FLIGHT_CANCELLED') {
      const parsed = cancellationSnapshotSchema.safeParse(dispatch.snapshot);
      if (!parsed.success) throw new DeliveryError('Los datos del aviso de cancelación no son válidos', false);
      sent = await (options.sendCancellation ?? sendCancellationEmail)(parsed.data, `cancel-${dispatch.id}`);
    } else if (dispatch.kind === 'BOOKING_CANCELLED') {
      const parsed = bookingCancellationSnapshotSchema.safeParse(dispatch.snapshot);
      if (!parsed.success) throw new DeliveryError('Los datos de la reserva cancelada no son válidos', false);
      sent = await (options.sendBookingCancellation ?? sendBookingCancellationEmail)(parsed.data, `booking-cancelled-${dispatch.id}`);
    } else if (dispatch.kind === 'ITINERARY_CHANGE') {
      const parsed = itinerarySnapshotSchema.safeParse(dispatch.snapshot);
      if (!parsed.success) throw new DeliveryError('Los datos del aviso de reprogramación no son válidos', false);
      sent = await (options.sendItinerary ?? sendItineraryEmail)(parsed.data, `itinerary-${dispatch.id}`);
    } else {
      const parsed = receiptSnapshotSchema.safeParse(dispatch.snapshot);
      if (!parsed.success) throw new DeliveryError('Los datos del comprobante no son válidos', false);
      sent = await (options.send ?? sendReceiptEmail)(parsed.data, `receipt-${dispatch.id}`);
    }
    await db.$transaction(async tx => {
      const claimed = await tx.emailDispatch.updateMany({ where: { id: dispatchId, leaseToken }, data: {
        status: 'ENVIADO', acceptedAt: now(), providerMessageId: sent.providerMessageId, leaseUntil: null, leaseToken: null, lastError: null,
      } });
      if (claimed.count) await tx.emailDispatchAttempt.update({ where: { dispatchId_attempt: { dispatchId, attempt: dispatch.attempts } }, data: { finishedAt: now() } });
    });
  } catch (error) {
    const known = error instanceof DeliveryError;
    // Fallos de persistencia tras aceptación también se recuperan con la misma clave del proveedor.
    const retryable = !known || error.retryable;
    const retry = retryable && dispatch.attempts < MAX_EMAIL_ATTEMPTS;
    const delay = Math.max(RETRY_DELAYS_MS[dispatch.attempts - 1] ?? 0, known ? error.retryAfterMs : 0);
    const message = known ? error.message : 'No se pudo completar el despacho';
    await db.$transaction(async tx => {
      const claimed = await tx.emailDispatch.updateMany({ where: { id: dispatchId, leaseToken }, data: {
        status: retry ? 'PENDIENTE' : 'FALLIDO', nextAttemptAt: new Date(now().getTime() + delay),
        leaseUntil: null, leaseToken: null, lastError: message.slice(0, 255),
      } });
      if (claimed.count) await tx.emailDispatchAttempt.update({ where: { dispatchId_attempt: { dispatchId, attempt: dispatch.attempts } }, data: { finishedAt: now(), error: message.slice(0, 255) } });
    });
  }
}
