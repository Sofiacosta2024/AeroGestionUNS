import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../api';
import type { AuthUser } from '../auth';
import { comprobanteInclude } from '../bookings';
import { emitirComprobantes } from '../comprobante-emission';
import { enqueueReceipt, receiptSnapshot } from '../email/outbox';
import { queuedEmail } from '../email/types';
import { BOOKABLE_STATUSES } from '../flights';
import { seatSelectionUnitFee } from '../seat-pricing';
import { prisma } from '../prisma';
import { lockSeatsAtomic, releaseExpiredSeatLocks } from '../seat-locks';
import type { CounterQuoteInput, CounterSaleInput, CounterSaleResult } from './types';
import { counterSaleSchema } from './validation';

export const COUNTER_SEAT_CONFLICT = 'El asiento seleccionado acaba de ser reservado desde la web. Por favor elija otra ubicación.';
function requireOperator(user: AuthUser) {
  if (user.role !== 'MOSTRADOR' && user.role !== 'ADMIN') throw ApiError.forbidden();
}
type QuoteDb = Pick<Prisma.TransactionClient, 'flightFare'>;
export async function quoteCounterSale(input: CounterQuoteInput, user: AuthUser, db: QuoteDb = prisma, checkCapacity = true) {
  requireOperator(user);
  const offer = await db.flightFare.findUnique({
    where: { flightId_fareId: { flightId: input.flightId, fareId: input.fareId } },
    include: { fare: true, flight: true },
  });
  if (!offer || !offer.fare.isActive) throw ApiError.notFound('Tarifa no disponible');
  if (!BOOKABLE_STATUSES.includes(offer.flight.status) || offer.flight.departureAt <= new Date())
    throw ApiError.conflict('El vuelo ya no está disponible para la venta');
  if (checkCapacity && offer.availableSeats < input.passengersCount) throw ApiError.conflict('No hay cupos suficientes en esta clase');
  const base = new Prisma.Decimal(offer.price).mul(input.passengersCount);
  const surcharge = new Prisma.Decimal(seatSelectionUnitFee(offer.fare, input.seatMode)).mul(input.passengersCount);
  return { baseAmount: base.toFixed(2), seatSelectionAmount: surcharge.toFixed(2),
    totalAmount: base.add(surcharge).toFixed(2), currency: offer.currency, cabinClass: offer.fare.cabinClass,
    aircraftId: offer.flight.aircraftId, selectionIncluded: seatSelectionUnitFee(offer.fare) === 0 };
}

