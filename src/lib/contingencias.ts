import { BookingStatus, FlightStatus } from '@prisma/client';
import { ApiError } from './api';
import { audit } from './audit';
import { localDayRangeUtc } from './dates';
import { toDateInput } from './format';
import { prisma } from './prisma';

export type MotivoCancelacion = 'Clima' | 'Mantenimiento' | 'Operativo';

export const MOTIVOS_CANCELACION: MotivoCancelacion[] = ['Clima', 'Mantenimiento', 'Operativo'];

export type CancelacionInfo = {
  flight: {
    id: string;
    code: string;
    origin: string;
    destination: string;
    originCity: string;
    destinationCity: string;
    departureAt: Date;
    arrivalAt: Date;
    status: FlightStatus;
    notes: string | null;
    aircraftRegistration: string;
    aircraftModel: string;
  };
  affectedBookingsCount: number;
  affectedPassengersCount: number;
  breakdown: {
    economy: number;
    economyPremium: number;
    primeraClase: number;
  };
};

export type PasajeroAfectado = {
  id: string;
  bookingId: string;
  bookingCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  fareName: string;
  cabinClass: string;
  status: 'Pendiente de Reasignación' | 'Reasignado' | string;
  isReassigned: boolean;
};

export type VueloAlternativo = {
  id: string;
  code: string;
  departureAt: Date;
  arrivalAt: Date;
  aircraftRegistration: string;
  aircraftModel: string;
  totalSeats: number;
  availableSeatsTotal: number;
  classAvailability: {
    fareId: string;
    name: string;
    cabinClass: string;
    availableSeats: number;
    price: number;
  }[];
  isEligible: boolean;
  ineligibilityReason?: string;
};

/**
 * Normaliza el nombre de la clase para conteos y reportes.
 */
function normalizeClassName(fareName?: string, cabinClass?: string): 'Economy' | 'Economy Premium' | 'Primera Clase' {
  const lowerName = (fareName ?? '').toLowerCase();
  if (lowerName.includes('premium') || lowerName.includes('flex')) {
    return 'Economy Premium';
  }
  if (lowerName.includes('primera') || cabinClass === 'FIRST' || cabinClass === 'BUSINESS') {
    return 'Primera Clase';
  }
  return 'Economy';
}

/**
 * Obtiene la información previa de un vuelo y sus pasajeros/pasajes afectados
 * para renderizar el modal de cancelación (WF-12A).
 */
export async function getCancelacionInfo(flightId: string): Promise<CancelacionInfo> {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
      aircraft: true,
      fares: { include: { fare: true } },
    },
  });

  if (!flight) {
    throw ApiError.notFound('Vuelo no encontrado');
  }

  // Buscar todas las reservas activas asociadas a este vuelo
  const bookings = await prisma.booking.findMany({
    where: {
      flights: { some: { flightId } },
      status: { in: [BookingStatus.CONFIRMED, BookingStatus.PAID, BookingStatus.PENDING, BookingStatus.REPROGRAMACION_PENDIENTE] },
    },
    include: {
      passengers: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
  });

  let economy = 0;
  let economyPremium = 0;
  let primeraClase = 0;
  let totalPassengers = 0;

  for (const b of bookings) {
    const flightLeg = b.flights[0];
    const fareClass = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);
    const count = b.passengers.length || b.passengersCount || 1;
    totalPassengers += count;

    if (fareClass === 'Economy Premium') {
      economyPremium += count;
    } else if (fareClass === 'Primera Clase') {
      primeraClase += count;
    } else {
      economy += count;
    }
  }

  return {
    flight: {
      id: flight.id,
      code: flight.code,
      origin: flight.route.originAirport.iataCode,
      destination: flight.route.destinationAirport.iataCode,
      originCity: flight.route.originAirport.city,
      destinationCity: flight.route.destinationAirport.city,
      departureAt: flight.departureAt,
      arrivalAt: flight.arrivalAt,
      status: flight.status,
      notes: flight.notes,
      aircraftRegistration: flight.aircraft.registration,
      aircraftModel: flight.aircraft.model,
    },
    affectedBookingsCount: bookings.length,
    affectedPassengersCount: totalPassengers,
    breakdown: {
      economy,
      economyPremium,
      primeraClase,
    },
  };
}

