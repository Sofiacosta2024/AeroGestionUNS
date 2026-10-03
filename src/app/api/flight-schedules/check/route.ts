import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { checkSchedule } from '@/lib/scheduling/service';
import { flightScheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flight-schedules/check
 *
 * Chequeo en vivo para el formulario de alta: devuelve cuantos vuelos se generarian,
 * la hora de llegada calculada, la ocupacion por cabina y los conflictos. No guarda nada.
 */
export const POST = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);
  const input = await parseBody(req, flightScheduleSchema);
  return ok(await checkSchedule(input));
});
