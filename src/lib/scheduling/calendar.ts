import { DEFAULT_TIMEZONE, localDayRangeUtc } from '@/lib/dates';

/**
 * Calendario de un cronograma: que dias opera y en que instante sale cada vuelo.
 * Funciones puras: no tocan la base ni el reloj.
 */

/** 0 = domingo ... 6 = sabado (mismo criterio que `Date#getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_MS = 86_400_000;

/** `yyyy-mm-dd` -> medianoche UTC de esa fecha de calendario (sin zona horaria). */
function calendarDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Dia de la semana de una fecha de calendario `yyyy-mm-dd`. */
export function weekdayOf(date: string): Weekday {
  return calendarDay(date).getUTCDay() as Weekday;
}

/** `yyyy-mm-dd` corrido `days` dias de calendario (negativo para ir hacia atras). */
export function shiftDate(date: string, days: number): string {
  return new Date(calendarDay(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Cantidad de dias entre `from` y `to`, ambos inclusive. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((calendarDay(to).getTime() - calendarDay(from).getTime()) / DAY_MS) + 1;
}

/** Fechas (`yyyy-mm-dd`) entre `from` y `to` inclusive que caen en alguno de `weekdays`. */
export function expandOperatingDates(from: string, to: string, weekdays: readonly number[]): string[] {
  const operating = new Set(weekdays);
  const dates: string[] = [];
  for (let t = calendarDay(from).getTime(); t <= calendarDay(to).getTime(); t += DAY_MS) {
    const day = new Date(t);
    if (operating.has(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/** `HH:MM` -> minutos desde la medianoche. */
export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Instante UTC en que es la hora local `time` (HH:MM) del dia `date` (yyyy-mm-dd).
 * Argentina no aplica horario de verano, asi que medianoche local + minutos es exacto.
 */
export function localDateTimeToUtc(date: string, time: string, timeZone = DEFAULT_TIMEZONE): Date {
  const { start } = localDayRangeUtc(date, timeZone);
  return new Date(start.getTime() + minutesOfDay(time) * 60_000);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Hora local `HH:MM` de un instante. */
export function localTimeOf(instant: Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
