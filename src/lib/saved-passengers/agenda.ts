import type { DocumentType } from '@prisma/client';
import { documentKey } from '@/lib/passenger-form';

/**
 * Regla de la agenda de pasajeros guardados (US-16). Funciones puras.
 *
 * - Un documento (tipo + numero) figura una sola vez por cuenta.
 * - Si el pasajero ya esta, se actualizan sus datos con los ultimos y su `lastUsedAt`.
 * - Si es nuevo y la agenda ya tiene `MAX_SAVED_PASSENGERS`, reemplaza al de `lastUsedAt`
 *   mas viejo (nunca a uno de la compra actual).
 */

export const MAX_SAVED_PASSENGERS = 20;

export type SavedPassengerData = {
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  /** null: el canal no la pidio. Al actualizar no borra la fecha ya guardada. */
  birthDate: Date | null;
};

/** Lo que hace falta de cada pasajero ya guardado para planificar. */
export type AgendaEntry = { id: string; documentType: DocumentType; documentNumber: string; lastUsedAt: Date };

export type AgendaPlan = {
  updates: { id: string; data: SavedPassengerData }[];
  creates: SavedPassengerData[];
  /** Ids a borrar para no pasar el tope: los de uso mas viejo. */
  removals: string[];
};

const keyOf = (p: { documentType: DocumentType; documentNumber: string }) => documentKey(p.documentType, p.documentNumber);

export function planAgendaUpdate(
  existing: readonly AgendaEntry[],
  incoming: readonly SavedPassengerData[],
  max: number = MAX_SAVED_PASSENGERS,
): AgendaPlan {
  // El mismo documento dos veces en una compra: queda el ultimo.
  const unique = [...new Map(incoming.map((p) => [keyOf(p), p])).values()];
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));

  const updates = unique.flatMap((data) => {
    const entry = byKey.get(keyOf(data));
    return entry ? [{ id: entry.id, data }] : [];
  });
  // Nunca mas nuevos que el tope (una compra tiene hasta 9, pero la regla no lo asume).
  const creates = unique.filter((data) => !byKey.has(keyOf(data))).slice(0, max);

  const touched = new Set(updates.map((u) => u.id));
  const overflow = existing.length + creates.length - max;
  const removals =
    overflow > 0
      ? existing
          .filter((e) => !touched.has(e.id))
          .sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime())
          .slice(0, overflow)
          .map((e) => e.id)
      : [];

  return { updates, creates, removals };
}

/** Mensaje literal de la US-16 al dar de alta a mano un documento que ya esta guardado. */
export function duplicateSavedPassengerMessage(fullName: string): string {
  return `El DNI/Pasaporte ingresado ya corresponde a ${fullName} en tu lista de pasajeros guardados.`;
}
