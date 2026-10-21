import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { getPasajerosAfectados } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/vuelos/:id/pasajeros-afectados
 * US-12B: Devuelve la lista de pasajeros afectados y vuelos alternativos sugeridos.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;
  const result = await getPasajerosAfectados(id);
  return ok(result);
});
