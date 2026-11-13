import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { cancelarReservaContingencia } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ codigo: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { codigo } = await ctx.params;

  const result = await cancelarReservaContingencia({
    bookingIdOrCode: codigo,
    userId: user.id,
    origin: new URL(req.url).origin,
  });

  return ok(result);
});
