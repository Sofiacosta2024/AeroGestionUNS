import { AircraftStatus, ScheduleStatus, type Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { formatFullDate, toDateInput } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import type { ScheduleInput, SingleFlightInput } from '@/lib/validation';
import { addMinutes, expandOperatingDates, localDateTimeToUtc, localTimeOf, weekdayOf } from './calendar';
import { summarizeCabins, validateClassOffers, type CabinUsage, type OfferIssue } from './capacity';
import { lastSchedulableDate, schedulingRules, type SchedulingRules } from './config';
import {
  describeConflict,
  findAircraftOverlaps,
  findDepartureGapConflicts,
  OVERLAP_MESSAGE,
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

/**
 * Solo se programa desde hoy hasta hoy + 1 año, inclusive (BUG-01 de la demo 1). Se corta
 * antes de expandir el calendario: un rango absurdo (ej. año 9999) generaria millones de fechas.
 * Tambien la usa la reprogramacion (US-11B) con desde = hasta = la nueva fecha.
 */
export function assertSchedulableRange(input: Pick<ScheduleInput, 'validFrom' | 'validTo'>, now: Date): void {
  const today = toDateInput(now);
  const last = lastSchedulableDate(today);
  const issues: OfferIssue[] = [];
  if (input.validFrom < today) {
    issues.push({ campo: 'validFrom', mensaje: 'La fecha de inicio ya paso' });
  }
  if (input.validTo > last) {
    issues.push({
      campo: 'validTo',
      mensaje: `Solo se puede programar hasta el ${formatFullDate(last)} (un año desde hoy)`,
    });
  }
  if (issues.length > 0) throw ApiError.unprocessable('Fechas fuera del rango programable', issues);
}

function contextIssues(ctx: ScheduleContext, planned: readonly PlannedFlight[], now: Date): OfferIssue[] {
  const issues: OfferIssue[] = [];
  // Solo puede pasar con un vuelo de hoy a una hora que ya paso.
  for (const p of planned.filter((f) => f.departureAt.getTime() <= now.getTime())) {
    issues.push({ campo: 'departureTime', mensaje: `${formatFullDate(p.date)}: la salida ya paso` });
  }
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

/** Choques con vuelos ya programados. `exceptFlightId`: el vuelo que se reprograma (US-11B). */
export async function findConflicts(
  db: Db,
  ctx: ScheduleContext,
  planned: readonly PlannedFlight[],
  rules: SchedulingRules,
  exceptFlightId?: string,
): Promise<ScheduleConflict[]> {
  const first = planned[0];
  const last = planned[planned.length - 1];
  if (!first || !last) return [];

  const [sameOrigin, sameAircraft] = await Promise.all([
    repo.findDeparturesFrom(
      db,
      ctx.route.originAirportId,
      { from: addMinutes(first.departureAt, -rules.gapMinutes), to: addMinutes(last.departureAt, rules.gapMinutes) },
      exceptFlightId,
    ),
    // Ventana ampliada con la rotacion: trae tambien el vuelo anterior y el siguiente.
    repo.findAircraftFlights(
      db,
      ctx.aircraft.id,
      {
        from: addMinutes(first.departureAt, -rules.turnaroundMinutes),
        to: addMinutes(last.arrivalAt, rules.turnaroundMinutes),
      },
      exceptFlightId,
    ),
  ]);

  return [
    ...findDepartureGapConflicts(planned, sameOrigin, rules.gapMinutes),
    ...findAircraftOverlaps(planned, sameAircraft, rules.turnaroundMinutes),
  ];
}

async function evaluate(db: Db, input: ScheduleInput, now: Date): Promise<Evaluation> {
  assertSchedulableRange(input, now);
  const ctx = await repo.loadScheduleContext(db, input.routeId, input.aircraftId);
  if (!ctx) throw ApiError.badRequest('La ruta o el avion indicados no existen');

  const rules = schedulingRules();
  const planned = planFlights(input, ctx.route.durationMinutes);
  const conflicts = await findConflicts(db, ctx, planned, rules);
  const issues = [
    ...contextIssues(ctx, planned, now),
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
      conflicts: conflicts.map((c) => ({ ...c, message: describeConflict(c, rules) })),
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
    throw ApiError.conflict(OVERLAP_MESSAGE, view.conflicts);
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
