import { handler, ok } from '@/lib/api';
import { destroySession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const user = await getCurrentUser();
  await destroySession();
  await audit({ userId: user?.id ?? null, action: 'LOGOUT', entity: 'User', entityId: user?.id ?? null });
  return ok({ message: 'Sesion cerrada' });
});
