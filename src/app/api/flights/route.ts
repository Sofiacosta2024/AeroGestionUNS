import { Prisma, UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { toUtcRange } from '@/lib/dates';
import { flightInclude, serializeFlight, type FlightWithRelations } from '@/lib/flights';
import { prisma } from '@/lib/prisma';
import { publishSingleFlight } from '@/lib/scheduling/service';
import { flightSearchQuery, singleFlightSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flights
 *
 * Busqueda del motor de vuelos: reemplaza los datos hardcodeados de vuelos.html.
 *
 *   /api/flights?origin=BHI&destination=AEP&date=2025-11-18
 *   /api/flights?routeId=<id>&from=2025-11-18&to=2025-11-24&sort=price&order=asc
 */
export const GET = handler(async (req: Request) => {
  const q = parseQuery(req, flightSearchQuery);
  const {
    page, pageSize, origin, destination, date, from, to,
    status, routeId, minPrice, maxPrice, sort, order, onlyDirect,
  } = q;

  const where: Prisma.FlightWhereInput = {
    ...(status ? { status } : { status: { not: 'CANCELLED' } }),
    ...(routeId ? { routeId } : {}),
    ...(onlyDirect === undefined ? {} : { isDirect: onlyDirect }),
    ...(origin || destination
      ? {
          route: {
            ...(origin ? { originAirportId: origin } : {}),
            ...(destination ? { destinationAirportId: destination } : {}),
          },
        }
      : {}),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          fares: {
            some: {
              ...(minPrice !== undefined ? { price: { gte: minPrice } } : {}),
              ...(maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
            },
          },
        }
      : {}),
  };

  // `date` es el caso de uso de la UI (un dia puntual) y se resuelve en ART.
  const range = toUtcRange(from ?? date, to);
  if (range.gte || range.lt) {
    where.departureAt = {
      ...(range.gte ? { gte: range.gte } : {}),
      ...(range.lt ? { lt: range.lt } : {}),
    };
  }

  const total = await prisma.flight.count({ where });

  // El orden por precio no es posible en SQL (depende del minimo de FlightFare),
  // asi que en ese caso se pagina en memoria con un tope duro.
  if (sort === 'price') {
    const HARD_LIMIT = 500;
    const rows = await prisma.flight.findMany({
      where,
      include: flightInclude,
      orderBy: { departureAt: 'asc' },
      take: HARD_LIMIT,
    });

    const minPriceOf = (f: FlightWithRelations) =>
      f.fares.length > 0 ? Number(f.fares[0]!.price) : Number.POSITIVE_INFINITY;

    const sorted = [...rows].sort((a, b) =>
      order === 'asc' ? minPriceOf(a) - minPriceOf(b) : minPriceOf(b) - minPriceOf(a),
    );

    const start = (page - 1) * pageSize;
    return ok({
      data: sorted.slice(start, start + pageSize).map(serializeFlight),
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        truncated: total > HARD_LIMIT,
      },
    });
  }

  const data = await prisma.flight.findMany({
    where,
    include: flightInclude,
    orderBy: sort === 'punctuality' ? { punctualityPct: order } : { departureAt: order },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return ok({
    data: data.map(serializeFlight),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});

/**
 * POST /api/flights
 *
 * Alta de un vuelo puntual con las mismas reglas que el panel de RF-01: el codigo
 * AG-#### y la llegada los calcula el sistema, se exigen asientos y precio por clase,
 * y se rechazan fechas pasadas y choques de horario. Por dentro es un cronograma de un
 * solo dia publicado en el acto.
 *
 * Cambio RF-01: antes recibia `code` y `arrivalAt` y creaba el vuelo sin validar
 * superposiciones, sin precios ni asientos (quedaba visible en el buscador vacio).
 * Ahora recibe `{ routeId, aircraftId, date, departureTime, fares[] }` y pasa por el
 * mismo servicio que el panel para que no haya un camino que saltee las reglas.
 * Mantiene el acceso de MOSTRADOR por decision del subgrupo de RF-01; si eso cambia,
 * solo hay que ajustar el `requireRole`.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, singleFlightSchema);

  const schedule = await publishSingleFlight(body, user.id);
  const flight = await prisma.flight.findFirstOrThrow({
    where: { scheduleId: schedule.id },
    include: flightInclude,
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Flight', entityId: flight.id });
  return created(serializeFlight(flight));
});
