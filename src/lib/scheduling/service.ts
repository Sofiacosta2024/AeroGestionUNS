import { AircraftStatus, ScheduleStatus, type Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import type { ScheduleInput, SingleFlightInput } from '@/lib/validation';
import { addMinutes, expandOperatingDates, localDateTimeToUtc, localTimeOf, weekdayOf } from './calendar';
import { summarizeCabins, validateClassOffers, type CabinUsage, type OfferIssue } from './capacity';
import { minDepartureGapMinutes } from './config';
import {
  describeConflict,
  findAircraftOverlaps,
  findDepartureGapConflicts,
  findPastDepartures,
  type PlannedFlight,
  type ScheduleConflict,
} from './conflicts';
import * as repo from './repository';
import type { ScheduleContext, ScheduleWithRelations } from './repository';

/**
 * Casos de uso de la programacion de vuelos (RF-01).
 *
 * Orquesta las reglas puras (calendario, conflictos, capacidad) con el repositorio.
 * Toda escritura vuelve a validar dentro de la transaccion: nunca se guarda ni se
 * publica un cronograma que choque con vuelos ya programados.
 */

type Db = Prisma.TransactionClient;

export type ConflictView = ScheduleConflict & { message: string };

/** Resultado del chequeo que usa el formulario mientras se carga un cronograma. */
export type ScheduleEvaluation = {
  flightsCount: number;
  dates: string[];
  departureTime: string;
  /** Hora local de llegada (salida + duracion de la ruta); null si no genera vuelos. */
  arrivalTime: string | null;
  durationMinutes: number;
  cabins: CabinUsage[];
  conflicts: ConflictView[];
  issues: OfferIssue[];
  /** true si se puede guardar o publicar tal como esta. */
  canSave: boolean;
};

type Evaluation = { view: ScheduleEvaluation; planned: PlannedFlight[] };

/** Publicar un cronograma de un año crea cientos de filas: margen amplio para la transaccion. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

function planFlights(input: ScheduleInput, durationMinutes: number): PlannedFlight[] {
  return expandOperatingDates(input.validFrom, input.validTo, input.weekdays).map((date) => {
    const departureAt = localDateTimeToUtc(date, input.departureTime);
    return { date, departureAt, arrivalAt: addMinutes(departureAt, durationMinutes) };
  });
}

function contextIssues(ctx: ScheduleContext, planned: readonly PlannedFlight[]): OfferIssue[] {
  const issues: OfferIssue[] = [];
  if (!ctx.route.isActive) {
    issues.push({ campo: 'routeId', mensaje: 'La ruta esta inactiva' });
  }
  if (ctx.aircraft.status !== AircraftStatus.ACTIVE) {
    issues.push({ campo: 'aircraftId', mensaje: `El avion ${ctx.aircraft.registration} no esta operativo` });
  }
  if (planned.length === 0) {
    issues.push({
      campo: 'weekdays',
      mensaje: 'Ningun dia de la vigencia coincide con los dias de operacion elegidos',
    });
  }
  return issues;
}

async function findConflicts(
  db: Db,
  ctx: ScheduleContext,
  planned: readonly PlannedFlight[],
  gapMinutes: number,
  now: Date,
): Promise<ScheduleConflict[]> {
  const first = planned[0];
  const last = planned[planned.length - 1];
  if (!first || !last) return [];

  const [sameOrigin, sameAircraft] = await Promise.all([
    repo.findDeparturesFrom(db, ctx.route.originAirportId, {
      from: addMinutes(first.departureAt, -gapMinutes),
      to: addMinutes(last.departureAt, gapMinutes),
    }),
    repo.findAircraftFlights(db, ctx.aircraft.id, { from: first.departureAt, to: last.arrivalAt }),
  ]);

  return [
    ...findPastDepartures(planned, now),
    ...findDepartureGapConflicts(planned, sameOrigin, gapMinutes),
    ...findAircraftOverlaps(planned, sameAircraft),
  ];
}

async function evaluate(db: Db, input: ScheduleInput, now: Date): Promise<Evaluation> {
  const ctx = await repo.loadScheduleContext(db, input.routeId, input.aircraftId);
  if (!ctx) throw ApiError.badRequest('La ruta o el avion indicados no existen');

  const gapMinutes = minDepartureGapMinutes();
  const planned = planFlights(input, ctx.route.durationMinutes);
  const conflicts = await findConflicts(db, ctx, planned, gapMinutes, now);
  const issues = [
    ...contextIssues(ctx, planned),
    ...validateClassOffers(input.fares, ctx.classes, ctx.cabinSeats),
  ];

  return {
    planned,
    view: {
      flightsCount: planned.length,
      dates: planned.map((p) => p.date),
      departureTime: input.departureTime,
      arrivalTime: planned[0] ? localTimeOf(planned[0].arrivalAt) : null,
      durationMinutes: ctx.route.durationMinutes,
      cabins: summarizeCabins(input.fares, ctx.classes, ctx.cabinSeats),
      conflicts: conflicts.map((c) => ({ ...c, message: describeConflict(c, gapMinutes) })),
      issues,
      canSave: conflicts.length === 0 && issues.length === 0,
    },
  };
}

function assertSavable(view: ScheduleEvaluation): void {
  if (view.issues.length > 0) {
    throw ApiError.unprocessable('El cronograma tiene datos invalidos', view.issues);
  }
  if (view.conflicts.length > 0) {
    throw ApiError.conflict('El cronograma choca con vuelos ya programados', view.conflicts);
  }
}

async function requireDraft(db: Db, id: string): Promise<ScheduleWithRelations> {
  const schedule = await repo.findSchedule(db, id);
  if (!schedule) throw ApiError.notFound('Cronograma no encontrado');
  if (schedule.status !== ScheduleStatus.DRAFT) {
    throw ApiError.conflict('El cronograma ya fue publicado: solo se pueden modificar borradores');
  }
  return schedule;
}

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

/** Chequeo en vivo para el formulario: no guarda nada. */
export async function checkSchedule(input: ScheduleInput): Promise<ScheduleEvaluation> {
  return (await evaluate(prisma, input, new Date())).view;
}

/** Guarda un borrador o, con `publish`, lo guarda y publica en el acto. */
export async function createSchedule(
  input: ScheduleInput,
  options: { createdById: string; publish: boolean },
): Promise<ScheduleWithRelations> {
  const id = await prisma.$transaction(async (tx) => {
    if (options.publish) await repo.lockScheduling(tx);
    const { view, planned } = await evaluate(tx, input, new Date());
    assertSavable(view);

    const schedule = await repo.insertSchedule(tx, input, options.createdById);
    if (options.publish) await repo.publishFlights(tx, schedule.id, input, planned);
    return schedule.id;
  }, TX_OPTIONS);

  return getSchedule(id);
}

export async function updateDraft(id: string, input: ScheduleInput): Promise<ScheduleWithRelations> {
  await prisma.$transaction(async (tx) => {
    await requireDraft(tx, id);
    const { view } = await evaluate(tx, input, new Date());
    assertSavable(view);
    await repo.replaceSchedule(tx, id, input);
  }, TX_OPTIONS);

  return getSchedule(id);
}

/**
 * Publica un borrador. Se vuelve a validar porque el borrador no reserva horario:
 * si mientras tanto otro vuelo ocupo la franja, se rechaza con el detalle.
 */
export async function publishDraft(id: string): Promise<ScheduleWithRelations> {
  await prisma.$transaction(async (tx) => {
    await repo.lockScheduling(tx);
    const draft = await requireDraft(tx, id);
    const input = repo.toScheduleInput(draft);
    const { view, planned } = await evaluate(tx, input, new Date());
    assertSavable(view);
    await repo.publishFlights(tx, id, input, planned);
  }, TX_OPTIONS);

  return getSchedule(id);
}

export async function discardDraft(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requireDraft(tx, id);
    await repo.deleteSchedule(tx, id);
  });
}

/** Alta de un vuelo puntual (`POST /api/flights`): un cronograma de un solo dia, publicado en el acto. */
export function publishSingleFlight(
  input: SingleFlightInput,
  createdById: string,
): Promise<ScheduleWithRelations> {
  return createSchedule(
    {
      routeId: input.routeId,
      aircraftId: input.aircraftId,
      validFrom: input.date,
      validTo: input.date,
      weekdays: [weekdayOf(input.date)],
      departureTime: input.departureTime,
      fares: input.fares,
    },
    { createdById, publish: true },
  );
}

export async function getSchedule(id: string): Promise<ScheduleWithRelations> {
  const schedule = await repo.findSchedule(prisma, id);
  if (!schedule) throw ApiError.notFound('Cronograma no encontrado');
  return schedule;
}

export function listSchedules(filter: {
  status?: ScheduleStatus;
  page: number;
  pageSize: number;
}): Promise<{ total: number; data: ScheduleWithRelations[] }> {
  return repo.listSchedules(prisma, {
    status: filter.status,
    skip: (filter.page - 1) * filter.pageSize,
    take: filter.pageSize,
  });
}
