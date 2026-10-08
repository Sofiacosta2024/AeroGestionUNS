import { handler, ok } from '@/lib/api';
import { releaseExpiredSeatLocks } from '@/lib/seat-locks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/cleanup-expired
 * Libera de forma masiva los asientos y reservas vencidas a los 5 minutos (RF-03).
 */
export const POST = handler(async () => {
  const count = await releaseExpiredSeatLocks();
  return ok({
    releasedBookingsCount: count,
    message: count > 0 ? `Se liberaron ${count} reservas vencidas y sus asientos.` : 'No hay reservas vencidas pendientes.',
  });
});
