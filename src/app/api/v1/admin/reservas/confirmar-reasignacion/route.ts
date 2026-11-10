import { UserRole } from '@prisma/client';
import { handler, ok } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { confirmarPendientesSinRespuesta, confirmarReasignacion } from '@/lib/contingencias';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.ADMIN);
  const body = await req.json();

  if (body.mode === 'pending_no_response' && body.flightId) {
    const result = await confirmarPendientesSinRespuesta(body.flightId, user.id);
    return ok(result);
  }

  const bookingIds = body.bookingIds as string[];
  const result = await confirmarReasignacion({
    bookingIds,
    userId: user.id,
  });

  return ok(result);
});
