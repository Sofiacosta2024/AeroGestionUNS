/**
 * Deteccion de conflictos de horario (RF-01, US1 criterio 3).
 *
 * Funciones puras: reciben los vuelos a crear y los vuelos existentes relevantes, y
 * devuelven la lista de conflictos. La consulta de los vuelos existentes vive en el
 * repositorio; aca solo esta la regla.
 */

import { formatDuration } from '@/lib/format';
import type { SchedulingRules } from './config';

/** Un vuelo que generaria el cronograma. */
export type PlannedFlight = {
  /** Fecha local de operacion (yyyy-mm-dd). */
  date: string;
  departureAt: Date;
  arrivalAt: Date;
};

/** Un vuelo ya programado contra el que se compara. */
export type ScheduledFlight = {
  code: string;
  departureAt: Date;
  arrivalAt: Date;
};

export type ConflictKind = 'PAST_DEPARTURE' | 'DEPARTURE_GAP' | 'AIRCRAFT_BUSY';

export type ScheduleConflict = {
  kind: ConflictKind;
  /** Fecha local del vuelo planificado que choca. */
  date: string;
  /** Vuelo existente con el que choca (no aplica a PAST_DEPARTURE). */
  conflictingFlightCode?: string;
};

const MINUTE_MS = 60_000;

/** Salidas que ya pasaron (o salen justo ahora): no se pueden programar. */
export function findPastDepartures(planned: readonly PlannedFlight[], now: Date): ScheduleConflict[] {
  return planned
    .filter((p) => p.departureAt.getTime() <= now.getTime())
    .map((p) => ({ kind: 'PAST_DEPARTURE', date: p.date }));
}

/**
 * Salidas a menos de `gapMinutes` de otra salida del mismo aeropuerto de origen.
 * Exactamente `gapMinutes` de diferencia esta permitido.
 */
export function findDepartureGapConflicts(
  planned: readonly PlannedFlight[],
  sameOriginFlights: readonly ScheduledFlight[],
  gapMinutes: number,
): ScheduleConflict[] {
  const gapMs = gapMinutes * MINUTE_MS;
  return planned.flatMap((p) =>
    sameOriginFlights
      .filter((f) => Math.abs(f.departureAt.getTime() - p.departureAt.getTime()) < gapMs)
      .map((f) => ({ kind: 'DEPARTURE_GAP' as const, date: p.date, conflictingFlightCode: f.code })),
  );
}

/**
 * Vuelos del mismo avion que no dejan el tiempo minimo de rotacion: entre el aterrizaje
 * de un vuelo y el despegue del siguiente tienen que pasar al menos `turnaroundMinutes`,
 * tanto respecto del vuelo anterior como del siguiente. Equivale a ampliar cada intervalo
 * [salida, llegada) con la rotacion y buscar superposiciones (incluye el solapamiento
 * directo). El avion puede salir desde cualquier aeropuerto.
 */
export function findAircraftOverlaps(
  planned: readonly PlannedFlight[],
  sameAircraftFlights: readonly ScheduledFlight[],
  turnaroundMinutes: number,
): ScheduleConflict[] {
  const turnaroundMs = turnaroundMinutes * MINUTE_MS;
  return planned.flatMap((p) =>
    sameAircraftFlights
      .filter(
        (f) =>
          p.departureAt.getTime() < f.arrivalAt.getTime() + turnaroundMs &&
          f.departureAt.getTime() < p.arrivalAt.getTime() + turnaroundMs,
      )
      .map((f) => ({ kind: 'AIRCRAFT_BUSY' as const, date: p.date, conflictingFlightCode: f.code })),
  );
}

const CONFLICT_MESSAGES: Record<ConflictKind, (c: ScheduleConflict, rules: SchedulingRules) => string> = {
  PAST_DEPARTURE: (c) => `${c.date}: la salida ya paso`,
  DEPARTURE_GAP: (c, rules) =>
    `${c.date}: sale a menos de ${rules.gapMinutes} min del vuelo ${c.conflictingFlightCode} desde el mismo aeropuerto`,
  AIRCRAFT_BUSY: (c, rules) =>
    `${c.date}: el avion tiene el vuelo ${c.conflictingFlightCode} y necesita al menos ` +
    `${formatDuration(rules.turnaroundMinutes)} entre un aterrizaje y el siguiente despegue`,
};

export function describeConflict(conflict: ScheduleConflict, rules: SchedulingRules): string {
  return CONFLICT_MESSAGES[conflict.kind](conflict, rules);
}
