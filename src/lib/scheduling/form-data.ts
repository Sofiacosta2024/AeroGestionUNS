import { AircraftStatus, type CabinClass } from '@prisma/client';
import { toDateInput } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { CABIN_ORDER, type CabinSeats } from './capacity';
import { minDepartureGapMinutes } from './config';

/**
 * Datos que necesita el formulario de alta y publicacion (RF-01). Se cargan en el
 * servidor (como hace /vuelos) para que la pantalla llegue lista, sin llamadas extra.
 */

export type FormAirport = { iataCode: string; city: string; name: string };

export type FormRoute = {
  id: string;
  code: string;
  origin: string;
  destination: string;
  durationMinutes: number;
  distanceKm: number | null;
};

export type FormAircraft = {
  id: string;
  registration: string;
  model: string;
  cabins: CabinSeats;
  totalSeats: number;
};

/** Una clase vendible: tarifa activa del catalogo. */
export type FormClass = {
  id: string;
  code: string;
  name: string;
  cabinClass: CabinClass;
  basePrice: number;
  benefits: string[];
};

export type ScheduleFormData = {
  airports: FormAirport[];
  routes: FormRoute[];
  aircraft: FormAircraft[];
  classes: FormClass[];
  gapMinutes: number;
  /** Hoy en hora ART (yyyy-mm-dd), para no ofrecer fechas pasadas. */
  today: string;
};

export async function loadScheduleFormData(): Promise<ScheduleFormData> {
  const [airports, routes, aircraft, seatGroups, fares] = await Promise.all([
    prisma.airport.findMany({
      where: { isActive: true },
      select: { iataCode: true, city: true, name: true },
      orderBy: { iataCode: 'asc' },
    }),
    prisma.route.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        originAirportId: true,
        destinationAirportId: true,
        durationMinutes: true,
        distanceKm: true,
      },
      orderBy: { code: 'asc' },
    }),
    prisma.aircraft.findMany({
      where: { status: AircraftStatus.ACTIVE },
      select: { id: true, registration: true, model: true },
      orderBy: { registration: 'asc' },
    }),
    prisma.seat.groupBy({ by: ['aircraftId', 'cabinClass'], _count: { _all: true } }),
    prisma.fare.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, cabinClass: true, basePrice: true, benefits: true },
      orderBy: { basePrice: 'asc' },
    }),
  ]);

  return {
    airports,
    routes: routes.map((r) => ({
      id: r.id,
      code: r.code,
      origin: r.originAirportId,
      destination: r.destinationAirportId,
      durationMinutes: r.durationMinutes,
      distanceKm: r.distanceKm,
    })),
    aircraft: aircraft.map((a) => {
      const groups = seatGroups
        .filter((g) => g.aircraftId === a.id)
        .sort((g1, g2) => CABIN_ORDER.indexOf(g1.cabinClass) - CABIN_ORDER.indexOf(g2.cabinClass));
      const cabins: CabinSeats = Object.fromEntries(groups.map((g) => [g.cabinClass, g._count._all]));
      return { ...a, cabins, totalSeats: groups.reduce((sum, g) => sum + g._count._all, 0) };
    }),
    classes: fares.map((f) => ({ ...f, basePrice: Number(f.basePrice) })),
    gapMinutes: minDepartureGapMinutes(),
    today: toDateInput(new Date()),
  };
}
