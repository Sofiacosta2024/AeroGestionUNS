import { handler, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Avisos de vuelos aceptados por Expo para dispositivos de la cuenta actual. */
export const GET = handler(async () => {
  const user = await requireUser();
  const notifications = await prisma.deviceNotification.findMany({
    where: { device: { userId: user.id } },
    orderBy: { sentAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      message: true,
      type: true,
      flightCode: true,
      bookingCode: true,
      sentAt: true,
    },
  });

  return ok({ notifications });
});
