import type { ScheduleWithRelations } from './repository';

/** Forma de un cronograma en la API: Decimal -> number y columnas date -> yyyy-mm-dd. */
export function serializeSchedule(s: ScheduleWithRelations) {
  return {
    id: s.id,
    status: s.status,
    validFrom: s.validFrom.toISOString().slice(0, 10),
    validTo: s.validTo.toISOString().slice(0, 10),
    weekdays: s.weekdays,
    departureTime: s.departureTime,
    route: {
      id: s.route.id,
      code: s.route.code,
      durationMinutes: s.route.durationMinutes,
      origin: { iataCode: s.route.originAirport.iataCode, city: s.route.originAirport.city },
      destination: { iataCode: s.route.destinationAirport.iataCode, city: s.route.destinationAirport.city },
    },
    aircraft: s.aircraft,
    fares: s.fares.map((f) => ({
      fareId: f.fareId,
      code: f.fare.code,
      name: f.fare.name,
      cabinClass: f.fare.cabinClass,
      price: Number(f.price),
      seats: f.seats,
      currency: f.currency,
    })),
    flightsCount: s._count.flights,
    createdById: s.createdById,
    publishedAt: s.publishedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type SerializedSchedule = ReturnType<typeof serializeSchedule>;
