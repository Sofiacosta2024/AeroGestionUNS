import { AircraftStatus, FlightStatus, type Prisma } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { toDateInput } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import type { RescheduleInput } from '@/lib/validation';
import { addMinutes, localDateTimeToUtc, localTimeOf } from './calendar';
import { CABIN_LABEL, classLoadOf, fitClassesToCabins, type OfferIssue } from './capacity';
import { schedulingRules } from './config';
import { OVERLAP_MESSAGE, type PlannedFlight, type ScheduleConflict } from './conflicts';
import * as repo from './repository';
import type { FlightToReschedule } from './repository';
import { assertSchedulableRange, findConflicts, type ConflictView } from './service';

/**
 * Reprogramacion de un vuelo publicado (US-11B): nueva fecha, hora de salida, ruta o avion.
 *
 * Valida con las mismas reglas que el alta (RF-01) sin contar al propio vuelo. La llegada
 * se calcula con la duracion de la ruta. La ruta solo cambia si no hay reservas activas y
 * el avion solo si no hay asientos asignados ni bloqueados; al cambiar de avion, lo
 * ofrecido por clase se ajusta a sus cabinas (`fitClassesToCabins`).
 */

type Db = Prisma.TransactionClient;

const RESCHEDULABLE: readonly FlightStatus[] = [FlightStatus.SCHEDULED, FlightStatus.DELAYED];

/** Solo vuelos programados o demorados que todavia no salieron. */
export function isReschedulable(flight: { status: FlightStatus; departureAt: Date }, now: Date): boolean {
  return RESCHEDULABLE.includes(flight.status) && flight.departureAt.getTime() > now.getTime();
}

/** Avion ocupado: mensaje literal de la US-11B. Margen entre salidas: el mismo del alta (BUG-02). */
export function describeRescheduleConflict(c: ScheduleConflict): string {
  if (c.kind !== 'AIRCRAFT_BUSY') return OVERLAP_MESSAGE;
  return (
    `La aeronave seleccionada ya tiene un vuelo asignado entre las ` +
    `${localTimeOf(c.conflictingDepartureAt)} y las ${localTimeOf(c.conflictingArrivalAt)} hs.`
  );
}

export type ClassChange = {
  fareId: string;
  name: string;
  sold: number;
  capacity: number;
  /** Igual a `capacity` salvo que el avion nuevo no tenga lugar para lo ofrecido. */
  newCapacity: number;
};

/** Resultado del chequeo en vivo de la pantalla de reprogramacion. */
export type RescheduleEvaluation = {
  /** false si el pedido deja el vuelo como esta. */
  changed: boolean;
  departureAt: string;
  arrivalAt: string;
  /** Hora y fecha local de llegada (la fecha puede ser el dia siguiente). */
  arrivalTime: string;
  arrivalDate: string;
  durationMinutes: number;
  /** Pasajeros de reservas activas: los que reciben la reprogramacion. */
  affectedPassengers: number;
  classes: ClassChange[];
  conflicts: ConflictView[];
  issues: OfferIssue[];
  canSave: boolean;
};

type Evaluation = { view: RescheduleEvaluation; flight: FlightToReschedule; planned: PlannedFlight };

