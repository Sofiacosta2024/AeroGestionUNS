/**
 * Parametros de la programacion de vuelos (RF-01).
 *
 * Los fijan los planificadores y pueden cambiar, por eso se leen de variables de entorno:
 * - `MIN_DEPARTURE_GAP_MINUTES` (20 por defecto): minutos minimos entre dos salidas del
 *   mismo aeropuerto.
 * - `MIN_TURNAROUND_MINUTES` (120 por defecto): minutos minimos entre el aterrizaje de un
 *   avion y su proximo despegue (desembarque, combustible, etc.). El avion puede despegar
 *   desde cualquier aeropuerto: se asume que vuelve vacio si hace falta.
 */

const DEFAULT_DEPARTURE_GAP_MINUTES = 20;
const DEFAULT_TURNAROUND_MINUTES = 120;

/** Vigencia maxima de un cronograma, en dias corridos (desde y hasta inclusive). */
export const MAX_VALIDITY_DAYS = 366;

export type SchedulingRules = {
  /** Minutos minimos entre dos salidas del mismo aeropuerto. */
  gapMinutes: number;
  /** Minutos minimos entre el aterrizaje de un avion y su siguiente despegue. */
  turnaroundMinutes: number;
};

function readMinutes(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} debe ser un entero >= 0 (recibido: "${raw}")`);
  }
  return value;
}

export function schedulingRules(): SchedulingRules {
  return {
    gapMinutes: readMinutes('MIN_DEPARTURE_GAP_MINUTES', DEFAULT_DEPARTURE_GAP_MINUTES),
    turnaroundMinutes: readMinutes('MIN_TURNAROUND_MINUTES', DEFAULT_TURNAROUND_MINUTES),
  };
}
