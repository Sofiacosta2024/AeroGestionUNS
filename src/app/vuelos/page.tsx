import { prisma } from '@/lib/prisma';
import { flightInclude } from '@/lib/flights';
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
const DEFAULT_DATE = '2025-11-18';
const DEFAULT_RETURN_DATE = '2025-11-24';
const DEFAULT_PASSENGERS = 2;

const ROLE_LABEL: Record<string, string> = {
  PASAJERO: 'Pasajero',
  MOSTRADOR: 'Mostrador Operativo',
  ADMIN: 'Administrador',
};

export default async function VuelosPage() {
  const user = await getCurrentUser();

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
  const flights = route
    ? await prisma.flight.findMany({
        where: {
          routeId: route.id,
          status: { not: 'CANCELLED' },
          departureAt: { gte: range.gte, lt: range.lt },
        },
        include: flightInclude,
        orderBy: { departureAt: 'asc' },
        take: 50,
      })
    : [];

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
        }
      : null,
  };

  return <VuelosClient bootstrap={bootstrap} />;
}