async function evaluate(db: Db, flightId: string, input: RescheduleInput, now: Date): Promise<Evaluation> {
  const flight = await repo.findFlightToReschedule(db, flightId);
  if (!flight) throw ApiError.notFound('Vuelo no encontrado');
  if (!isReschedulable(flight, now)) {
    throw ApiError.conflict('Solo se pueden reprogramar vuelos programados o demorados que todavía no salieron');
  }
  assertSchedulableRange({ validFrom: input.date, validTo: input.date }, now);

  const ctx = await repo.loadScheduleContext(db, input.routeId, input.aircraftId);
  if (!ctx) throw ApiError.badRequest('La ruta o el avion indicados no existen');

  const departureAt = localDateTimeToUtc(input.date, input.departureTime);
  const planned = { date: input.date, departureAt, arrivalAt: addMinutes(departureAt, ctx.route.durationMinutes) };
  const routeChanged = input.routeId !== flight.routeId;
  const aircraftChanged = input.aircraftId !== flight.aircraftId;
  const changed = routeChanged || aircraftChanged || departureAt.getTime() !== flight.departureAt.getTime();

  const [conflicts, load] = await Promise.all([
    findConflicts(db, ctx, [planned], schedulingRules(), flight.id),
    repo.countFlightBookings(db, flight.id, now),
  ]);
  // Cambio US-11A: el calculo de vendidos por clase paso a capacity.ts (`classLoadOf`) para compartirlo.
  const loads = flight.fares.map(classLoadOf);
  const fit = aircraftChanged ? fitClassesToCabins(loads, ctx.cabinSeats) : null;

  const issues: OfferIssue[] = [];
  if (departureAt.getTime() <= now.getTime()) {
    issues.push({ campo: 'departureTime', mensaje: 'La salida ya pasó' });
  }
  if (routeChanged && !ctx.route.isActive) {
    issues.push({ campo: 'routeId', mensaje: 'La ruta esta inactiva' });
  }
  if (routeChanged && load.bookings > 0) {
    issues.push({
      campo: 'routeId',
      mensaje: `No se puede cambiar la ruta: el vuelo tiene ${load.bookings} ${load.bookings === 1 ? 'reserva activa' : 'reservas activas'}`,
    });
  }
  if (aircraftChanged && ctx.aircraft.status !== AircraftStatus.ACTIVE) {
    issues.push({ campo: 'aircraftId', mensaje: `El avion ${ctx.aircraft.registration} no esta operativo` });
  }
  if (aircraftChanged && load.seatsTaken > 0) {
    issues.push({ campo: 'aircraftId', mensaje: 'No se puede cambiar el avión: el vuelo tiene asientos asignados o bloqueados' });
  }
  for (const s of fit?.shortfalls ?? []) {
    issues.push({
      campo: 'aircraftId',
      mensaje: `El avión nuevo tiene ${s.seats} asientos en la cabina ${CABIN_LABEL[s.cabinClass]} y ya hay ${s.sold} vendidos`,
    });
  }

  return {
    flight,
    planned,
    view: {
      changed,
      departureAt: planned.departureAt.toISOString(),
      arrivalAt: planned.arrivalAt.toISOString(),
      arrivalTime: localTimeOf(planned.arrivalAt),
      arrivalDate: toDateInput(planned.arrivalAt),
      durationMinutes: ctx.route.durationMinutes,
      affectedPassengers: load.passengers,
      classes: flight.fares.map((f, i) => ({
        fareId: f.fareId,
        name: f.fare.name,
        sold: loads[i]!.sold,
        capacity: loads[i]!.capacity,
        newCapacity: fit?.capacities.get(f.fareId) ?? loads[i]!.capacity,
      })),
      conflicts: conflicts.map((c) => ({ ...c, message: describeRescheduleConflict(c) })),
      issues,
      canSave: changed && conflicts.length === 0 && issues.length === 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

/** Vuelo tal como esta, para precargar la pantalla de reprogramacion. */
export type FlightItinerary = {
  id: string;
  code: string;
  status: FlightStatus;
  reschedulable: boolean;
  current: RescheduleInput;
  arrivalTime: string;
  route: { code: string; origin: string; destination: string };
  aircraft: { registration: string; model: string };
};

export async function getFlightItinerary(flightId: string): Promise<FlightItinerary | null> {
  const flight = await repo.findFlightToReschedule(prisma, flightId);
  if (!flight) return null;
  return {
    id: flight.id,
    code: flight.code,
    status: flight.status,
    reschedulable: isReschedulable(flight, new Date()),
    current: {
      routeId: flight.routeId,
      aircraftId: flight.aircraftId,
      date: toDateInput(flight.departureAt),
      departureTime: localTimeOf(flight.departureAt),
    },
    arrivalTime: localTimeOf(flight.arrivalAt),
    route: {
      code: flight.route.code,
      origin: flight.route.originAirportId,
      destination: flight.route.destinationAirportId,
    },
    aircraft: flight.aircraft,
  };
}

/** Chequeo en vivo: no guarda nada. */
export async function checkReschedule(flightId: string, input: RescheduleInput): Promise<RescheduleEvaluation> {
  return (await evaluate(prisma, flightId, input, new Date())).view;
}

type ItinerarySnapshot = { routeId: string; aircraftId: string; departureAt: string; arrivalAt: string };

export type RescheduleResult = {
  flightId: string;
  code: string;
  /** Fecha local de la nueva salida (para volver a la planilla de ese dia). */
  date: string;
  before: ItinerarySnapshot;
  after: ItinerarySnapshot;
  affectedPassengers: number;
  /** Clases cuya capacidad se ajusto al avion nuevo. */
  resizedClasses: ClassChange[];
};

/**
 * Guarda la reprogramacion. Revalida dentro de la transaccion con el mismo lock que la
 * publicacion de cronogramas y con el vuelo bloqueado, asi una compra simultanea (RF-03)
 * no descuenta asientos a mitad del cambio.
 */
export async function rescheduleFlight(flightId: string, input: RescheduleInput): Promise<RescheduleResult> {
  return prisma.$transaction(
    async (tx) => {
      await repo.lockScheduling(tx);
      await repo.lockFlight(tx, flightId);
      const { view, flight, planned } = await evaluate(tx, flightId, input, new Date());

      if (!view.changed) throw ApiError.badRequest('No hay cambios para guardar');
      if (view.issues.length > 0) throw ApiError.unprocessable('El vuelo no se puede reprogramar', view.issues);
      const conflict = view.conflicts[0];
      if (conflict) throw ApiError.conflict(conflict.message, view.conflicts);

      const resizedClasses = view.classes.filter((c) => c.newCapacity !== c.capacity);
      const rowOf = new Map(flight.fares.map((f) => [f.fareId, f.id]));
      await repo.applyReschedule(
        tx,
        flight.id,
        { routeId: input.routeId, aircraftId: input.aircraftId, departureAt: planned.departureAt, arrivalAt: planned.arrivalAt },
        resizedClasses.map((c) => ({
          id: rowOf.get(c.fareId)!,
          seatCapacity: c.newCapacity,
          availableSeats: c.newCapacity - c.sold,
        })),
      );

      return {
        flightId: flight.id,
        code: flight.code,
        date: input.date,
        before: {
          routeId: flight.routeId,
          aircraftId: flight.aircraftId,
          departureAt: flight.departureAt.toISOString(),
          arrivalAt: flight.arrivalAt.toISOString(),
        },
        after: { routeId: input.routeId, aircraftId: input.aircraftId, departureAt: view.departureAt, arrivalAt: view.arrivalAt },
        affectedPassengers: view.affectedPassengers,
        resizedClasses,
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/**
 * Para el endpoint previo `PATCH /api/flights/:id`: completa lo que no viene con el
 * itinerario actual y reprograma solo si algo cambia. null si no hay nada que reprogramar.
 */
export async function applyItineraryPatch(
  flightId: string,
  patch: { routeId?: string; aircraftId?: string; departureAt?: Date },
): Promise<RescheduleResult | null> {
  const flight = await getFlightItinerary(flightId);
  if (!flight) throw ApiError.notFound('Vuelo no encontrado');

  const { current } = flight;
  const next: RescheduleInput = {
    routeId: patch.routeId ?? current.routeId,
    aircraftId: patch.aircraftId ?? current.aircraftId,
    date: patch.departureAt ? toDateInput(patch.departureAt) : current.date,
    departureTime: patch.departureAt ? localTimeOf(patch.departureAt) : current.departureTime,
  };
  const moves = (Object.keys(next) as (keyof RescheduleInput)[]).some((k) => next[k] !== current[k]);
  return moves ? rescheduleFlight(flightId, next) : null;
}
