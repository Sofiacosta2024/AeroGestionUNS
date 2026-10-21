/**
 * Formateo compartido entre el servidor y el cliente.
 * Mantiene los importes con el mismo formato que usaba el HTML original
 * (Intl es identical en Node y en el navegador).
 */
import { toFormattableDate } from './dates';

const TZ = 'America/Argentina/Buenos_Aires';

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function formatArs(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return ARS.format(Number.isFinite(n) ? n : 0);
}

/** Cotizaciones y comprobantes: conservar centavos pactados sin alterar el formato histórico del sitio. */
export function formatExactArs(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Number.isFinite(amount) ? amount : 0);
}

const AMOUNT_INPUT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** 64200.5 -> "64.200,5": importe editable en un campo de texto (US-11A). */
export function formatAmountInput(value: number): string {
  return AMOUNT_INPUT.format(value);
}

/**
 * Importe escrito a mano en formato es-AR -> number (NaN si no es un importe valido).
 * - Con coma: los puntos son de miles y la coma es decimal ("64.200,50" -> 64200.5).
 * - Sin coma: puntos seguidos de 3 cifras son de miles ("64.200" -> 64200); un unico
 *   punto con 1 o 2 cifras es decimal ("64200.5" -> 64200.5).
 * Hasta 2 decimales, como la columna `price` (Decimal 12,2).
 */
export function parseAmountInput(raw: string): number {
  const text = raw.trim();
  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(text) || /^\d+(,\d{1,2})?$/.test(text)) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+(\.\d{1,2})?$/.test(text)) {
    normalized = text;
  }
  return normalized === null ? NaN : Number(normalized);
}

/** "1h 10m" a partir de la duracion en minutos. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes && minutes !== 0) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 06:45 en UTC-3 (America/Argentina/Buenos_Aires). */
export function formatTime(date: Date | string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(toFormattableDate(date, timeZone));
}

/** "Mar 18 Nov" */
export function formatDayMonth(date: Date | string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  })
    .format(toFormattableDate(date, timeZone))
    .replace(/\./g, '')
    .replace(/^./, (c) => c.toUpperCase());
}

/** "Martes" */
export function formatWeekday(date: Date | string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone }).format(
    toFormattableDate(date, timeZone),
  );
}

/** "18 Nov 2025" */
export function formatFullDate(date: Date | string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(toFormattableDate(date, timeZone));
}

/** yyyy-mm-dd en la zona indicada (para armar query strings). */
export function toDateInput(date: Date, timeZone = TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(toFormattableDate(date, timeZone));
}
