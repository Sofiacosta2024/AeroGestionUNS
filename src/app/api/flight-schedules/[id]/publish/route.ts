import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { publishDraft } from '@/lib/scheduling/service';
import { serializeSchedule } from '@/lib/scheduling/serializers';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/flight-schedules/:id/publish
 *
 * Publica un borrador: genera sus vuelos con codigo AG-####, precios y asientos por clase.
 * Si mientras tanto otro vuelo ocupo la franja, responde 409 con las fechas en conflicto.
 */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  const schedule = await publishDraft(id);

  await audit({
    userId: user.id,
    action: 'PUBLISH',
    entity: 'FlightSchedule',
    entityId: id,
    metadata: { flights: schedule._count.flights },
  });

  return ok(serializeSchedule(schedule));
});
