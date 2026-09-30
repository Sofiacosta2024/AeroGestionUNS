import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { toUtcRange } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { weeklyFareQuery, weeklyFareSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/weekly-fares
 * Alimenta el "Calendario Semanal de Tarifas" de la interfaz.
 *
 *   /api/weekly-fares?routeId=<id>&from=2025-11-16&to=2025-11-22
 *   /api/weekly-fares?origin=BHI&destination=AEP&from=...&to=...
 *
 * Si no se manda rango, devuelve la semana (domingo a sabado) que contiene `from`
 * o, en su defecto, la semana actual.
 */
export const GET = handler(async (req: Request) => {
  const q = parseQuery(req, weeklyFareQuery);
  const { routeId, origin, destination, from, to } = q;

  const routeWhere = {
    ...(routeId ? { id: routeId } : {}),
    ...(origin || destination
      ? {
          ...(origin ? { originAirportId: origin } : {}),
          ...(destination ? { destinationAirportId: destination } : {}),
        }
      : {}),
  };

  const range = toUtcRange(from, to);

  const data = await prisma.weeklyFare.findMany({
    where: {
      route: routeWhere,
      ...(range.gte || range.lt
        ? { date: { ...(range.gte ? { gte: range.gte } : {}), ...(range.lt ? { lt: range.lt } : {}) } }
        : {}),
    },
    include: {
      route: {
        select: {
          id: true,
          code: true,
          originAirport: { select: { iataCode: true, city: true, name: true } },
          destinationAirport: { select: { iataCode: true, city: true, name: true } },
        },
      },
    },
    orderBy: [{ routeId: 'asc' }, { date: 'asc' }],
  });

  return ok({
    data: data.map((w) => ({
      ...w,
      price: Number(w.price),
      date: w.date.toISOString().slice(0, 10),
    })),
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, weeklyFareSchema);

  const data = await prisma.weeklyFare.create({
    data: { ...body, date: new Date(`${body.date}T00:00:00.000Z`) },
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'WeeklyFare', entityId: data.id });
  return created({ ...data, price: Number(data.price), date: data.date.toISOString().slice(0, 10) });
});
