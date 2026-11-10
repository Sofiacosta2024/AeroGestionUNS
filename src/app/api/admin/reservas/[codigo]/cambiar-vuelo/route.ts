import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { cambiarVueloReserva } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ codigo: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { codigo } = await ctx.params;
  const body = await req.json();

  const newFlightId = body.newFlightId as string;
  const result = await cambiarVueloReserva({
    bookingIdOrCode: codigo,
    newFlightId,
    userId: user.id,
  });

  return ok(result);
});
