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

/**
 * Orden canónico de cabinas (de proa a popa / mayor jerarquía a menor).
 * Asegura consistencia en toda la UI y evita dependencia de orden no determinista en BD.
 */
export const CABIN_ORDER: readonly CabinClass[] = ['FIRST', 'BUSINESS', 'PREMIUM', 'ECONOMY'];

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
    .map((u) => ({
      campo: 'fares',
      mensaje: cabinOverflowMessage(
        classes.filter((c) => c.cabinClass === u.cabinClass).map((c) => c.name),
        u,
      ),
    }));

  return [...unknownOffers, ...missingClasses, ...overbookedCabins];
}

/** "Economy + Economy Premium suman 150 asientos y la cabina Economy del avion tiene 144". */
function cabinOverflowMessage(names: readonly string[], usage: CabinUsage): string {
  const verb = names.length > 1 ? 'suman' : 'ofrece';
  return (
    `${names.join(' + ')} ${verb} ${usage.assigned} asientos y la cabina ` +
    `${CABIN_LABEL[usage.cabinClass]} del avion tiene ${usage.seats}`
  );
}

/** Una clase de un vuelo ya publicado: lo ofrecido y lo vendido o reservado. */
export type ClassLoad = { fareId: string; cabinClass: CabinClass; capacity: number; sold: number };

/**
 * Carga de una fila de `flight_fares`: vendidos o reservados = ofrecidos - disponibles.
 * Las filas anteriores a RF-01 sin capacidad cargada se toman como sin ventas.
 */
export function classLoadOf(row: {
  fareId: string;
  seatCapacity: number | null;
  availableSeats: number;
  fare: { cabinClass: CabinClass };
}): ClassLoad {
  const capacity = row.seatCapacity ?? row.availableSeats;
  return { fareId: row.fareId, cabinClass: row.fare.cabinClass, capacity, sold: capacity - row.availableSeats };
}

/** Una clase de un vuelo publicado con la capacidad que pide el admin (US-11A). */
export type ClassEdit = ClassLoad & { name: string; newCapacity: number };

/** Mensaje literal de la US-11A. */
export function capacityBelowSoldMessage(capacity: number, sold: number): string {
  return `No se puede reducir la capacidad a ${capacity} asientos porque ya existen ${sold} pasajes vendidos en esta clase.`;
}

/** `campo` del detalle de error de la capacidad de una clase: la pantalla lo ubica por clase. */
export const capacityField = (fareId: string) => `fares.${fareId}.seatCapacity`;

/**
 * Valida la capacidad pedida por clase de un vuelo publicado (US-11A):
 * - no menos que lo vendido o reservado en la clase;
 * - por cabina, no mas que los asientos del avion. Solo se controla si la cabina sube:
 *   un vuelo anterior a RF-01 que ya se pasa del tope puede bajar o quedar igual.
 * `edits` trae todas las clases del vuelo, cambien o no, para sumar la cabina completa.
 */
export function validateClassEdits(edits: readonly ClassEdit[], cabinSeats: CabinSeats): OfferIssue[] {
  const belowSold: OfferIssue[] = edits
    .filter((e) => e.newCapacity < e.sold)
    .map((e) => ({ campo: capacityField(e.fareId), mensaje: capacityBelowSoldMessage(e.newCapacity, e.sold) }));

  const overbookedCabins: OfferIssue[] = [...new Set(edits.map((e) => e.cabinClass))].flatMap((cabinClass) => {
    const inCabin = edits.filter((e) => e.cabinClass === cabinClass);
    const usage: CabinUsage = {
      cabinClass,
      seats: cabinSeats[cabinClass] ?? 0,
      assigned: inCabin.reduce((sum, e) => sum + e.newCapacity, 0),
    };
    const current = inCabin.reduce((sum, e) => sum + e.capacity, 0);
    if (usage.assigned <= usage.seats || usage.assigned <= current) return [];
    return [{ campo: 'fares', mensaje: cabinOverflowMessage(inCabin.map((e) => e.name), usage) }];
  });

  return [...belowSold, ...overbookedCabins];
}

/** Cabina del avion nuevo donde no entra lo ya vendido. */
export type CabinShortfall = { cabinClass: CabinClass; sold: number; seats: number };

/**
 * Ajusta lo ofrecido por clase a las cabinas de otro avion (US-11B, cambio de avion).
 * Si lo ofrecido en una cabina no entra, cada clase de esa cabina se reduce en la misma
 * proporcion sin bajar de lo vendido (ej. 100 Economy + 44 Premium en 144 -> 75 + 33 en
 * 108). Si entra, no cambia. Las cabinas donde no entra ni lo vendido van en `shortfalls`.
 */
export function fitClassesToCabins(
  loads: readonly ClassLoad[],
  cabinSeats: CabinSeats,
): { capacities: Map<string, number>; shortfalls: CabinShortfall[] } {
  const capacities = new Map(loads.map((l) => [l.fareId, l.capacity]));
  const shortfalls: CabinShortfall[] = [];

  for (const cabinClass of new Set(loads.map((l) => l.cabinClass))) {
    const inCabin = loads.filter((l) => l.cabinClass === cabinClass);
    const seats = cabinSeats[cabinClass] ?? 0;
    const sold = inCabin.reduce((sum, l) => sum + l.sold, 0);
    const offered = inCabin.reduce((sum, l) => sum + l.capacity, 0);

    if (sold > seats) {
      shortfalls.push({ cabinClass, sold, seats });
      continue;
    }
    if (offered <= seats) continue;

    // Los asientos libres del avion nuevo se reparten segun lo no vendido de cada clase;
    // los que sobran del redondeo van a las clases con mayor resto.
    const free = seats - sold;
    const unsold = offered - sold;
    const shares = inCabin.map((l) => {
      const exact = ((l.capacity - l.sold) * free) / unsold;
      return { load: l, extra: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let left = free - shares.reduce((sum, s) => sum + s.extra, 0);
    for (const s of [...shares].sort((a, b) => b.rest - a.rest)) {
      if (left <= 0) break;
      s.extra += 1;
      left -= 1;
    }
    for (const s of shares) capacities.set(s.load.fareId, s.load.sold + s.extra);
  }

  return { capacities, shortfalls };
}
