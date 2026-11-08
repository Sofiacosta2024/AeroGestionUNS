import type { Prisma } from '@prisma/client';
import type { ItinerarySnapshot } from './itinerary-snapshot';

export type ItineraryNotice = { bookingId: string; dedupeKey: string; snapshot: ItinerarySnapshot };

/**
 * Encola avisos de reprogramacion (US-06A) en la outbox de correos de la US-13, dentro de la
 * transaccion del cambio: si el cambio no se guarda, tampoco sale el aviso. El worker los manda
 * con el mismo ciclo de lease y reintentos que los comprobantes. Devuelve cuantos se encolaron.
 */
export async function enqueueItineraryChanges(tx: Prisma.TransactionClient, notices: readonly ItineraryNotice[]): Promise<number> {
  if (notices.length === 0) return 0;
  const { count } = await tx.emailDispatch.createMany({
    data: notices.map((n) => ({
      kind: 'ITINERARY_CHANGE' as const,
      dedupeKey: n.dedupeKey,
      bookingId: n.bookingId,
      recipient: n.snapshot.recipient,
      snapshot: n.snapshot as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
  return count;
}
