import type { CabinClass, FlightStatus } from '@prisma/client';
import { ApiError } from '@/lib/api';
import { toDateInput } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { releaseExpiredSeatLocks } from '@/lib/seat-locks';
import type { FlightFaresUpdateInput } from '@/lib/validation';
import { localTimeOf } from './calendar';
import { classLoadOf, validateClassEdits, type CabinSeats, type ClassEdit, type OfferIssue } from './capacity';
import * as repo from './repository';
import type { FlightWithFares } from './repository';
import { isReschedulable } from './reschedule';

/**
 * Edicion de precio y capacidad por clase de un vuelo publicado (US-11A).
 *
 * Lo vendido conserva su precio: `booking_flights.price` y `bookings.total_amount` se
 * congelan al reservar, asi que cambiar `flight_fares.price` solo afecta las ventas
 * futuras. La capacidad no baja de lo vendido o reservado y, por cabina, no sube por
 * encima de los asientos del avion (`validateClassEdits`).
 */

export type FareClassView = {
  fareId: string;
  name: string;
  cabinClass: CabinClass;
  price: number;
  currency: string;
  capacity: number;
  /** Vendidos o reservados (incluye los bloqueos de compra vigentes de RF-03). */
  sold: number;
};

/** Vuelo con sus clases, para precargar la pantalla de edicion. */
export type FlightFaresView = {
  id: string;
  code: string;
  status: FlightStatus;
  /** Misma condicion que la reprogramacion (US-11B): programado o demorado que no salio. */
  editable: boolean;
  /** Fecha y hora local de salida. */
  date: string;
  departureTime: string;
  route: { origin: { iataCode: string; city: string }; destination: { iataCode: string; city: string } };
  aircraft: { registration: string; model: string };
  cabinSeats: CabinSeats;
  classes: FareClassView[];
};

type FareSnapshot = { price: number; seatCapacity: number };

export type FareChange = { fareId: string; name: string; before: FareSnapshot; after: FareSnapshot };

export type FlightFaresUpdateResult = {
  /** El vuelo como quedo: la pantalla lo toma como nueva base de comparacion. */
  flight: FlightFaresView;
  changes: FareChange[];
};

function toView(flight: FlightWithFares, cabinSeats: CabinSeats, now: Date): FlightFaresView {
  return {
    id: flight.id,
    code: flight.code,
    status: flight.status,
    editable: isReschedulable(flight, now),
    date: toDateInput(flight.departureAt),
    departureTime: localTimeOf(flight.departureAt),
    route: { origin: flight.route.originAirport, destination: flight.route.destinationAirport },
    aircraft: flight.aircraft,
    cabinSeats,
    classes: flight.fares.map((row) => {
      const load = classLoadOf(row);
      return {
        fareId: row.fareId,
        name: row.fare.name,
        cabinClass: row.fare.cabinClass,
        price: Number(row.price),
        currency: row.currency,
        capacity: load.capacity,
        sold: load.sold,
      };
    }),
  };
}

/**
 * Un bloqueo de compra vencido sigue descontado de `available_seats` hasta que se libera:
 * sin esto se contaria como vendido. Va fuera de la transaccion de edicion porque libera
 * los de todos los vuelos y tomaria locks de filas ajenas.
 */
async function releaseExpiredLocks(): Promise<void> {
  await releaseExpiredSeatLocks().catch((err) => {
    console.error('Error al liberar bloqueos vencidos:', err);
  });
}

export async function getFlightFares(flightId: string): Promise<FlightFaresView | null> {
  await releaseExpiredLocks();
  const flight = await repo.findFlightWithFares(prisma, flightId);
  if (!flight) return null;
  return toView(flight, await repo.loadCabinSeats(prisma, flight.aircraftId), new Date());
}

/**
 * Guarda precio y capacidad por clase. El vuelo y sus clases quedan bloqueados durante la
 * transaccion: una compra simultanea (RF-03) espera y despues descuenta sobre los valores
 * nuevos, asi que lo vendido que se valida es el real.
 */
export async function updateFlightFares(
  flightId: string,
  input: FlightFaresUpdateInput,
): Promise<FlightFaresUpdateResult> {
  await releaseExpiredLocks();

  return prisma.$transaction(
    async (tx) => {
      await repo.lockFlight(tx, flightId);
      const flight = await repo.findFlightWithFares(tx, flightId);
      if (!flight) throw ApiError.notFound('Vuelo no encontrado');
      const now = new Date();
      if (!isReschedulable(flight, now)) {
        throw ApiError.conflict(
          'Solo se pueden editar las tarifas de vuelos programados o demorados que todavía no salieron',
        );
      }

      const rows = new Map(flight.fares.map((row) => [row.fareId, row]));
      const foreign: OfferIssue[] = input.fares
        .filter((f) => !rows.has(f.fareId))
        .map((f) => ({ campo: `fares.${f.fareId}`, mensaje: 'La clase indicada no pertenece a este vuelo' }));
      if (foreign.length > 0) throw ApiError.unprocessable('El vuelo no tiene alguna de las clases indicadas', foreign);

      const requested = new Map(input.fares.map((f) => [f.fareId, f]));
      const edits: ClassEdit[] = flight.fares.map((row) => {
        const load = classLoadOf(row);
        return { ...load, name: row.fare.name, newCapacity: requested.get(row.fareId)?.seatCapacity ?? load.capacity };
      });
      const cabinSeats = await repo.loadCabinSeats(tx, flight.aircraftId);
      const issues = validateClassEdits(edits, cabinSeats);
      if (issues.length > 0) {
        throw ApiError.unprocessable(
          issues.length === 1 ? issues[0]!.mensaje : 'Hay clases con datos a corregir',
          issues,
        );
      }

      const changes: (FareChange & { rowId: string; sold: number })[] = edits.flatMap((e) => {
        const row = rows.get(e.fareId)!;
        const before = { price: Number(row.price), seatCapacity: e.capacity };
        const after = { price: requested.get(e.fareId)?.price ?? before.price, seatCapacity: e.newCapacity };
        if (after.price === before.price && after.seatCapacity === before.seatCapacity) return [];
        return [{ fareId: e.fareId, name: e.name, before, after, rowId: row.id, sold: e.sold }];
      });
      if (changes.length === 0) throw ApiError.badRequest('No hay cambios para guardar');

      await repo.updateFlightFares(
        tx,
        changes.map((c) => ({
          id: c.rowId,
          price: c.after.price,
          seatCapacity: c.after.seatCapacity,
          availableSeats: c.after.seatCapacity - c.sold,
        })),
      );

      const updated = (await repo.findFlightWithFares(tx, flightId))!;
      return {
        flight: toView(updated, cabinSeats, now),
        changes: changes.map(({ fareId, name, before, after }) => ({ fareId, name, before, after })),
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
