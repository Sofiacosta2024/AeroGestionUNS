import { UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManage, getCurrentUser, requireRole } from '@/lib/auth';
import { generateBaggageTag } from '@/lib/codes';
import { prisma } from '@/lib/prisma';
import { baggageSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** GET /api/bookings/:code/baggage — equipajes de todos los pasajeros de la reserva. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');
  await assertCanAccess(booking);

  const data = await prisma.baggage.findMany({
    where: { bookingPassenger: { bookingId: booking.id } },
    include: {
      bookingPassenger: {
        select: { id: true, firstName: true, lastName: true, documentNumber: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return ok({ data: data.map((b) => ({ ...b, weightKg: b.weightKg === null ? null : Number(b.weightKg) })) });
});

/** POST /api/bookings/:code/baggage — registra un equipaje para un pasajero de la reserva. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { code } = await ctx.params;
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, baggageSchema);
  const url = new URL(req.url);

  const bookingPassengerId = url.searchParams.get('bookingPassengerId');
  if (!bookingPassengerId) {
    throw ApiError.badRequest('Falta el parametro bookingPassengerId');
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: code.toUpperCase() },
    select: { id: true, bookingCode: true, userId: true },
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const passenger = await prisma.bookingPassenger.findFirst({
    where: { id: bookingPassengerId, bookingId: booking.id },
  });
  if (!passenger) throw ApiError.notFound('El pasajero indicado no pertenece a esta reserva');

  const baggage = await prisma.baggage.create({
    data: {
      bookingPassengerId,
      tagCode: body.tagCode || generateBaggageTag(),
      type: body.type,
      weightKg: body.weightKg ?? null,
      status: body.status,
    },
    include: {
      bookingPassenger: { select: { firstName: true, lastName: true, documentNumber: true } },
    },
  });

  await audit({
    userId: user.id,
    action: 'BAGGAGE',
    entity: 'Baggage',
    entityId: baggage.id,
    metadata: { bookingCode: booking.bookingCode, tagCode: baggage.tagCode },
  });

  return created({ ...baggage, weightKg: baggage.weightKg === null ? null : Number(baggage.weightKg) });
});

async function assertCanAccess(booking: { userId: string | null; bookingCode: string }) {
  const user = await getCurrentUser();
  if (canManage(user)) return;
  if (user && booking.userId === user.id) return;
  throw ApiError.forbidden('No tiene permisos para esta reserva');
}
