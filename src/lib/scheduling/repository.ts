import { FlightStatus, ScheduleStatus, type CabinClass, type Prisma } from '@prisma/client';
import { formatFlightCode } from '@/lib/codes';
import type { ScheduleInput } from '@/lib/validation';
import type { CabinSeats, SellableClass } from './capacity';
import type { PlannedFlight, ScheduledFlight } from './conflicts';

/**
 * Acceso a datos de la programacion de vuelos. Todas las funciones reciben el cliente
 * (`prisma` o una transaccion) para que el servicio decida el alcance transaccional.
 */

type Db = Prisma.TransactionClient;

/** Clave del lock de Postgres que serializa la publicacion de vuelos (valor arbitrario fijo). */
const SCHEDULING_LOCK_KEY = 4_100_001;

export const scheduleInclude = {
  route: { include: { originAirport: true, destinationAirport: true } },
  aircraft: { select: { id: true, registration: true, model: true } },
  fares: { include: { fare: true }, orderBy: { fare: { basePrice: 'asc' } } },
  _count: { select: { flights: true } },
} satisfies Prisma.FlightScheduleInclude;

export type ScheduleWithRelations = Prisma.FlightScheduleGetPayload<{ include: typeof scheduleInclude }>;

export type ScheduleContext = {
  route: {
    id: string;
    originAirportId: string;
    destinationAirportId: string;
    durationMinutes: number;
    isActive: boolean;
  };
  aircraft: { id: string; registration: string; status: string };
  cabinSeats: CabinSeats;
  /** Clases vendibles: tarifas activas del catalogo. */
  classes: SellableClass[];
};

/** `yyyy-mm-dd` -> valor para una columna `@db.Date`. */
const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** Ruta, avion (con asientos por cabina) y clases vendibles; null si falta la ruta o el avion. */
export async function loadScheduleContext(
  db: Db,
  routeId: string,
  aircraftId: string,
): Promise<ScheduleContext | null> {
  const [route, aircraft, seatGroups, classes] = await Promise.all([
    db.route.findUnique({
      where: { id: routeId },
      select: {
        id: true,
        originAirportId: true,
        destinationAirportId: true,
        durationMinutes: true,
        isActive: true,
      },
    }),
    db.aircraft.findUnique({
      where: { id: aircraftId },
      select: { id: true, registration: true, status: true },
    }),
    db.seat.groupBy({ by: ['cabinClass'], where: { aircraftId }, _count: { _all: true } }),
    db.fare.findMany({
      where: { isActive: true },
      select: { id: true, name: true, cabinClass: true },
      orderBy: { basePrice: 'asc' },
    }),
  ]);

  if (!route || !aircraft) return null;

  const cabinSeats: CabinSeats = Object.fromEntries(
    seatGroups.map((g) => [g.cabinClass, g._count._all] as [CabinClass, number]),
  );

  return { route, aircraft, cabinSeats, classes };
}

/** Vuelos no cancelados que salen de `originAirportId` dentro de la ventana. */
export function findDeparturesFrom(
  db: Db,
  originAirportId: string,
  window: { from: Date; to: Date },
): Promise<ScheduledFlight[]> {
  return db.flight.findMany({
    where: {
      status: { not: FlightStatus.CANCELLED },
      route: { originAirportId },
      departureAt: { gte: window.from, lte: window.to },
    },
    select: { code: true, departureAt: true, arrivalAt: true },
  });
}

/** Vuelos no cancelados del avion cuyo horario toca la ventana. */
export function findAircraftFlights(
  db: Db,
  aircraftId: string,
  window: { from: Date; to: Date },
): Promise<ScheduledFlight[]> {
  return db.flight.findMany({
    where: {
      aircraftId,
      status: { not: FlightStatus.CANCELLED },
      departureAt: { lt: window.to },
      arrivalAt: { gt: window.from },
    },
    select: { code: true, departureAt: true, arrivalAt: true },
  });
}

/**
 * Serializa la publicacion de vuelos: dos publicaciones simultaneas no pueden validar
 * el mismo horario a la vez. Es un lock de transaccion (se libera solo al terminar).
 */
