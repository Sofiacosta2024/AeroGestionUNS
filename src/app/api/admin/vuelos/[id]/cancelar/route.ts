import { UserRole } from '@prisma/client';
import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { cancelarVuelo, getCancelacionInfo, type MotivoCancelacion } from '@/lib/contingencias';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const cancelSchema = z.object({
  reason: z.enum(['Clima', 'Mantenimiento', 'Operativo'] as const, {
    errorMap: () => ({ message: 'El motivo debe ser Clima, Mantenimiento u Operativo' }),
  }),
});

/**
 * GET /api/admin/vuelos/:id/cancelar
 * Obtiene el resumen de pasajes y pasajeros afectados para el modal de confirmación.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const info = await getCancelacionInfo(id);
  return ok(info);
});

/**
 * POST /api/admin/vuelos/:id/cancelar
 * US-12A: Cancelación lógica de vuelo y retiro comercial.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const body = await parseBody(req, cancelSchema);

  const result = await cancelarVuelo(id, body.reason as MotivoCancelacion, user.id);
  return ok(result);
});
