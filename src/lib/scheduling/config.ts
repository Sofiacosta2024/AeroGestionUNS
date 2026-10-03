/**
 * Parametros de la programacion de vuelos (RF-01).
 *
 * El margen entre salidas del mismo aeropuerto lo fijan los planificadores y puede
 * cambiar, por eso se lee de `MIN_DEPARTURE_GAP_MINUTES` (20 por defecto).
 */

const DEFAULT_DEPARTURE_GAP_MINUTES = 20;

/** Vigencia maxima de un cronograma, en dias corridos (desde y hasta inclusive). */
export const MAX_VALIDITY_DAYS = 366;

export function minDepartureGapMinutes(): number {
  const raw = process.env.MIN_DEPARTURE_GAP_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DEPARTURE_GAP_MINUTES;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`MIN_DEPARTURE_GAP_MINUTES debe ser un entero >= 0 (recibido: "${raw}")`);
  }
  return value;
}
