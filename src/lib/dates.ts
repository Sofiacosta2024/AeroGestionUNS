/**
 * Utilidades de fecha pensadas para las zona horaria de la operacion (ART, UTC-3).
 *
 * Los horarios de la interfaz son locales de Bahia Blanca, no UTC. Por eso los
 * filtros por fecha se traducen a instantes UTC antes de tocar la base: asi
 * "vuelos del 18 Nov" incluye el vuelo de las 06:45 ART.
 */

export const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

function tzOffsetMinutes(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(utcDate)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUtc - utcDate.getTime()) / 60_000;
}

/**
 * Rango [desde, hasta) en UTC que corresponde al dia local `yyyy-mm-dd`.
 * "hasta" es exclusivo: evita solapamiento entre dias consecutivos.
 */
export function localDayRangeUtc(
  dateStr: string,
  timeZone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error(`Fecha invalida: ${dateStr}`);
  }
  // Aproximacion en UTC de la medianoche local, corregida con el offset real.
  const approx = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = tzOffsetMinutes(approx, timeZone);
  const start = new Date(approx.getTime() - offset * 60_000);

  // Fin: medianoche del dia siguiente, recalculando el offset por si hubo DST.
  const approxNext = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const offsetNext = tzOffsetMinutes(approxNext, timeZone);
  const end = new Date(approxNext.getTime() - offsetNext * 60_000);

  return { start, end };
}

/** Instante UTC de la hora local HH:mm del dia local yyyy-mm-dd. */
export function localTimeUtc(dateStr: string, hhmm: string, timeZone = DEFAULT_TIMEZONE): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const start = localDayRangeUtc(dateStr, timeZone).start;
  return new Date(start.getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

/** Convierte 'yyyy-mm-dd' o un ISO completo a un rango UTC de inclusividad dada. */
export function toUtcRange(
  from?: string | null,
  to?: string | null,
  timeZone = DEFAULT_TIMEZONE,
): { gte?: Date; lt?: Date } {
  const out: { gte?: Date; lt?: Date } = {};
  if (from) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(from);
    const range = localDayRangeUtc(from.slice(0, 10), timeZone);
    out.gte = isDateOnly ? range.start : new Date(from);
    if (to === undefined && isDateOnly) out.lt = range.end;
  }
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      out.lt = localDayRangeUtc(to, timeZone).end;
    } else {
      out.lt = new Date(to);
    }
  }
  return out;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Instante del MEDIODIA local de `yyyy-mm-dd`.
 *
 * `new Date('2025-11-18')` es la medianoche UTC, que en ART (UTC-3) cae el dia
 * 17. Para formatear un dia "a secas" hay que partir del dia local, no del
 * instante UTC.
 */
export function localNoonUtc(dateStr: string, timeZone = DEFAULT_TIMEZONE): Date {
  return new Date(localDayRangeUtc(dateStr, timeZone).start.getTime() + 12 * 3_600_000);
}

/** Domingo a sábado de la semana local que contiene `yyyy-mm-dd` (como yyyy-mm-dd). */
export function localWeekDays(dateStr: string, timeZone = DEFAULT_TIMEZONE): string[] {
  // El mediodia local cae siempre en el mismo dia de la semana que el instante
  // UTC (ningun offset del mundo pasa las 12h), asi que getUTCDay sirve.
  const noon = localNoonUtc(dateStr, timeZone);
  const sundayOffset = noon.getUTCDay();
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(noon.getTime() - sundayOffset * 86_400_000 + i * 86_400_000);
    return day.toISOString().slice(0, 10);
  });
}

/** ¿Es este valor una fecha sin hora (yyyy-mm-dd)? */
export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Normaliza a Date para formatear: los `yyyy-mm-dd` se anclan al mediodia local
 * (ver `localNoonUtc`); los ISO con hora se usan tal cual.
 */
export function toFormattableDate(value: Date | string, timeZone = DEFAULT_TIMEZONE): Date {
  if (typeof value === 'string' && isDateOnly(value)) return localNoonUtc(value, timeZone);
  return new Date(value);
}

export function startOfLocalWeek(date: Date, timeZone = DEFAULT_TIMEZONE): Date {
  // Domingo de la semana local (la UI muestra "Dom 16 ... Sab 22").
  const localDay = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(localDay);
  const shift = index === -1 ? 0 : index;
  const approx = new Date(date);
  approx.setUTCDate(approx.getUTCDate() - shift);
  const offset = tzOffsetMinutes(approx, timeZone);
  const localMidnight = new Date(
    Date.UTC(approx.getUTCFullYear(), approx.getUTCMonth(), approx.getUTCDate()) - offset * 60_000,
  );
  return localMidnight;
}
