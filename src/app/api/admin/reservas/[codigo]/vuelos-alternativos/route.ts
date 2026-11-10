import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { getVuelosAlternativosParaReserva } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ codigo: string }> };

export const GET = handler(async (req: Request, ctx: Ctx) => {
  await requireRole(UserRole.ADMIN);
  const { codigo } = await ctx.params;
  const url = new URL(req.url);
  const filterDate = url.searchParams.get('date') || undefined;

  const result = await getVuelosAlternativosParaReserva(codigo, filterDate);
  return ok(result);
});
