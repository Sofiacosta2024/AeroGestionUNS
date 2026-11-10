import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { generarPropuestas, getReservasAfectadas } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (_req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { id } = await ctx.params;

  await generarPropuestas(id, { onlySinAlternativa: true });
  const updatedData = await getReservasAfectadas(id);

  return ok(updatedData);
});
