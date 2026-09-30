import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { ApiError, created, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * ACCESO DEMO (solo para desarrollo / demostraciones)
 *
 * Entra con la sesion del usuario de ejemplo del perfil elegido SIN pedir
 * contrasena. La contrasena nunca viaja al cliente: la sesion se crea aca.
 *
 * Se desactiva con `DEMO_MODE=false` (obligatorio en produccion). El boton de la
 * UI consulta `GET /api/auth/demo` y solo se dibuja si esta habilitado, asi que
 * en produccion desaparece por si solo.
 */
const DEMO_MODE_ENABLED = process.env.DEMO_MODE !== 'false';

/** Mismos correos que crea `prisma/seed.ts`. */
const DEMO_USER_BY_ROLE: Record<UserRole, string> = {
  [UserRole.PASAJERO]: 'pasajero@uns.edu.ar',
  [UserRole.MOSTRADOR]: 'mostrador@uns.edu.ar',
  [UserRole.ADMIN]: 'admin@uns.edu.ar',
};

const demoSchema = z.object({
  role: z.nativeEnum(UserRole).default(UserRole.PASAJERO),
  remember: z.boolean().optional().default(true),
});

/** GET /api/auth/demo — la UI lo usa para decidir si dibujar el boton. */
export const GET = handler(async () => ok({ enabled: DEMO_MODE_ENABLED }));

/** POST /api/auth/demo — abre sesion con el usuario de ejemplo del perfil. */
export const POST = handler(async (req: Request) => {
  if (!DEMO_MODE_ENABLED) {
    throw ApiError.notFound('El acceso demo esta desactivado (DEMO_MODE=false)');
  }

  const { role, remember } = await parseBody(req, demoSchema);

  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_BY_ROLE[role] },
  });

  if (!user || !user.isActive) {
    throw ApiError.notFound(
      'No existe el usuario de ejemplo para ese perfil. Ejecute `npm run db:seed`.',
    );
  }

  await createSession(user.id, remember);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    userId: user.id,
    action: 'LOGIN_DEMO',
    entity: 'User',
    entityId: user.id,
    metadata: { role },
  });

  return created({
    demo: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      legajo: user.legajo,
    },
  });
});
