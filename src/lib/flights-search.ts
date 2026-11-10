import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { localTimeUtc, toUtcRange } from '@/lib/dates';
import { BOOKABLE_STATUSES, flightInclude, serializeFlight, type FlightWithRelations } from '@/lib/flights';
import { prisma } from '@/lib/prisma';
import type { flightSearchQuery } from '@/lib/validation';
import type { z } from 'zod';

export type FlightSearchInput = z.output<typeof flightSearchQuery>;

/**
 * Busqueda del motor de vuelos compartida por la web y la API movil.
 *
 * Mantiene el contrato historico de `/api/flights`: filtros, paginacion y
 * serializacion de tarifas. La unica diferencia entre consumidores es la
 * autenticacion del Route Handler.
 */
export async function searchFlights(q: FlightSearchInput) {
  const {
    page, pageSize, origin, destination, date, from, to,
    status, routeId, minPrice, maxPrice, sort, order, onlyDirect,
    timeFrom, timeTo, passengers, available,
  } = q;

  if (available && origin && origin === destination) {
    throw ApiError.badRequest('El origen y el destino no pueden ser iguales');
  }
  if (timeFrom && timeTo && timeFrom > timeTo) {
    throw ApiError.badRequest('La hora desde no puede ser mayor que la hora hasta');
  }

  const priceCond =
    minPrice !== undefined || maxPrice !== undefined
      ? {
          price: {
            ...(minPrice !== undefined ? { gte: minPrice } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
          },
        }
      : {};
  const fareSome: Prisma.FlightFareWhereInput = {
    ...priceCond,
    ...(available ? { availableSeats: { gte: passengers }, fare: { isActive: true } } : {}),
  };

  const where: Prisma.FlightWhereInput = {
    ...(available
      ? { status: { in: BOOKABLE_STATUSES } }
      : status
        ? { status }
        : { status: { not: 'CANCELLED' } }),
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
    ...(Object.keys(fareSome).length > 0 ? { fares: { some: fareSome } } : {}),
  };

  // `date` es un dia puntual en ART; con `timeFrom`/`timeTo` se acota dentro de ese dia.
  const range = toUtcRange(from ?? date, to);
  let gte = range.gte;
  let lt = range.lt;
  if (date && !from && !to) {
    if (timeFrom) gte = localTimeUtc(date, timeFrom);
    if (timeTo) lt = new Date(localTimeUtc(date, timeTo).getTime() + 60_000); // incluye HH:mm completo
  }
  if (available) {
    const now = new Date();
    if (!gte || gte < now) gte = now; // un vuelo que ya salio no se puede reservar
  }
  if (gte || lt) {
    where.departureAt = { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
  }

  const minSeats = available ? passengers : 0;
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
    return {
      data: sorted.slice(start, start + pageSize).map((f) => serializeFlight(f, minSeats)),
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        truncated: total > HARD_LIMIT,
      },
    };
  }

  const data = await prisma.flight.findMany({
    where,
    include: flightInclude,
    orderBy: sort === 'punctuality' ? { punctualityPct: order } : { departureAt: order },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    data: data.map((f) => serializeFlight(f, minSeats)),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  };
}
