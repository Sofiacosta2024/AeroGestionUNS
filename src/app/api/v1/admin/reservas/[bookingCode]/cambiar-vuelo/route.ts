import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { cambiarVueloReserva } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { bookingCode } = await ctx.params;
  const body = await req.json();

  const newFlightId = body.newFlightId as string;
  const result = await cambiarVueloReserva({
    bookingIdOrCode: bookingCode,
    newFlightId,
    userId: user.id,
    origin: new URL(req.url).origin,
  });

  return ok(result);
});
