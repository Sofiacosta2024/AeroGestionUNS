import { handler } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { executePublicBookingLookup } from '@/lib/public-booking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reservas/consulta
 *
 * Consulta publica (sin sesion) de una reserva por codigo + apellido de un
 * pasajero. Ver `src/lib/public-booking.ts`.
 */
export const POST = handler((req: Request) => executePublicBookingLookup(req, prisma));
