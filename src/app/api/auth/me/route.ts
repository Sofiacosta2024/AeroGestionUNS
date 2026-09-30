import { handler, ok } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me -> sesion actual (o null).
 * Es el endpoint que usa el frontend para "recordar sesion".
 */
export const GET = handler(async () => {
  const user = await getCurrentUser();
  return ok({ user, authenticated: !!user });
});
