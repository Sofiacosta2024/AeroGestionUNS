import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { actualizarRespuestaPasajero } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ bookingCode: string }> };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { bookingCode } = await ctx.params;
  const body = await req.json();

  const respuesta = body.respuesta as 'PENDIENTE' | 'ACEPTA' | 'RECHAZA';
  const result = await actualizarRespuestaPasajero({
    bookingIdOrCode: bookingCode,
    respuesta,
    userId: user.id,
  });

  return ok(result);
});
