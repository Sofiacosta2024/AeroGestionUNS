import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { createSchedule, listSchedules } from '@/lib/scheduling/service';
import { serializeSchedule } from '@/lib/scheduling/serializers';
import { flightScheduleCreateSchema, scheduleListQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flight-schedules?status=DRAFT */
export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);
  const { page, pageSize, status } = parseQuery(req, scheduleListQuery);

  const { total, data } = await listSchedules({ status, page, pageSize });

  return ok({
    data: data.map(serializeSchedule),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});

/**
 * POST /api/flight-schedules
 *
 * Guarda un cronograma como borrador. Con `publish: true` lo guarda y publica en el
 * acto (genera los vuelos). Si choca con vuelos ya programados responde 409.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.ADMIN);
  const { publish, ...input } = await parseBody(req, flightScheduleCreateSchema);

  const schedule = await createSchedule(input, { createdById: user.id, publish });

  await audit({
    userId: user.id,
    action: publish ? 'PUBLISH' : 'CREATE',
    entity: 'FlightSchedule',
    entityId: schedule.id,
    metadata: { flights: schedule._count.flights },
  });

  return created(serializeSchedule(schedule));
});