export async function lockScheduling(db: Db): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULING_LOCK_KEY}::bigint)`;
}

export function findSchedule(db: Db, id: string): Promise<ScheduleWithRelations | null> {
  return db.flightSchedule.findUnique({ where: { id }, include: scheduleInclude });
}

export async function listSchedules(
  db: Db,
  filter: { status?: ScheduleStatus; skip: number; take: number },
): Promise<{ total: number; data: ScheduleWithRelations[] }> {
  const where: Prisma.FlightScheduleWhereInput = filter.status ? { status: filter.status } : {};
  const [total, data] = await Promise.all([
    db.flightSchedule.count({ where }),
    db.flightSchedule.findMany({
      where,
      include: scheduleInclude,
      orderBy: { updatedAt: 'desc' },
      skip: filter.skip,
      take: filter.take,
    }),
  ]);
  return { total, data };
}

function scheduleFields(input: ScheduleInput) {
  return {
    routeId: input.routeId,
    aircraftId: input.aircraftId,
    validFrom: toDbDate(input.validFrom),
    validTo: toDbDate(input.validTo),
    weekdays: input.weekdays,
    departureTime: input.departureTime,
  };
}

function fareRows(input: ScheduleInput) {
  return input.fares.map((o) => ({ fareId: o.fareId, price: o.price, seats: o.seats }));
}

export function insertSchedule(db: Db, input: ScheduleInput, createdById: string): Promise<{ id: string }> {
  return db.flightSchedule.create({
    data: { ...scheduleFields(input), createdById, fares: { create: fareRows(input) } },
    select: { id: true },
  });
}

/** Reemplaza los datos de un borrador (las clases se reescriben completas). */
export async function replaceSchedule(db: Db, id: string, input: ScheduleInput): Promise<void> {
  await db.flightScheduleFare.deleteMany({ where: { scheduleId: id } });
  await db.flightSchedule.update({
    where: { id },
    data: { ...scheduleFields(input), fares: { create: fareRows(input) } },
  });
}

export async function deleteSchedule(db: Db, id: string): Promise<void> {
  await db.flightSchedule.delete({ where: { id } });
}

/** Proximos `count` codigos AG-#### de la secuencia, en orden. */
async function nextFlightCodes(db: Db, count: number): Promise<string[]> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT nextval('flight_code_seq')::int AS n FROM generate_series(1, ${count}::int)`;
  return rows.map((r) => r.n).sort((a, b) => a - b).map(formatFlightCode);
}

/** Crea los vuelos planificados con sus precios y asientos por clase, y marca el cronograma publicado. */
export async function publishFlights(
  db: Db,
  scheduleId: string,
  input: ScheduleInput,
  planned: readonly PlannedFlight[],
): Promise<void> {
  const codes = await nextFlightCodes(db, planned.length);

  const flights = await db.flight.createManyAndReturn({
    data: planned.map((p, i) => ({
      code: codes[i]!,
      routeId: input.routeId,
      aircraftId: input.aircraftId,
      departureAt: p.departureAt,
      arrivalAt: p.arrivalAt,
      status: FlightStatus.SCHEDULED,
      scheduleId,
    })),
    select: { id: true },
  });

  await db.flightFare.createMany({
    data: flights.flatMap((f) =>
      input.fares.map((o) => ({
        flightId: f.id,
        fareId: o.fareId,
        price: o.price,
        availableSeats: o.seats,
        seatCapacity: o.seats,
      })),
    ),
  });

  await db.flightSchedule.update({
    where: { id: scheduleId },
    data: { status: ScheduleStatus.PUBLISHED, publishedAt: new Date() },
  });
}

/** Datos de un cronograma guardado, en el mismo formato que la entrada validada. */
export function toScheduleInput(schedule: ScheduleWithRelations): ScheduleInput {
  return {
    routeId: schedule.routeId,
    aircraftId: schedule.aircraftId,
    validFrom: schedule.validFrom.toISOString().slice(0, 10),
    validTo: schedule.validTo.toISOString().slice(0, 10),
    weekdays: schedule.weekdays,
    departureTime: schedule.departureTime,
    fares: schedule.fares.map((f) => ({ fareId: f.fareId, price: Number(f.price), seats: f.seats })),
  };
}
