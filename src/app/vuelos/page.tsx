import { prisma } from '@/lib/prisma';
import { BOOKABLE_STATUSES, flightInclude } from '@/lib/flights';
import { localWeekDays, toUtcRange } from '@/lib/dates';
import { getCurrentUser } from '@/lib/auth';
import {
  toAirportOption,
  toFlightCard,
  type VuelosBootstrap,
} from '@/lib/view-models';
import VuelosClient from './vuelos-client';

export const dynamic = 'force-dynamic';

/** Fecha por defecto de la demo: "Mar 18 Nov 2025", la misma que mostraba el HTML. */
const DEFAULT_PASSENGERS = 2;
const FLIGHT_PAGE_SIZE = 20;

const ROLE_LABEL: Record<string, string> = {
  PASAJERO: 'Pasajero',
  MOSTRADOR: 'Mostrador Operativo',
  ADMIN: 'Administrador',
};


export default async function VuelosPage() {
  const user = await getCurrentUser();

  const DEFAULT_DATE = new Date(Date.now() - 3 * 3_600_000 + 24 * 3_600_000)
    .toISOString().slice(0, 10);
  const DEFAULT_RETURN_DATE = new Date(Date.parse(`${DEFAULT_DATE}T12:00:00Z`) + 6 * 86_400_000)
    .toISOString().slice(0, 10);

  const [airports, routes, userRow] = await Promise.all([
    prisma.airport.findMany({ where: { isActive: true }, orderBy: { iataCode: 'asc' } }),
    prisma.route.findMany({
      where: { isActive: true },
      include: {
        originAirport: true,
        destinationAirport: true,
        weeklyFares: { orderBy: { date: 'asc' } },
      },
      orderBy: { code: 'asc' },
    }),
    user
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true, firstName: true, lastName: true, role: true },
        })
      : null,
  ]);

  const byPair = (o: string, d: string) =>
    routes.find((r) => r.originAirportId === o && r.destinationAirportId === d);

  const route = byPair('BHI', 'AEP') ?? routes[0] ?? null;

  // Carga inicial directa desde Prisma (sin HTTP loopback). Las busquedas que
  // lanza el usuario si van contra /api/flights y /api/weekly-fares.
  const range = toUtcRange(DEFAULT_DATE);
  const now = new Date();
  const initialFlightWhere = route
    ? {
        routeId: route.id,
        status: { in: BOOKABLE_STATUSES },
        departureAt: { gte: range.gte && range.gte > now ? range.gte : now, lt: range.lt },
        fares: { some: { availableSeats: { gte: DEFAULT_PASSENGERS }, fare: { isActive: true } } },
      }
    : null;
  const [flights, totalFlights] = await Promise.all([
    initialFlightWhere
      ? prisma.flight.findMany({
          where: initialFlightWhere,
          include: flightInclude,
          orderBy: { departureAt: 'asc' },
          take: FLIGHT_PAGE_SIZE,
        })
      : Promise.resolve([]),
    initialFlightWhere ? prisma.flight.count({ where: initialFlightWhere }) : Promise.resolve(0),
  ]);

  // Calendario: domingo a sabado de la semana de la fecha de salida. WeeklyFare
  // es una columna @db.Date (sin hora), asi que se compara por dia y no por
  // instante: un rango en ART dejaria afuera el primer dia de la semana.
  const weekDays = new Set(localWeekDays(DEFAULT_DATE));
  const weeklyFares = (route?.weeklyFares ?? []).filter((w) =>
    weekDays.has(w.date.toISOString().slice(0, 10)),
  );

  const bootstrap: VuelosBootstrap = {
    airports: airports.map(toAirportOption),
    routes: routes.map((r) => ({
      id: r.id,
      code: r.code,
      origin: r.originAirportId,
      destination: r.destinationAirportId,
      originCity: r.originAirport.city,
      destinationCity: r.destinationAirport.city,
      originName: r.originAirport.name,
      destinationName: r.destinationAirport.name,
      durationMinutes: r.durationMinutes,
    })),
    initialQuery: {
      origin: route?.originAirportId ?? 'BHI',
      destination: route?.destinationAirportId ?? 'AEP',
      date: DEFAULT_DATE,
      returnDate: DEFAULT_RETURN_DATE,
      passengers: DEFAULT_PASSENGERS,
      routeId: route?.id ?? null,
    },
    initialFlights: flights.map(toFlightCard),
    initialPagination: {
      page: 1,
      pageSize: FLIGHT_PAGE_SIZE,
      total: totalFlights,
      pages: Math.ceil(totalFlights / FLIGHT_PAGE_SIZE),
    },
    initialWeeklyFares: weeklyFares.map((w) => ({
      id: w.id,
      date: w.date.toISOString().slice(0, 10),
      price: Number(w.price),
      demandLevel: w.demandLevel,
      currency: w.currency,
    })),
    user: userRow
      ? {
          name: [userRow.firstName, userRow.lastName].filter(Boolean).join(' ') || userRow.email,
          email: userRow.email,
          role: ROLE_LABEL[userRow.role] ?? userRow.role,
          // Cambio RF-01: habilita el enlace al panel de alta de vuelos.
          isAdmin: userRow.role === 'ADMIN',
        }
      : null,
  };

  return <VuelosClient bootstrap={bootstrap} />;
}
