import { UserRole } from '@prisma/client';
import { handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { discardDraft, getSchedule, updateDraft } from '@/lib/scheduling/service';
import { serializeSchedule } from '@/lib/scheduling/serializers';
import { flightScheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/flight-schedules/:id */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  return ok(serializeSchedule(await getSchedule(id)));
});

/** PUT /api/flight-schedules/:id — reemplaza los datos de un borrador (vuelve a validar). */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const input = await parseBody(req, flightScheduleSchema);

  const schedule = await updateDraft(id, input);

  await audit({ userId: user.id, action: 'UPDATE', entity: 'FlightSchedule', entityId: id });
  return ok(serializeSchedule(schedule));
});

/** DELETE /api/flight-schedules/:id — descarta un borrador. Los publicados no se borran. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  await discardDraft(id);

  await audit({ userId: user.id, action: 'DELETE', entity: 'FlightSchedule', entityId: id });
  return noContent();
});
