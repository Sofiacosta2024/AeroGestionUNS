/**
 * US-14B v2.0: estados de reserva en gestión por contingencia.
 *
 * Mientras la aerolínea gestiona la cancelación de un vuelo (US-12B), el
 * pasajero no puede reprogramar su reserva de forma autónoma: la propuesta,
 * el cambio o la cancelación los resuelve el administrador. Este módulo no
 * importa Prisma para poder usarse tanto en el servidor como en el cliente.
 */
export const CONTINGENCY_BOOKING_STATUSES = [
  'REPROGRAMACION_PENDIENTE',
  'REASIGNACION_PROPUESTA',
  'SIN_ALTERNATIVA',
] as const;

export type ContingencyBookingStatus = (typeof CONTINGENCY_BOOKING_STATUSES)[number];

/** Mensaje literal exigido por US-14B v2.0. */
export const CONTINGENCY_REPROGRAMMING_MESSAGE =
  'Tu reserva está siendo gestionada por la aerolínea por la cancelación de tu vuelo. Comunicate con Atención prioritaria al 0800-555-0199.';

const CONTINGENCY_STATUS_SET = new Set<string>(CONTINGENCY_BOOKING_STATUSES);

/**
 * Indica si el estado de una reserva la deja bajo gestión por contingencia.
 * Tolera mayúsculas, minúsculas y espacios exteriores para no depender de la
 * forma exacta en que llegue el estado desde la base o desde la API.
 */
export function isContingencyBookingStatus(status: string | null | undefined): boolean {
  if (typeof status !== 'string') return false;
  const normalized = status.trim().toUpperCase();
  return normalized !== '' && CONTINGENCY_STATUS_SET.has(normalized);
}
