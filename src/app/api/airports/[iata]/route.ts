import { UserRole } from '@prisma/client';
import { ApiError, handler, noContent, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { airportUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ iata: string }> };

/** GET /api/airports/:iata */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { iata } = await ctx.params;
  const code = iata.toUpperCase();

  const airport = await prisma.airport.findUnique({
    where: { iataCode: code },
    include: {
      originRoutes: { include: { destinationAirport: true } },
      destinationRoutes: { include: { originAirport: true } },
    },
  });

  if (!airport) throw ApiError.notFound(`No existe el aeropuerto ${code}`);
  return ok(airport);
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const { iata } = await ctx.params;
  const code = iata.toUpperCase();
  const body = await parseBody(req, airportUpdateSchema);

  const exists = await prisma.airport.findUnique({ where: { iataCode: code }, select: { iataCode: true } });
  if (!exists) throw ApiError.notFound(`No existe el aeropuerto ${code}`);

  const airport = await prisma.airport.update({ where: { iataCode: code }, data: body });
  await audit({ userId: user.id, action: 'UPDATE', entity: 'Airport', entityId: code });
  return ok(airport);
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole(UserRole.ADMIN);
  const { iata } = await ctx.params;
  const code = iata.toUpperCase();

  try {
    await prisma.airport.delete({ where: { iataCode: code } });
  } catch (e: unknown) {
    if (typeof e === 'object' && e && 'code' in e && e.code === 'P2003') {
      throw ApiError.conflict(
        'No se puede eliminar: el aeropuerto tiene rutas o aeronaves asociadas',
      );
    }
    throw ApiError.notFound(`No existe el aeropuerto ${code}`);
  }

  await audit({ userId: user.id, action: 'DELETE', entity: 'Airport', entityId: code });
  return noContent();
});