/**
 * US-12A: Cancelación lógica de vuelo y retiro comercial.
 * - Cambia estado_vuelo a CANCELLED (excluyéndolo de buscadores comerciales).
 * - Pasa todas las reservas activas a REPROGRAMACION_PENDIENTE.
 * - Guarda el motivo de cancelación (Clima, Mantenimiento, Operativo).
 */
export async function cancelarVuelo(
  flightId: string,
  reason: MotivoCancelacion,
  userId?: string,
) {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
      aircraft: true,
      fares: { include: { fare: true } },
    },
  });

  if (!flight) {
    throw ApiError.notFound('Vuelo no encontrado');
  }

  if (flight.status === FlightStatus.CANCELLED) {
    throw ApiError.conflict('El vuelo ya se encuentra cancelado');
  }

  // Buscar reservas activas para cancelar/pasar a reprogramación pendiente
  const activeBookings = await prisma.booking.findMany({
    where: {
      flights: { some: { flightId } },
      status: { in: [BookingStatus.CONFIRMED, BookingStatus.PAID, BookingStatus.PENDING] },
    },
    include: {
      passengers: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
  });

  let economy = 0;
  let economyPremium = 0;
  let primeraClase = 0;
  let totalPassengers = 0;

  for (const b of activeBookings) {
    const flightLeg = b.flights[0];
    const fareClass = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);
    const count = b.passengers.length || b.passengersCount || 1;
    totalPassengers += count;

    if (fareClass === 'Economy Premium') {
      economyPremium += count;
    } else if (fareClass === 'Primera Clase') {
      primeraClase += count;
    } else {
      economy += count;
    }
  }

  const cancelNote = `Cancelado por motivo: ${reason}`;

  // Ejecución atómica en base de datos
  await prisma.$transaction(async (tx) => {
    // 1. Baja lógica del vuelo
    await tx.flight.update({
      where: { id: flightId },
      data: {
        status: FlightStatus.CANCELLED,
        notes: cancelNote,
      },
    });

    // 2. Transición de estado masiva de reservas activas a REPROGRAMACION_PENDIENTE
    if (activeBookings.length > 0) {
      await tx.booking.updateMany({
        where: {
          id: { in: activeBookings.map((b) => b.id) },
        },
        data: {
          status: BookingStatus.REPROGRAMACION_PENDIENTE,
        },
      });
    }

    // 3. Auditoría del evento
    await audit({
      userId,
      action: 'FLIGHT_CANCELLED',
      entity: 'Flight',
      entityId: flightId,
      metadata: {
        flightCode: flight.code,
        reason,
        affectedBookingsCount: activeBookings.length,
        affectedPassengersCount: totalPassengers,
        breakdown: { economy, economyPremium, primeraClase },
      },
    });
  }, { maxWait: 15000, timeout: 30000 });

  return {
    flightId,
    flightCode: flight.code,
    reason,
    affectedBookingsCount: activeBookings.length,
    affectedPassengersCount: totalPassengers,
    breakdown: { economy, economyPremium, primeraClase },
  };
}

/**
 * US-12B: Obtiene la lista de pasajeros afectados por la cancelación de un vuelo
 * y sugiere vuelos futuros alternativos en la misma ruta con disponibilidad.
 */
