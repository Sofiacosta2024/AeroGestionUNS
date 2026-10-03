import type { CabinClass } from '@prisma/client';

/**
 * Capacidad y precios por clase (RF-01, US2).
 *
 * Cada clase es una tarifa activa del catalogo; `cabinClass` es la cabina fisica donde se
 * sienta el pasajero. Economy y Economy Premium comparten la cabina ECONOMY, Primera Clase
 * tiene la suya (FIRST). Funciones puras.
 */

/** Lo que el admin ofrece de una clase en el cronograma. */
export type ClassOffer = {
  fareId: string;
  price: number;
  seats: number;
};

/** Una clase vendible: tarifa activa del catalogo. */
export type SellableClass = {
  id: string;
  name: string;
  cabinClass: CabinClass;
};

/** Asientos del mapa del avion, por cabina. */
export type CabinSeats = Partial<Record<CabinClass, number>>;

/** Mismo formato que los `details` de validacion de la API. */
export type OfferIssue = { campo: string; mensaje: string };

export type CabinUsage = {
  cabinClass: CabinClass;
  /** Asientos de esa cabina en el mapa del avion. */
  seats: number;
  /** Asientos ofrecidos entre todas las clases que se sientan en esa cabina. */
  assigned: number;
};

export const CABIN_LABEL: Record<CabinClass, string> = {
  ECONOMY: 'Economy',
  PREMIUM: 'Premium',
  BUSINESS: 'Business',
  FIRST: 'Primera',
};

/** Asientos ofrecidos por cabina, contra los que tiene el avion. */
export function summarizeCabins(
  offers: readonly ClassOffer[],
  classes: readonly SellableClass[],
  cabinSeats: CabinSeats,
): CabinUsage[] {
  const cabinOf = new Map(classes.map((c) => [c.id, c.cabinClass]));
  const cabins = new Set<CabinClass>(classes.map((c) => c.cabinClass));

  return [...cabins].map((cabinClass) => ({
    cabinClass,
    seats: cabinSeats[cabinClass] ?? 0,
    assigned: offers
      .filter((o) => cabinOf.get(o.fareId) === cabinClass)
      .reduce((sum, o) => sum + o.seats, 0),
  }));
}

/**
 * Valida lo que se ofrece por clase:
 * - solo clases vendibles (tarifas activas),
 * - todas las clases con asientos y precio (US2 criterio 2),
 * - por cabina, no mas asientos que los del mapa del avion (US2 criterio 1).
 */
export function validateClassOffers(
  offers: readonly ClassOffer[],
  classes: readonly SellableClass[],
  cabinSeats: CabinSeats,
): OfferIssue[] {
  const known = new Map(classes.map((c) => [c.id, c]));
  const offered = new Set(offers.map((o) => o.fareId));

  const unknownOffers: OfferIssue[] = offers.flatMap((o, i) =>
    known.has(o.fareId)
      ? []
      : [{ campo: `fares.${i}.fareId`, mensaje: 'La clase indicada no existe o no esta activa' }],
  );

  const missingClasses: OfferIssue[] = classes
    .filter((c) => !offered.has(c.id))
    .map((c) => ({ campo: 'fares', mensaje: `Falta cargar asientos y precio de ${c.name}` }));

  const overbookedCabins: OfferIssue[] = summarizeCabins(offers, classes, cabinSeats)
    .filter((u) => u.assigned > u.seats)
    .map((u) => {
      const names = classes.filter((c) => c.cabinClass === u.cabinClass).map((c) => c.name);
      const verb = names.length > 1 ? 'suman' : 'ofrece';
      return {
        campo: 'fares',
        mensaje:
          `${names.join(' + ')} ${verb} ${u.assigned} asientos y la cabina ` +
          `${CABIN_LABEL[u.cabinClass]} del avion tiene ${u.seats}`,
      };
    });

  return [...unknownOffers, ...missingClasses, ...overbookedCabins];
}