/** Una sola transacción decide cupo, asiento, pago, comprobantes y outbox. */
export async function createCounterSale(raw: CounterSaleInput, user: AuthUser, db: PrismaClient = prisma): Promise<CounterSaleResult> {
  requireOperator(user);
  const input = counterSaleSchema.parse(raw);
  const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        // Serializa reintentos del mismo request sin depender de procesos Node compartidos.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId}, 0))`;
        const existing = await tx.counterSale.findUnique({ where: { requestId: input.requestId },
          include: { booking: true, payment: true } });
        if (existing) {
          if (existing.operatorId !== user.id || existing.payloadHash !== payloadHash)
            throw ApiError.conflict('La clave de venta ya se utilizó para otra solicitud');
          const dispatch = await tx.emailDispatch.findUniqueOrThrow({ where: { dedupeKey: `payment-${existing.paymentId}` } });
          return { bookingCode: existing.booking.bookingCode, displayCode: existing.booking.bookingCode.replace(/^AG-/, ''),
            paymentId: existing.paymentId, totalAmount: existing.payment.amount.toFixed(2), currency: existing.payment.currency,
            email: queuedEmail(dispatch.id), reused: true };
        }
        await releaseExpiredSeatLocks(tx);
        const quote = await quoteCounterSale({ ...input, passengersCount: input.passengers.length }, user, tx, false);
        if (!new Prisma.Decimal(input.quotedTotal).eq(quote.totalAmount))
          throw ApiError.conflict('La tarifa cambió. Actualice la cotización y confirme el nuevo total.', { totalAmount: quote.totalAmount });
        let seatIds = input.passengers.map(p => p.seatId!);
        if (input.seatMode === 'AUTO') {
          const candidates = await tx.seat.findMany({
            where: { aircraftId: quote.aircraftId, cabinClass: quote.cabinClass,
              seatLocks: { none: { flightId: input.flightId, expiresAt: { gt: new Date() },
                booking: { status: { in: ['PENDING', 'CONFIRMED', 'PAID'] } } } },
              bookingPassengers: { none: { booking: { flights: { some: { flightId: input.flightId } }, status: { in: ['PAID', 'CONFIRMED'] } } } },
            }, orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }], take: input.passengers.length,
          });
          seatIds = candidates.map(s => s.id);
          if (seatIds.length !== input.passengers.length) throw ApiError.conflict('No hay asientos libres suficientes en esta clase');
        }
        const locked = await lockSeatsAtomic({ flightId: input.flightId, fareId: input.fareId, seatIds,
          seatMode: input.seatMode, quotedTotal: Number(input.quotedTotal),
          contactEmail: input.contactEmail, contactPhone: input.contactPhone, userId: null,
          passengers: input.passengers.map(p => ({ ...p, documentType: 'DNI' as const })),
        }, tx);
        await tx.booking.update({ where: { id: locked.bookingId }, data: { status: 'PAID', expiresAt: null, totalAmount: quote.totalAmount } });
        await tx.bookingFlight.updateMany({ where: { bookingId: locked.bookingId }, data: {
          seatSelectionAmount: quote.seatSelectionAmount,
          seatSelectionIncluded: input.seatMode === 'MANUAL' || quote.selectionIncluded,
        } });
        await tx.seatLock.deleteMany({ where: { bookingId: locked.bookingId } });
        const payment = await tx.payment.create({ data: { bookingId: locked.bookingId, method: input.paymentMethod,
          amount: quote.totalAmount, currency: quote.currency, status: 'APPROVED',
          transactionRef: `COUNTER-${input.requestId}`, paidAt: new Date() } });
        await tx.counterSale.create({ data: { requestId: input.requestId, payloadHash, operatorId: user.id,
          branchName: (process.env.MOSTRADOR_BRANCH_NAME || 'Bahía Blanca').slice(0, 120), bookingId: locked.bookingId, paymentId: payment.id } });
        await emitirComprobantes(tx, payment, locked.bookingId);
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: locked.bookingId }, include: comprobanteInclude });
        const { dispatchId } = await enqueueReceipt(tx, { bookingId: booking.id, paymentId: payment.id,
          dedupeKey: `payment-${payment.id}`, recipient: input.contactEmail, snapshot: receiptSnapshot(booking) });
        await tx.auditLog.create({ data: { userId: user.id, action: 'COUNTER_SALE', entity: 'Booking', entityId: booking.id,
          metadata: { paymentId: payment.id, method: input.paymentMethod, branch: process.env.MOSTRADOR_BRANCH_NAME || 'Bahía Blanca' } } });
        return { bookingCode: booking.bookingCode, displayCode: booking.bookingCode.replace(/^AG-/, ''),
          paymentId: payment.id, totalAmount: quote.totalAmount, currency: quote.currency, email: queuedEmail(dispatchId), reused: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')) {
        if (attempt < 2) continue; // Reintentar la transacción completa, nunca la conexión abortada.
        throw ApiError.conflict(input.seatMode === 'MANUAL' ? COUNTER_SEAT_CONFLICT : 'La disponibilidad cambió. Vuelva a intentar.');
      }
      if (error instanceof ApiError && error.message === 'Asiento no disponible') {
        if (input.seatMode === 'AUTO' && attempt < 2) continue;
        throw ApiError.conflict(COUNTER_SEAT_CONFLICT);
      }
      throw error;
    }
  }
  throw ApiError.conflict('No se pudo confirmar la venta. Vuelva a intentar.');
}
