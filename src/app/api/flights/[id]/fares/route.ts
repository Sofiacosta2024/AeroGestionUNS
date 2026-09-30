import { UserRole } from '@prisma/client';
import { ApiError, created, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { flightFareSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/flights/:id/fares
 * Precios de la tarjeta de vuelo (Economy Flex / UNS Corporativo, ...).
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const flight = await prisma.flight.findUnique({
    where: { id },
    select: { id: true, code: true },
  });
  if (!flight) throw ApiError.notFound('Vuelo no encontrado');

  const data = await prisma.flightFare.findMany({
    where: { flightId: id, fare: { isActive: true } },
    include: { fare: true },
    orderBy: { price: 'asc' },
  });

  return ok({
    data: data.map((f) => ({
      id: f.fare.id,
      code: f.fare.code,
      name: f.fare.name,
      cabinClass: f.fare.cabinClass,
      price: Number(f.price),
      currency: f.currency,
      availableSeats: f.availableSeats,
      carryOnKg: f.fare.carryOnKg,
      checkedBagKg: f.fare.checkedBagKg,
      benefits: f.fare.benefits,
      changeAllowed: f.fare.changeAllowed,
      seatSelection: f.fare.seatSelection,
      refundable: f.fare.refundable,
    })),
  });
});

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const body = await parseBody(req, flightFareSchema);

  const flight = await prisma.flight.findUnique({ where: { id }, select: { id: true } });
  if (!flight) throw ApiError.notFound('Vuelo no encontrado');

  const data = await prisma.flightFare.upsert({
    where: { flightId_fareId: { flightId: id, fareId: body.fareId } },
    update: { price: body.price, availableSeats: body.availableSeats, currency: body.currency },
    create: { flightId: id, ...body },
    include: { fare: true },
  });

  await audit({
    userId: user.id,
    action: 'UPSERT',
    entity: 'FlightFare',
    entityId: data.id,
    metadata: { flightId: id, fareId: body.fareId },
  });

  return created({ ...data, price: Number(data.price) });
});

export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { id } = await ctx.params;
  const fareId = new URL(req.url).searchParams.get('fareId');
  if (!fareId) throw ApiError.badRequest('Falta el parametro fareId');

  const result = await prisma.flightFare.deleteMany({ where: { flightId: id, fareId } });
  if (result.count === 0) throw ApiError.notFound('La tarifa no esta asociada a este vuelo');

  await audit({ userId: user.id, action: 'DELETE', entity: 'FlightFare', entityId: id });
  return noContent();
});
