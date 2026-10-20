import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { audit, auditFrom } from '@/lib/audit';
import { executePassengerIdentUpdate } from '@/lib/admin-reservas';
import { bookingPassengerIdentUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string; passengerId: string }> };

/**
 * US-14C: modificacion de los datos de identificacion de un pasajero de la reserva
 * desde la consola admin/mostrador. `passengerId` es el id del registro concreto
 * dentro de la reserva (BookingPassenger), no el registro maestro.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { bookingCode, passengerId } = await ctx.params;
  const data = await parseBody(req, bookingPassengerIdentUpdateSchema);

  const result = await executePassengerIdentUpdate(prisma, {
    bookingCode,
    bookingPassengerId: passengerId,
    data,
  });

  await audit({
    ...auditFrom(user),
    action: 'PASSENGER_IDENT_UPDATED',
    entity: 'Booking',
    entityId: result.bookingId,
    metadata: {
      bookingCode: result.bookingCode,
      passengerId: result.passengerId,
      before: result.before,
      after: result.after,
    },
  });

  return ok(result.after);
});
