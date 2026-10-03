import type { Prisma } from '@prisma/client';
import { localDayRangeUtc } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { localTimeOf } from './calendar';

/**
 * Itinerario = planilla del dia (RF-01): todos los vuelos que salen en un dia local,
 * con sus horarios, avion y ocupacion por clase. Es una consulta, no tiene tabla propia.
 */

const itineraryInclude = {
  route: { include: { originAirport: true, destinationAirport: true } },
  aircraft: { select: { registration: true, model: true } },
  fares: { include: { fare: true }, orderBy: { fare: { basePrice: 'asc' } } },
} satisfies Prisma.FlightInclude;

type ItineraryFlight = Prisma.FlightGetPayload<{ include: typeof itineraryInclude }>;

function serializeItineraryFlight(f: ItineraryFlight) {
  return {
    id: f.id,
    code: f.code,
    status: f.status,
    scheduleId: f.scheduleId,
    departureAt: f.departureAt,
    arrivalAt: f.arrivalAt,
    departureTime: localTimeOf(f.departureAt),
    arrivalTime: localTimeOf(f.arrivalAt),
    route: {
      code: f.route.code,
      origin: { iataCode: f.route.originAirport.iataCode, city: f.route.originAirport.city },
      destination: { iataCode: f.route.destinationAirport.iataCode, city: f.route.destinationAirport.city },
    },
    aircraft: f.aircraft,
    classes: f.fares.map((ff) => ({
      fareId: ff.fareId,
      name: ff.fare.name,
      cabinClass: ff.fare.cabinClass,
      price: Number(ff.price),
      currency: ff.currency,
      seatCapacity: ff.seatCapacity,
      availableSeats: ff.availableSeats,
    })),
  };
}

export type ItineraryFlightView = ReturnType<typeof serializeItineraryFlight>;

/** Vuelos que salen el dia local `date` (yyyy-mm-dd), de todos los estados, por hora de salida. */
export async function getItinerary(date: string): Promise<{ date: string; flights: ItineraryFlightView[] }> {
  const { start, end } = localDayRangeUtc(date);
  const flights = await prisma.flight.findMany({
    where: { departureAt: { gte: start, lt: end } },
    include: itineraryInclude,
    orderBy: { departureAt: 'asc' },
  });
  return { date, flights: flights.map(serializeItineraryFlight) };
}