export async function getPasajerosAfectados(flightId: string) {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
      aircraft: true,
      fares: { include: { fare: true } },
    },
  });

  if (!flight) {
    throw ApiError.notFound('Vuelo no encontrado');
  }

  // Obtener todas las reservas asociadas a este vuelo cancelado
  const bookings = await prisma.booking.findMany({
    where: {
      flights: { some: { flightId } },
    },
    include: {
      passengers: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const passengers: PasajeroAfectado[] = [];

  for (const b of bookings) {
    const flightLeg = b.flights[0];
    const fareName = flightLeg?.fare?.name ?? (b.cabinClass === 'FIRST' ? 'Primera Clase' : 'Economy');

    for (const p of b.passengers) {
      passengers.push({
        id: p.id,
        bookingId: b.id,
        bookingCode: b.bookingCode,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: `${p.firstName} ${p.lastName}`,
        documentType: p.documentType,
        documentNumber: p.documentNumber,
        fareName,
        cabinClass: b.cabinClass,
        status: b.status === BookingStatus.REASIGNADO
          ? 'Reasignado'
          : 'Pendiente de Reasignación',
        isReassigned: b.status === BookingStatus.REASIGNADO,
      });
    }
  }

  // Buscar vuelos de la misma ruta a partir del inicio de la fecha operativa del vuelo afectado
  const flightDateInput = toDateInput(flight.departureAt);
  const flightDayStart = localDayRangeUtc(flightDateInput).start;

  const alternativeFlightsQuery = await prisma.flight.findMany({
    where: {
      routeId: flight.routeId,
      id: { not: flightId },
      status: { not: FlightStatus.CANCELLED },
      departureAt: { gte: flightDayStart },
    },
    include: {
      aircraft: true,
      fares: { include: { fare: true } },
    },
    orderBy: { departureAt: 'asc' },
  });

  // Pasajeros actualmente pendientes
  const pendingPassengers = passengers.filter((p) => !p.isReassigned);
  let pendingEconomy = 0;
  let pendingPremium = 0;
  let pendingFirst = 0;

  for (const p of pendingPassengers) {
    const c = normalizeClassName(p.fareName, p.cabinClass);
    if (c === 'Economy Premium') pendingPremium++;
    else if (c === 'Primera Clase') pendingFirst++;
    else pendingEconomy++;
  }

  const alternativeFlights: VueloAlternativo[] = alternativeFlightsQuery.map((alt) => {
    let altTotalSeats = 0;
    let altAvailableTotal = 0;
    let altEconomyAvail = 0;
    let altPremiumAvail = 0;
    let altFirstAvail = 0;

    const classAvailability = alt.fares.map((f) => {
      const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
      altTotalSeats += f.seatCapacity ?? 0;
      altAvailableTotal += f.availableSeats;

      if (c === 'Economy Premium') altPremiumAvail += f.availableSeats;
      else if (c === 'Primera Clase') altFirstAvail += f.availableSeats;
      else altEconomyAvail += f.availableSeats;

      return {
        fareId: f.fareId,
        name: f.fare.name,
        cabinClass: f.fare.cabinClass,
        availableSeats: f.availableSeats,
        price: Number(f.price),
      };
    });

    // Determinar si es elegible para reubicar a todos los pendientes
    let isEligible = true;
    let ineligibilityReason = '';

    if (pendingFirst > 0 && altFirstAvail < pendingFirst) {
      isEligible = false;
      ineligibilityReason = `${alt.code} no se sugiere: no tiene lugares en Primera Clase.`;
    } else if (pendingPremium > 0 && altPremiumAvail < pendingPremium) {
      isEligible = false;
      ineligibilityReason = `${alt.code} no se sugiere: no tiene lugares en Economy Premium.`;
    } else if (pendingEconomy > 0 && altEconomyAvail < pendingEconomy) {
      isEligible = false;
      ineligibilityReason = `${alt.code} no se sugiere: no tiene lugares suficientes en Economy.`;
    } else if (altAvailableTotal < pendingPassengers.length) {
      isEligible = false;
      ineligibilityReason = `${alt.code} no se sugiere: cupos totales insuficientes (${altAvailableTotal} libres para ${pendingPassengers.length} pasajeros).`;
    }

    return {
      id: alt.id,
      code: alt.code,
      departureAt: alt.departureAt,
      arrivalAt: alt.arrivalAt,
      aircraftRegistration: alt.aircraft.registration,
      aircraftModel: alt.aircraft.model,
      totalSeats: altTotalSeats,
      availableSeatsTotal: altAvailableTotal,
      classAvailability,
      isEligible,
      ineligibilityReason: ineligibilityReason || undefined,
    };
  });

  return {
    flight: {
      id: flight.id,
      code: flight.code,
      origin: flight.route.originAirport.iataCode,
      destination: flight.route.destinationAirport.iataCode,
      originCity: flight.route.originAirport.city,
      destinationCity: flight.route.destinationAirport.city,
      departureAt: flight.departureAt,
      arrivalAt: flight.arrivalAt,
      status: flight.status,
      notes: flight.notes,
      aircraftRegistration: flight.aircraft.registration,
      aircraftModel: flight.aircraft.model,
    },
    passengers,
    pendingCount: pendingPassengers.length,
    alternativeFlights,
  };
}

/**
 * US-12B: Reasignación masiva operativa de pasajeros a un nuevo vuelo.
 * Valida disponibilidad por clase y ejecuta la migración de forma atómica.
 */
export async function reprogramarPasajeros({
  flightId,
  newFlightId,
  bookingIds,
  userId,
}: {
  flightId: string;
  newFlightId: string;
  bookingIds?: string[];
  userId?: string;
}) {
  if (flightId === newFlightId) {
    throw ApiError.badRequest('El vuelo de destino no puede ser el mismo vuelo cancelado');
  }

  const oldFlight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: true,
      fares: { include: { fare: true } },
    },
  });

  if (!oldFlight) {
    throw ApiError.notFound('Vuelo cancelado no encontrado');
  }

  const newFlight = await prisma.flight.findUnique({
    where: { id: newFlightId },
    include: {
      route: true,
      fares: { include: { fare: true } },
    },
  });

  if (!newFlight) {
    throw ApiError.notFound('Vuelo alternativo no encontrado');
  }

  if (newFlight.status === FlightStatus.CANCELLED) {
    throw ApiError.conflict('El vuelo alternativo seleccionado está cancelado');
  }

  if (newFlight.routeId !== oldFlight.routeId) {
    throw ApiError.conflict('El vuelo alternativo debe cubrir la misma ruta que el vuelo original');
  }

  // Filtrar reservas que se van a reasignar
  const whereBookings = {
    flights: { some: { flightId } },
    status: {
      in: [
        BookingStatus.REPROGRAMACION_PENDIENTE,
        BookingStatus.PAID,
        BookingStatus.CONFIRMED,
        BookingStatus.PENDING,
      ],
    },
    ...(bookingIds && bookingIds.length > 0 ? { id: { in: bookingIds } } : {}),
  };

  const bookingsToReassign = await prisma.booking.findMany({
    where: whereBookings,
    include: {
      passengers: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
  });

  if (bookingsToReassign.length === 0) {
    throw ApiError.badRequest('No hay reservas pendientes de reasignación seleccionadas');
  }

  // Contar requerimientos por clase
  let reqEconomy = 0;
  let reqPremium = 0;
  let reqFirst = 0;
  let totalRequiredPassengers = 0;

  for (const b of bookingsToReassign) {
    const flightLeg = b.flights[0];
    const fareClass = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);
    const count = b.passengers.length || b.passengersCount || 1;
    totalRequiredPassengers += count;

    if (fareClass === 'Economy Premium') reqPremium += count;
    else if (fareClass === 'Primera Clase') reqFirst += count;
    else reqEconomy += count;
  }

  // Calcular cupos libres en el nuevo vuelo
  let newEconomyAvail = 0;
  let newPremiumAvail = 0;
  let newFirstAvail = 0;
  let newTotalAvail = 0;

  for (const f of newFlight.fares) {
    const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
    newTotalAvail += f.availableSeats;
    if (c === 'Economy Premium') newPremiumAvail += f.availableSeats;
    else if (c === 'Primera Clase') newFirstAvail += f.availableSeats;
    else newEconomyAvail += f.availableSeats;
  }

  // Validar capacidad según el requisito exacto de US-12B y WF-12B-E1:
  // "El vuelo seleccionado solo dispone de N asientos libres. Se requieren M ubicaciones para reasignar a los pasajeros."
  if (
    newTotalAvail < totalRequiredPassengers ||
    newEconomyAvail < reqEconomy ||
    newPremiumAvail < reqPremium ||
    newFirstAvail < reqFirst
  ) {
    throw ApiError.conflict(
      `El vuelo seleccionado solo dispone de ${newTotalAvail} asientos libres. Se requieren ${totalRequiredPassengers} ubicaciones para reasignar a los pasajeros.`
    );
  }

  // Reasignación atómica en BD
  await prisma.$transaction(
    async (tx) => {
      const reassignBookingIds = bookingsToReassign.map((b) => b.id);

      // 1. Actualizar los tramos de vuelo (BookingFlight)
      for (const b of bookingsToReassign) {
        const flightLeg = b.flights[0];
        const fareClass = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);

        const matchingFare =
          newFlight.fares.find((f) => normalizeClassName(f.fare.name, f.fare.cabinClass) === fareClass) ||
          newFlight.fares[0];

        if (flightLeg) {
          await tx.bookingFlight.update({
            where: { id: flightLeg.id },
            data: {
              flightId: newFlight.id,
              departureAt: newFlight.departureAt,
              fareId: matchingFare ? matchingFare.fareId : flightLeg.fareId,
            },
          });
        }
      }

      // 2. Liberar asientos del avión viejo en batch
      await tx.bookingPassenger.updateMany({
        where: { bookingId: { in: reassignBookingIds } },
        data: { seatId: null },
      });

      // 3. Liberar seatLocks asociados al vuelo viejo en batch
      await tx.seatLock.deleteMany({
        where: { bookingId: { in: reassignBookingIds }, flightId: oldFlight.id },
      });

      // 4. Marcar todas las reservas como REASIGNADO en batch
      await tx.booking.updateMany({
        where: { id: { in: reassignBookingIds } },
        data: {
          status: BookingStatus.REASIGNADO,
          notes: `Reasignado operativamente al vuelo ${newFlight.code} (antes ${oldFlight.code})`,
        },
      });

      // 5. Descontar cupos en el nuevo vuelo por clase
      for (const f of newFlight.fares) {
        const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
        let toDeduct = 0;
        if (c === 'Economy Premium') toDeduct = reqPremium;
        else if (c === 'Primera Clase') toDeduct = reqFirst;
        else toDeduct = reqEconomy;

        if (toDeduct > 0) {
          await tx.flightFare.update({
            where: { id: f.id },
            data: {
              availableSeats: { decrement: toDeduct },
            },
          });
        }
      }

      // 6. Auditoría del evento
      await audit({
        userId,
        action: 'PASSENGERS_REASSIGNED',
        entity: 'Flight',
        entityId: oldFlight.id,
        metadata: {
          oldFlightCode: oldFlight.code,
          newFlightId: newFlight.id,
          newFlightCode: newFlight.code,
          reassignedPassengersCount: totalRequiredPassengers,
          reassignedBookingsCount: bookingsToReassign.length,
          bookingCodes: bookingsToReassign.map((b) => b.bookingCode),
        },
      });
    },
    { maxWait: 15000, timeout: 30000 },
  );

  return {
    reallocatedCount: totalRequiredPassengers,
    newFlightCode: newFlight.code,
    message: `Se reasignaron con éxito ${totalRequiredPassengers} pasajeros al vuelo ${newFlight.code}.`,
  };
}
