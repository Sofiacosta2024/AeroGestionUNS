import { randomInt } from 'node:crypto';

/** Codigo de reserva publico: AG-7F3K9Q (sin caracteres ambiguos: 0/O, 1/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBookingCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `AG-${suffix}`;
}

/** Codigo de check-in / pase de abordaje. */
export function generateShortCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Etiqueta numerica de equipaje. */
export function generateBaggageTag(): string {
  return String(randomInt(0, 1_000_000_000)).padStart(10, '0');
}
