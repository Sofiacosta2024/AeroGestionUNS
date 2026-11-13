import { randomUUID } from 'node:crypto';
import { BookingStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

type FlightPushKind = 'FLIGHT_RESCHEDULED' | 'FLIGHT_CANCELLED';

type ExpoPushTicket = {
  status?: 'ok' | 'error';
  details?: { error?: string };
};

/** Envía un aviso a los dispositivos Expo asociados a pasajeros con reserva activa. */
export async function notifyFlightMobileDevices(input: {
  flightId: string;
  flightCode: string;
  kind: FlightPushKind;
  title: string;
  body: string;
}) {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        flights: { some: { flightId: input.flightId } },
        status: {
          in: [
            BookingStatus.CONFIRMED,
            BookingStatus.PAID,
            BookingStatus.REASIGNADO,
            ...(input.kind === 'FLIGHT_CANCELLED' ? [BookingStatus.REPROGRAMACION_PENDIENTE] : []),
          ],
        },
      },
      select: { id: true, userId: true },
    });

    const bookingIds = bookings.map((booking) => booking.id);
    const userIds = [...new Set(bookings.flatMap((booking) => booking.userId ? [booking.userId] : []))];
    const deviceScopes: Prisma.PushDeviceWhereInput[] = [{ flightId: input.flightId }];
    if (bookingIds.length > 0) deviceScopes.push({ bookingId: { in: bookingIds } });
    if (userIds.length > 0) deviceScopes.push({ userId: { in: userIds } });

    const devices = await prisma.pushDevice.findMany({
      where: { isActive: true, OR: deviceScopes },
      select: { id: true, pushToken: true, bookingCode: true },
    });
    const expoDevices = devices.filter(({ pushToken }) => /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(pushToken));
    if (expoDevices.length === 0) return { accepted: 0, invalidated: 0 };

    let accepted = 0;
    let invalidated = 0;
    const sentAt = new Date();

    for (let offset = 0; offset < expoDevices.length; offset += EXPO_BATCH_SIZE) {
      const batch = expoDevices.slice(offset, offset + EXPO_BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(({ pushToken }) => ({
          to: pushToken,
          sound: 'default',
          title: input.title,
          body: input.body,
          priority: 'high',
          channelId: 'flight-updates',
          data: { type: input.kind, flightId: input.flightId, flightCode: input.flightCode },
        }))),
        signal: AbortSignal.timeout(10_000),
      });

      const payload = await response.json().catch(() => null) as { data?: ExpoPushTicket[] } | null;
      if (!response.ok || !Array.isArray(payload?.data)) {
        console.error(`[push] Expo rechazó el lote de ${input.kind} (HTTP ${response.status}).`);
        continue;
      }

      const acceptedDevices: typeof batch = [];
      const invalidTokens: string[] = [];
      payload.data.forEach((ticket, index) => {
        const device = batch[index];
        if (!device) return;
        if (ticket.status === 'ok') acceptedDevices.push(device);
        else if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(device.pushToken);
      });

      accepted += acceptedDevices.length;
      invalidated += invalidTokens.length;

      if (acceptedDevices.length > 0) {
        await prisma.deviceNotification.createMany({
          data: acceptedDevices.map((device) => ({
            id: randomUUID(),
            deviceId: device.id,
            title: input.title,
            message: input.body,
            type: input.kind,
            flightCode: input.flightCode,
            bookingCode: device.bookingCode,
            data: { flightId: input.flightId, flightCode: input.flightCode } as Prisma.InputJsonValue,
            sentAt,
          })),
        });
      }

      if (invalidTokens.length > 0) {
        await prisma.pushDevice.updateMany({
          where: { pushToken: { in: invalidTokens } },
          data: { isActive: false, lastSeenAt: sentAt },
        });
      }
    }

    return { accepted, invalidated };
  } catch (error) {
    // Un problema con Expo no debe revertir la reprogramación o cancelación del vuelo.
    console.error(`[push] No se pudo enviar el aviso ${input.kind}:`, error instanceof Error ? error.message : 'error desconocido');
    return { accepted: 0, invalidated: 0 };
  }
}
