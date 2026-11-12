import { handler } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { executeMyBookingsList } from '@/lib/my-bookings';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/pasajeros/mis-reservas
 *
 * US-15 v2.0: historial completo de reservas del pasajero registrado, asociadas
 * por `userId` o por el email de contacto de una reserva hecha como invitado.
 * Protegido por sesion (JWT de Clerk); el middleware ya lo trata como privado.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  return executeMyBookingsList(prisma, { id: user.id, email: user.email });
});
