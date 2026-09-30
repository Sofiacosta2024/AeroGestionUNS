import { ApiError, handler, ok, parseBody } from '@/lib/api';
import { createSession, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, loginSchema);

  // El login acepta correo O legajo operativo (etiqueta "Legajo / Usuario Operativo"
  // que cambia segun el perfil elegido en la UI).
  const identifier = body.email.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier.toLowerCase() }, { legajo: identifier }],
    },
  });

  // Mensaje generico a proposito: no revelamos si el usuario existe.
  const invalid = ApiError.unauthorized('Credenciales invalidas');

  if (!user) {
    // bcrypt dummy para que el tiempo de respuesta no delate si el usuario existe.
    await verifyPassword(
      body.password,
      '$2a$12$0000000000000000000000000000000000000000000000000000uO',
    );
    throw invalid;
  }

  if (!(await verifyPassword(body.password, user.passwordHash))) throw invalid;

  if (!user.isActive) {
    throw ApiError.forbidden('El usuario esta desactivado. Contacte al administrador.');
  }

  // Si eligio un perfil en la UI, tiene que coincidir con su rol real.
  if (body.role && body.role !== user.role) {
    throw ApiError.forbidden(`Las credenciales corresponden al perfil ${user.role}, no a ${body.role}`);
  }

  await createSession(user.id, body.remember);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

  return ok({
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
