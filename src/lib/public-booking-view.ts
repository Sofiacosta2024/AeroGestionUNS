import { formatDayMonth, formatTime } from './format';

/**
 * Logica de presentacion de la consulta publica de reservas (US-14A).
 *
 * Todo lo que decide *que* se muestra (etiquetas de estado, clase de cabina,
 * asiento, documento y horarios) vive aca, fuera del componente, para poder
 * probarlo sin un DOM. El componente se limita a componer markup accesible.
 *
 * Las funciones aceptan `null`/`undefined` y valores inesperados: la respuesta
 * del backend puede omitir campos opcionales (horarios, asiento, documento) y
 * la vista debe renderizar igual, sin lanzar ni mostrar datos falsos.
 */

export type BookingTone = 'ok' | 'warn' | 'bad' | 'info';

/**
 * Respuesta publica del endpoint (`toPublicBookingView` en `public-booking.ts`).
 * Se redeclara aca para no importar el modulo del servidor (que depende de
 * `next/server` y Prisma) desde el bundle del navegador. La forma es estructural,
 * por lo que sigue siendo compatible con el DTO real.
 *
 * Los campos que el backend garantiza como presentes se dejan obligatorios; los
 * opcionales (horarios, tarifa, asiento, documento) son anulables.
 */
export type PublicBookingView = {
  bookingCode: string;
  status: string;
  tripType: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  createdAt: string | null;
  flights: Array<{
    flightCode: string;
    origin: { iataCode: string; city: string; name: string } | null;
    destination: { iataCode: string; city: string; name: string } | null;
    departureAt: string | null;
    arrivalAt: string | null;
    status: string;
    isReturn: boolean;
    price: number;
    fare: { name: string; cabinClass: string } | null;
  }>;
  passengers: Array<{
    firstName: string;
    lastName: string;
    documentType: string | null;
    documentNumber: string | null;
    seatNumber: string | null;
    checkInStatus: string | null;
  }>;
};

const STATUS_PRESENTATION: Record<string, { label: string; tone: BookingTone }> = {
  PENDING: { label: 'Pago pendiente', tone: 'warn' },
  CONFIRMED: { label: 'Compra confirmada', tone: 'ok' },
  PAID: { label: 'Compra pagada', tone: 'ok' },
  BOARDED: { label: 'Embarque realizado', tone: 'info' },
  CANCELLED: { label: 'Reserva cancelada', tone: 'bad' },
  COMPLETED: { label: 'Vuelo completado', tone: 'info' },
  NO_SHOW: { label: 'Pasajero ausente', tone: 'bad' },
};

const CABIN_LABELS: Record<string, string> = {
  ECONOMY: 'Economy',
  PREMIUM: 'Premium',
  BUSINESS: 'Business',
  FIRST: 'First',
};

const UNKNOWN_STATUS = 'Estado no disponible';
const ASSIGN_LATER = 'A asignar';
const NO_DATA = '—';

/** Etiqueta corta de cada tono (se combina con las clases en el componente). */
export const TONE_LABELS: Record<BookingTone, string> = {
  ok: 'success',
  warn: 'warning',
  bad: 'error',
  info: 'info',
};

/** Estado de compra legible; ignora mayusculas y cae a un texto neutro. */
export function bookingStatusPresentation(status: string | null | undefined): {
  label: string;
  tone: BookingTone;
} {
  if (typeof status !== 'string' || status.trim() === '') {
    return { label: UNKNOWN_STATUS, tone: 'info' };
  }
  const key = status.trim().toUpperCase();
  return STATUS_PRESENTATION[key] ?? { label: status.trim(), tone: 'info' };
}

/** Etiqueta de clase de cabina; devuelve el valor crudo si no lo conocemos. */
export function cabinClassLabel(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') return NO_DATA;
  const key = value.trim().toUpperCase();
  return CABIN_LABELS[key] ?? value.trim();
}

/** Asiento asignado; si todavia no hay asiento lo indica explicitamente. */
export function passengerSeatLabel(seatNumber: string | null | undefined): string {
  if (typeof seatNumber !== 'string' || seatNumber.trim() === '') return ASSIGN_LATER;
  return seatNumber.trim();
}

/** "Asiento 12A" para etiquetas accesibles. */
export function passengerSeatAria(seatNumber: string | null | undefined): string {
  const label = passengerSeatLabel(seatNumber);
  return label === ASSIGN_LATER ? 'Asiento sin asignar' : `Asiento ${label}`;
}

/**
 * Documento de identidad para la vista publica. El backend solo envia el numero
 * enmascarado; si no viene nada (campo opcional ausente) devuelve `null` para
 * que la interfaz omita la celda en lugar de mostrar un valor vacio.
 */
export function passengerDocumentLabel(
  documentType: string | null | undefined,
  documentNumber: string | null | undefined,
): string | null {
  const number = typeof documentNumber === 'string' ? documentNumber.trim() : '';
  if (number === '') return null;
  const type = typeof documentType === 'string' ? documentType.trim() : '';
  return type === '' ? number : `${type} ${number}`;
}

function parseValidDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type FlightSchedule = {
  /** "Mar 18 Nov" o "Fecha a confirmar". */
  date: string;
  /** "06:45 → 07:55", "06:45" o "Horario a confirmar". */
  time: string;
  /** true solo cuando salida y llegada existen y son validas. */
  complete: boolean;
};

/**
 * Fecha y hora del vuelo tolerante a datos faltantes o invalidos. Nunca lanza:
 * los formateadores lanzan con `Invalid Date`, por lo que se valida antes.
 */
export function flightSchedule(
  departureAt: string | null | undefined,
  arrivalAt: string | null | undefined,
): FlightSchedule {
  const departure = parseValidDate(departureAt);
  const arrival = parseValidDate(arrivalAt);

  if (!departure && !arrival) {
    return { date: 'Fecha a confirmar', time: 'Horario a confirmar', complete: false };
  }

  const reference = departure ?? arrival;
  const date = formatDayMonth(reference as Date);

  const start = departure ? formatTime(departure) : null;
  const end = arrival ? formatTime(arrival) : null;

  if (start && end) return { date, time: `${start} → ${end}`, complete: true };
  if (start) return { date, time: start, complete: false };
  return { date, time: `Llegada ${end}`, complete: false };
}

/** "AG-1420 · BHI → AEP" tolerando campos faltantes. */
export function flightRouteLabel(flight: {
  flightCode?: string | null;
  origin?: { iataCode?: string | null } | null;
  destination?: { iataCode?: string | null } | null;
}): string {
  const code = typeof flight.flightCode === 'string' && flight.flightCode.trim() !== ''
    ? flight.flightCode.trim()
    : 'Vuelo';
  const origin = airportCode(flight.origin);
  const destination = airportCode(flight.destination);
  return `${code} · ${origin} → ${destination}`;
}

function airportCode(airport: { iataCode?: string | null } | null | undefined): string {
  const code = airport && typeof airport.iataCode === 'string' ? airport.iataCode.trim() : '';
  return code === '' ? NO_DATA : code;
}

/** Nombre completo del pasajero (" " si ambos campos estan vacios). */
export function passengerName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part !== '')
    .join(' ');
}
