import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { parseMobileBody } from '@/lib/mobile/http';
import { prisma } from '@/lib/prisma';
import { mobilePushTokenDeleteSchema, mobilePushTokenSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Registra el token Expo del dispositivo actual para la cuenta autenticada. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseMobileBody(req, mobilePushTokenSchema);
  const registeredAt = new Date();

  await prisma.pushDevice.upsert({
    where: { pushToken: body.pushToken },
    create: {
      pushToken: body.pushToken,
      deviceType: body.platform.toUpperCase(),
      userId: user.id,
      isActive: true,
      lastSeenAt: registeredAt,
    },
    update: {
      deviceType: body.platform.toUpperCase(),
      userId: user.id,
      isActive: true,
      lastSeenAt: registeredAt,
    },
  });

  return ok({ registered: true });
});

/** Elimina el vínculo del dispositivo al cerrar sesión o desactivar los avisos. */
export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseMobileBody(req, mobilePushTokenDeleteSchema);

  await prisma.pushDevice.updateMany({
    where: { pushToken: body.pushToken, userId: user.id },
    data: { isActive: false, lastSeenAt: new Date() },
  });
  return ok({ registered: false });
});
