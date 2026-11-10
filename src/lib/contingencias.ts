import { BookingStatus, CabinClass, FlightStatus } from '@prisma/client';
import { ApiError } from './api';
import { audit } from './audit';
import { formatTime, toDateInput } from './format';
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

export type ReservaAfectada = {
  id: string;
  bookingCode: string;
  leadPassengerName: string;
  companionsCount: number;
  passengersCount: number;
  passengersSummary: string;
  cabinClass: CabinClass;
  cabinClassDisplay: string;
  status: BookingStatus;
  respuestaPasajero: 'PENDIENTE' | 'ACEPTA' | 'RECHAZA';
  vueloPropuesto: {
    id: string;
    code: string;
    departureAt: Date;
    arrivalAt: Date;
  } | null;
  propuestaMotivo: string | null;
  asientosAsignados: string[];
  vueloOriginalCode: string;
  createdAt: Date;
};

export type VueloAlternativoOpcion = {
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
    cabinClass: CabinClass;
    availableSeats: number;
    price: number;
  }[];
  isCurrentProposal: boolean;
  hasEnoughSeats: boolean;
  requiredSeats: number;
  availableSeatsInClass: number;
  ineligibilityMessage?: string;
};

export function normalizeClassName(fareName?: string, cabinClass?: string): 'Economy' | 'Economy Premium' | 'Primera Clase' {
  const lowerName = (fareName ?? '').toLowerCase();
  if (lowerName.includes('premium') || lowerName.includes('flex')) {
    return 'Economy Premium';
  }
  if (lowerName.includes('primera') || cabinClass === 'FIRST' || cabinClass === 'BUSINESS') {
    return 'Primera Clase';
  }
  return 'Economy';
}

function getCabinClassFromFare(fareName?: string, cabinClass?: string): CabinClass {
  const normalized = normalizeClassName(fareName, cabinClass);
  if (normalized === 'Primera Clase') return CabinClass.FIRST;
  return CabinClass.ECONOMY;
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

  const activeBookings = await prisma.booking.findMany({
    where: {
      flights: { some: { flightId } },
      status: {
        in: [
          BookingStatus.PAID,
          BookingStatus.CONFIRMED,
          BookingStatus.PENDING,
          BookingStatus.REPROGRAMACION_PENDIENTE,
          BookingStatus.REASIGNACION_PROPUESTA,
          BookingStatus.SIN_ALTERNATIVA,
        ],
      },
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
    affectedBookingsCount: activeBookings.length,
    affectedPassengersCount: totalPassengers,
    breakdown: { economy, economyPremium, primeraClase },
  };
}

/**
 * US-12A: Cancelación lógica del vuelo.
 * Cancela el vuelo, pasa las reservas a REPROGRAMACION_PENDIENTE y
 * automáticamente ejecuta el motor de reasignación US-12B v2.0.
 */
export async function cancelarVuelo(
  flightIdOrParams: string | { flightId: string; reason: MotivoCancelacion; userId?: string },
  reasonArg?: MotivoCancelacion,
  userIdArg?: string,
) {
  const flightId = typeof flightIdOrParams === 'string' ? flightIdOrParams : flightIdOrParams.flightId;
  const reason = typeof flightIdOrParams === 'string' ? reasonArg! : flightIdOrParams.reason;
  const userId = typeof flightIdOrParams === 'string' ? userIdArg : flightIdOrParams.userId;

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      route: true,
      fares: { include: { fare: true } },
    },
  });

  if (!flight) {
    throw ApiError.notFound('Vuelo no encontrado');
  }

  if (flight.status === FlightStatus.CANCELLED) {
    throw ApiError.badRequest('El vuelo ya se encuentra cancelado');
  }

  const activeBookings = await prisma.booking.findMany({
    where: {
      flights: { some: { flightId } },
      status: {
        in: [
          BookingStatus.PAID,
          BookingStatus.CONFIRMED,
          BookingStatus.PENDING,
          BookingStatus.REPROGRAMACION_PENDIENTE,
        ],
      },
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

  // 1. Cancelar vuelo y pasar reservas a REPROGRAMACION_PENDIENTE
  await prisma.$transaction(
    async (tx) => {
      await tx.flight.update({
        where: { id: flightId },
        data: {
          status: FlightStatus.CANCELLED,
          notes: cancelNote,
        },
      });

      if (activeBookings.length > 0) {
        await tx.booking.updateMany({
          where: {
            id: { in: activeBookings.map((b) => b.id) },
          },
          data: {
            status: BookingStatus.REPROGRAMACION_PENDIENTE,
            vueloOriginalId: flightId,
            respuestaPasajero: 'PENDIENTE',
            propuestaMotivo: null,
          },
        });
      }

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
    },
    { maxWait: 15000, timeout: 30000 },
  );

  // 2. Ejecutar inmediatamente el Motor de Reasignación Determinístico (US-12B)
  await generarPropuestas(flightId);

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
 * MOTOR DE REASIGNACIÓN DETERMINÍSTICO (US-12B v2.0)
 * Sigue exhaustivamente el algoritmo del Sprint 3 v2.0:
 * - Ventana: ahora + 2h <= salida <= vueloCancelado.salida + 72h
 * - Orden de prioridad: Primera Clase -> Eco. Premium -> Economy, luego antigüedad de compra.
 * - Desempates: salida más cercana -> mayor cupo libre en clase -> código de vuelo ASC.
 * - Retención física de cupos y asignación automática del primer asiento libre (fila y letra).
 */
export async function generarPropuestas(flightId: string, options?: { onlySinAlternativa?: boolean }) {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: { route: true, aircraft: true },
  });

  if (!flight) {
    throw ApiError.notFound('Vuelo cancelado no encontrado');
  }

  // 1. Obtener candidatos de la misma ruta en la ventana permitida
  const cancellationTime = flight.updatedAt || new Date();
  const minDeparture = new Date(Math.min(cancellationTime.getTime(), flight.departureAt.getTime()) + 2 * 3600 * 1000);
  const maxDeparture = new Date(flight.departureAt.getTime() + 72 * 3600 * 1000);

  const rawCandidates = await prisma.flight.findMany({
    where: {
      routeId: flight.routeId,
      id: { not: flightId },
      status: FlightStatus.SCHEDULED,
      departureAt: {
        gte: minDeparture,
        lte: maxDeparture,
      },
    },
    include: {
      aircraft: {
        include: {
          seats: {
            orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }],
          },
        },
      },
      fares: { include: { fare: true } },
    },
    orderBy: { departureAt: 'asc' },
  });

  // Estructura en memoria para simular los cupos disponibles y asientos libres
  type CandidateState = {
    flight: (typeof rawCandidates)[0];
    freeSeatsByClass: Record<string, number>;
    availableSeatObjectsByClass: Record<string, string[]>; // seatIds
  };

  // Consultar asientos ya ocupados en cada candidato
  const candidateIds = rawCandidates.map((c) => c.id);
  const occupiedPassengers = await prisma.bookingPassenger.findMany({
    where: {
      seatId: { not: null },
      booking: {
        flights: { some: { flightId: { in: candidateIds } } },
        status: { not: BookingStatus.CANCELLED },
      },
    },
    select: { seatId: true },
  });
  const occupiedSeatIds = new Set(occupiedPassengers.map((p) => p.seatId).filter(Boolean));

  const candidates: CandidateState[] = rawCandidates.map((cand) => {
    const freeSeatsByClass: Record<string, number> = {
      'Economy': 0,
      'Economy Premium': 0,
      'Primera Clase': 0,
    };

    for (const f of cand.fares) {
      const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
      freeSeatsByClass[c] = (freeSeatsByClass[c] || 0) + f.availableSeats;
    }

    const availableSeatObjectsByClass: Record<string, string[]> = {
      'Economy': [],
      'Economy Premium': [],
      'Primera Clase': [],
    };

    for (const s of cand.aircraft.seats) {
      if (!occupiedSeatIds.has(s.id)) {
        const c = s.cabinClass === CabinClass.FIRST ? 'Primera Clase' : 'Economy';
        availableSeatObjectsByClass[c]?.push(s.id);
        // Si no hay asientos premium específicos en el modelo físico, se toma de Economy
        if (c === 'Economy') {
          availableSeatObjectsByClass['Economy Premium']?.push(s.id);
        }
      }
    }

    return {
      flight: cand,
      freeSeatsByClass,
      availableSeatObjectsByClass,
    };
  });

  // 2. Obtener reservas a procesar
  const statusFilter = options?.onlySinAlternativa
    ? [BookingStatus.SIN_ALTERNATIVA]
    : [BookingStatus.REPROGRAMACION_PENDIENTE, BookingStatus.SIN_ALTERNATIVA];

  const reservas = await prisma.booking.findMany({
    where: {
      OR: [
        { vueloOriginalId: flightId },
        { flights: { some: { flightId } } },
      ],
      status: { in: statusFilter },
    },
    include: {
      passengers: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
  });

  // Ordenar reservas estrictamente según regla comercial:
  // Primera Clase (3) -> Eco. Premium (2) -> Economy (1), luego por fecha de compra (createdAt ASC)
  function getPriorityScore(b: (typeof reservas)[0]): number {
    const flightLeg = b.flights[0];
    const c = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);
    if (c === 'Primera Clase') return 3;
    if (c === 'Economy Premium') return 2;
    return 1;
  }

  reservas.sort((a, b) => {
    const pA = getPriorityScore(a);
    const pB = getPriorityScore(b);
    if (pA !== pB) return pB - pA;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  // 3. Ejecutar algoritmo para cada reserva
  type AllocationPlan = {
    bookingId: string;
    status: BookingStatus;
    vueloPropuestoId: string | null;
    propuestaMotivo: string;
    seatAssignments: { passengerId: string; seatId: string }[];
    deductions: { flightId: string; cabinClass: string; count: number }[];
  };

  const plans: AllocationPlan[] = [];

  for (const reserva of reservas) {
    const flightLeg = reserva.flights[0];
    const fareClass = normalizeClassName(flightLeg?.fare?.name, reserva.cabinClass);
    const count = reserva.passengers.length || reserva.passengersCount || 1;

    // Buscar opciones con libres[vuelo][clase] >= requeridos
    const matchingCandidates = candidates.filter((c) => {
      const free = c.freeSeatsByClass[fareClass] || 0;
      return free >= count;
    });

    if (matchingCandidates.length === 0) {
      // Sin candidato
      plans.push({
        bookingId: reserva.id,
        status: BookingStatus.SIN_ALTERNATIVA,
        vueloPropuestoId: null,
        propuestaMotivo: 'Sin vuelo con cupo en las próximas 72 h',
        seatAssignments: [],
        deductions: [],
      });
      continue;
    }

    // Criterio de elección:
    // 1) |salida - vueloCancelado.salida| ASC
    // 2) mayor cupo en la clase (-libres en la clase)
    // 3) código ASC
    matchingCandidates.sort((a, b) => {
      const diffA = Math.abs(a.flight.departureAt.getTime() - flight.departureAt.getTime());
      const diffB = Math.abs(b.flight.departureAt.getTime() - flight.departureAt.getTime());
      if (diffA !== diffB) return diffA - diffB;

      const seatsA = a.freeSeatsByClass[fareClass] || 0;
      const seatsB = b.freeSeatsByClass[fareClass] || 0;
      if (seatsA !== seatsB) return seatsB - seatsA;

      return a.flight.code.localeCompare(b.flight.code);
    });

    const chosen = matchingCandidates[0]!;

    // Descontar en memoria
    chosen.freeSeatsByClass[fareClass] = (chosen.freeSeatsByClass[fareClass] || 0) - count;

    // Asignar primeros asientos libres en orden
    const seatAssignments: { passengerId: string; seatId: string }[] = [];
    const availableSeats = chosen.availableSeatObjectsByClass[fareClass] || [];
    for (const p of reserva.passengers) {
      const seatId = availableSeats.shift();
      if (seatId) {
        seatAssignments.push({ passengerId: p.id, seatId });
      }
    }

    // Calcular motivo de la propuesta (WF-12B)
    const diffMs = chosen.flight.departureAt.getTime() - flight.departureAt.getTime();
    const diffH = Math.floor(Math.abs(diffMs) / (3600 * 1000));
    const diffM = Math.round((Math.abs(diffMs) % (3600 * 1000)) / (60 * 1000));
    const diffStr = diffH > 0 ? `+${diffH} h ${diffM > 0 ? `${diffM} min` : ''}`.trim() : `+${diffM} min`;

    // Si hubo un candidato más cercano que no tuvo cupo:
    const closerCandidateWithNoSeats = candidates.find((c) => {
      const d = Math.abs(c.flight.departureAt.getTime() - flight.departureAt.getTime());
      const chosenD = Math.abs(chosen.flight.departureAt.getTime() - flight.departureAt.getTime());
      return d < chosenD && (c.freeSeatsByClass[fareClass] || 0) < count;
    });

    let propuestaMotivo = `Sugerido · ${diffStr}`;
    if (closerCandidateWithNoSeats) {
      propuestaMotivo = `${closerCandidateWithNoSeats.flight.code} sin cupo · ${diffStr}`;
    }

    plans.push({
      bookingId: reserva.id,
      status: BookingStatus.REASIGNACION_PROPUESTA,
      vueloPropuestoId: chosen.flight.id,
      propuestaMotivo,
      seatAssignments,
      deductions: [{ flightId: chosen.flight.id, cabinClass: fareClass, count }],
    });
  }

  // 4. Guardar todos los cambios en una única transacción atómica
  await prisma.$transaction(
    async (tx) => {
      for (const plan of plans) {
        await tx.booking.update({
          where: { id: plan.bookingId },
          data: {
            status: plan.status,
            vueloOriginalId: flightId,
            vueloPropuestoId: plan.vueloPropuestoId,
            propuestaMotivo: plan.propuestaMotivo,
            respuestaPasajero: 'PENDIENTE',
          },
        });

        // Asignar asientos
        for (const sa of plan.seatAssignments) {
          await tx.bookingPassenger.update({
            where: { id: sa.passengerId },
            data: { seatId: sa.seatId },
          });
        }

        // Descontar cupo en flight_fares
        for (const ded of plan.deductions) {
          const fareRow = await tx.flightFare.findFirst({
            where: {
              flightId: ded.flightId,
              fare: {
                name: { contains: ded.cabinClass === 'Primera Clase' ? 'Primera' : ded.cabinClass === 'Economy Premium' ? 'Premium' : 'Economy', mode: 'insensitive' },
              },
            },
          });
          if (fareRow) {
            await tx.flightFare.update({
              where: { id: fareRow.id },
              data: { availableSeats: { decrement: ded.count } },
            });
          }
        }
      }
    },
    { maxWait: 15000, timeout: 30000 },
  );

  return plans;
}

/**
 * US-12B v2.0: Obtiene la lista completa de reservas afectadas, contadores
 * y propuestas para renderizar la pantalla principal WF-12B.
 */
export async function getReservasAfectadas(flightId: string) {
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

  // Buscar todas las reservas de este vuelo cancelado
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { vueloOriginalId: flightId },
        { flights: { some: { flightId } } },
      ],
      status: {
        in: [
          BookingStatus.REPROGRAMACION_PENDIENTE,
          BookingStatus.REASIGNACION_PROPUESTA,
          BookingStatus.REPROGRAMADA,
          BookingStatus.SIN_ALTERNATIVA,
          BookingStatus.PAID,
          BookingStatus.CONFIRMED,
        ],
      },
    },
    include: {
      passengers: {
        include: {
          seat: true,
        },
      },
      vueloPropuesto: true,
      flights: {
        where: { flightId },
        include: { fare: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let totalPasajeros = 0;
  let conPropuesta = 0;
  let reprogramadas = 0;
  let sinAlternativa = 0;
  let pendientesSinRespuesta = 0;

  const reservas: ReservaAfectada[] = bookings.map((b) => {
    const flightLeg = b.flights[0];
    const fareClass = normalizeClassName(flightLeg?.fare?.name, b.cabinClass);
    const count = b.passengers.length || b.passengersCount || 1;
    totalPasajeros += count;

    if (b.status === BookingStatus.REASIGNACION_PROPUESTA) {
      conPropuesta++;
      if (!b.respuestaPasajero || b.respuestaPasajero === 'PENDIENTE') {
        pendientesSinRespuesta++;
      }
    } else if (b.status === BookingStatus.REPROGRAMADA) {
      reprogramadas++;
    } else if (b.status === BookingStatus.SIN_ALTERNATIVA) {
      sinAlternativa++;
    }

    const leadPassenger = b.passengers[0];
    const leadName = leadPassenger ? `${leadPassenger.firstName} ${leadPassenger.lastName}` : 'Pasajero';
    const companions = count > 1 ? count - 1 : 0;
    const passengersSummary = companions > 0 ? `+${companions} acompañante${companions > 1 ? 's' : ''}` : '1 pasajero';

    let cabinClassDisplay = 'Economy';
    if (fareClass === 'Primera Clase') {
      cabinClassDisplay = 'Primera Clase';
    } else if (fareClass === 'Economy Premium') {
      cabinClassDisplay = 'Eco. Premium';
    } else {
      cabinClassDisplay = count > 1 ? `Economy ×${count}` : 'Economy';
    }

    const assignedSeats = b.passengers
      .map((p) => p.seat ? `${p.seat.rowNumber}${p.seat.columnLetter}` : null)
      .filter((s): s is string => Boolean(s));

    return {
      id: b.id,
      bookingCode: b.bookingCode,
      leadPassengerName: leadName,
      companionsCount: companions,
      passengersCount: count,
      passengersSummary,
      cabinClass: getCabinClassFromFare(flightLeg?.fare?.name, b.cabinClass),
      cabinClassDisplay,
      status: b.status,
      respuestaPasajero: (b.respuestaPasajero as any) || 'PENDIENTE',
      vueloPropuesto: b.vueloPropuesto
        ? {
            id: b.vueloPropuesto.id,
            code: b.vueloPropuesto.code,
            departureAt: b.vueloPropuesto.departureAt,
            arrivalAt: b.vueloPropuesto.arrivalAt,
          }
        : null,
      propuestaMotivo: b.propuestaMotivo,
      asientosAsignados: assignedSeats,
      vueloOriginalCode: flight.code,
      createdAt: b.createdAt,
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
    metrics: {
      totalAfectadas: reservas.length,
      totalPasajeros,
      conPropuesta,
      reprogramadas,
      sinAlternativa,
      pendientesSinRespuesta,
    },
    reservas,
  };
}

/**
 * US-12B: Confirmar una o varias reservas (individual o masivo).
 * La reserva pasa a REPROGRAMADA y consolida el cambio de itinerario.
 */
export async function confirmarReasignacion(params: {
  bookingIds: string[];
  userId?: string;
}) {
  const { bookingIds, userId } = params;

  if (!bookingIds || bookingIds.length === 0) {
    throw ApiError.badRequest('No se especificaron reservas a confirmar');
  }

  const bookings = await prisma.booking.findMany({
    where: {
      id: { in: bookingIds },
      status: BookingStatus.REASIGNACION_PROPUESTA,
      respuestaPasajero: { not: 'RECHAZA' },
      vueloPropuestoId: { not: null },
    },
    include: {
      vueloPropuesto: {
        include: { fares: { include: { fare: true } } },
      },
      flights: true,
    },
  });

  if (bookings.length === 0) {
    throw ApiError.badRequest('Ninguna de las reservas seleccionadas es apta para confirmar');
  }

  await prisma.$transaction(
    async (tx) => {
      for (const b of bookings) {
        if (!b.vueloPropuesto) continue;

        // Actualizar BookingFlight al nuevo vuelo
        const currentLeg = b.flights[0];
        const fareClass = normalizeClassName(undefined, b.cabinClass);
        const matchingFare =
          b.vueloPropuesto.fares.find((f) => normalizeClassName(f.fare.name, f.fare.cabinClass) === fareClass) ||
          b.vueloPropuesto.fares[0];

        if (currentLeg) {
          await tx.bookingFlight.update({
            where: { id: currentLeg.id },
            data: {
              flightId: b.vueloPropuesto.id,
              departureAt: b.vueloPropuesto.departureAt,
              fareId: matchingFare ? matchingFare.fareId : currentLeg.fareId,
            },
          });
        }

        // Marcar como REPROGRAMADA
        await tx.booking.update({
          where: { id: b.id },
          data: {
            status: BookingStatus.REPROGRAMADA,
            propuestaMotivo: 'Confirmado por Admin',
          },
        });

        await audit({
          userId,
          action: 'BOOKING_REPROGRAMMED',
          entity: 'Booking',
          entityId: b.id,
          metadata: {
            bookingCode: b.bookingCode,
            confirmedFlight: b.vueloPropuesto.code,
            departureAt: b.vueloPropuesto.departureAt.toISOString(),
          },
        });
      }
    },
    { maxWait: 15000, timeout: 30000 },
  );

  return {
    confirmedCount: bookings.length,
    message: `Se confirmaron con éxito ${bookings.length} reservas en estado REPROGRAMADA.`,
  };
}

/**
 * US-12B: Confirmar todas las reservas pendientes sin respuesta (política 24h).
 */
export async function confirmarPendientesSinRespuesta(flightId: string, userId?: string) {
  const pendingBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { vueloOriginalId: flightId },
        { flights: { some: { flightId } } },
      ],
      status: BookingStatus.REASIGNACION_PROPUESTA,
      respuestaPasajero: 'PENDIENTE',
      vueloPropuestoId: { not: null },
    },
    select: { id: true },
  });

  if (pendingBookings.length === 0) {
    throw ApiError.badRequest('No hay reservas pendientes sin respuesta para confirmar');
  }

  return confirmarReasignacion({
    bookingIds: pendingBookings.map((b) => b.id),
    userId,
  });
}

/**
 * US-12B v2.0: Obtener vuelos alternativos para el panel lateral "Cambiar vuelo" (WF-12B-E).
 */
export async function getVuelosAlternativosParaReserva(bookingIdOrCode: string, filterDate?: string) {
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingIdOrCode }, { bookingCode: bookingIdOrCode }],
    },
    include: {
      passengers: true,
      vueloPropuesto: true,
      flights: {
        include: {
          flight: { include: { route: true } },
          fare: true,
        },
      },
    },
  });

  if (!booking) {
    throw ApiError.notFound('Reserva no encontrada');
  }

  const originalFlight = booking.flights[0]?.flight;
  if (!originalFlight) {
    throw ApiError.badRequest('No se encontró el vuelo de la reserva');
  }

  const fareClass = normalizeClassName(booking.flights[0]?.fare?.name, booking.cabinClass);
  const requiredSeats = booking.passengers.length || booking.passengersCount || 1;

  // Buscar todos los vuelos futuros de la misma ruta (sin el límite de 72h)
  const whereFilter: any = {
    routeId: originalFlight.routeId,
    status: FlightStatus.SCHEDULED,
    id: { not: originalFlight.id },
  };

  const flightsQuery = await prisma.flight.findMany({
    where: whereFilter,
    include: {
      aircraft: true,
      fares: { include: { fare: true } },
    },
    orderBy: { departureAt: 'asc' },
  });

  // Filtrar en cliente/servidor por fecha si viene dada
  const options: VueloAlternativoOpcion[] = flightsQuery.map((cand) => {
    let ecoAvail = 0;
    let premAvail = 0;
    let firstAvail = 0;
    let totalAvail = 0;

    const classAvailability = cand.fares.map((f) => {
      const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
      totalAvail += f.availableSeats;
      if (c === 'Economy Premium') premAvail += f.availableSeats;
      else if (c === 'Primera Clase') firstAvail += f.availableSeats;
      else ecoAvail += f.availableSeats;

      return {
        fareId: f.fareId,
        name: f.fare.name,
        cabinClass: f.fare.cabinClass,
        availableSeats: f.availableSeats,
        price: Number(f.price),
      };
    });

    let availableInClass = ecoAvail;
    if (fareClass === 'Economy Premium') availableInClass = premAvail;
    else if (fareClass === 'Primera Clase') availableInClass = firstAvail;

    const isCurrentProposal = booking.vueloPropuestoId === cand.id;
    const hasEnoughSeats = availableInClass >= requiredSeats;

    let ineligibilityMessage: string | undefined;
    if (!hasEnoughSeats) {
      // Mensaje literal exigido por la especificación:
      // "El vuelo {vuelo} solo dispone de {n} asientos libres en {clase}. Se requieren {m} para reubicar la reserva {código}."
      ineligibilityMessage = `El vuelo ${cand.code} solo dispone de ${availableInClass} asientos libres en ${fareClass}. Se requieren ${requiredSeats} para reubicar la reserva ${booking.bookingCode}.`;
    }

    return {
      id: cand.id,
      code: cand.code,
      departureAt: cand.departureAt,
      arrivalAt: cand.arrivalAt,
      aircraftRegistration: cand.aircraft.registration,
      aircraftModel: cand.aircraft.model,
      totalSeats: cand.aircraft.seatCount,
      availableSeatsTotal: totalAvail,
      classAvailability,
      isCurrentProposal,
      hasEnoughSeats,
      requiredSeats,
      availableSeatsInClass: availableInClass,
      ineligibilityMessage,
    };
  });

  // Ordenar por cercanía a la salida original (WF-12B-E)
  options.sort((a, b) => {
    const diffA = Math.abs(a.departureAt.getTime() - originalFlight.departureAt.getTime());
    const diffB = Math.abs(b.departureAt.getTime() - originalFlight.departureAt.getTime());
    return diffA - diffB;
  });

  return {
    booking: {
      id: booking.id,
      bookingCode: booking.bookingCode,
      leadPassenger: booking.passengers[0] ? `${booking.passengers[0].firstName} ${booking.passengers[0].lastName}` : 'Pasajero',
      companionsCount: Math.max(0, requiredSeats - 1),
      passengersCount: requiredSeats,
      cabinClass: fareClass,
      vueloPropuestoId: booking.vueloPropuestoId,
      vueloPropuestoCode: booking.vueloPropuesto?.code || null,
      origin: originalFlight.route.originAirportId,
      destination: originalFlight.route.destinationAirportId,
    },
    flights: options,
  };
}

/**
 * US-12B v2.0: Cambiar vuelo de una reserva desde el panel lateral (WF-12B-E).
 * Libera cupo del vuelo propuesto anterior, toma cupo del nuevo y pasa directo a REPROGRAMADA.
 */
export async function cambiarVueloReserva(params: {
  bookingIdOrCode: string;
  newFlightId: string;
  userId?: string;
}) {
  const { bookingIdOrCode, newFlightId, userId } = params;

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingIdOrCode }, { bookingCode: bookingIdOrCode }],
    },
    include: {
      passengers: true,
      vueloPropuesto: { include: { fares: { include: { fare: true } } } },
      flights: { include: { fare: true } },
    },
  });

  if (!booking) {
    throw ApiError.notFound('Reserva no encontrada');
  }

  const newFlight = await prisma.flight.findUnique({
    where: { id: newFlightId },
    include: {
      route: true,
      aircraft: {
        include: {
          seats: { orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }] },
        },
      },
      fares: { include: { fare: true } },
    },
  });

  if (!newFlight) {
    throw ApiError.notFound('Vuelo alternativo no encontrado');
  }

  if (newFlight.status === FlightStatus.CANCELLED) {
    throw ApiError.conflict('El vuelo alternativo seleccionado se encuentra cancelado');
  }

  const currentLeg = booking.flights[0];
  const fareClass = normalizeClassName(currentLeg?.fare?.name, booking.cabinClass);
  const requiredSeats = booking.passengers.length || booking.passengersCount || 1;

  // Calcular asientos libres en la clase en newFlight
  let availableInClass = 0;
  for (const f of newFlight.fares) {
    const c = normalizeClassName(f.fare.name, f.fare.cabinClass);
    if (c === fareClass) {
      availableInClass += f.availableSeats;
    }
  }

  // Validación estricta con plantilla literal exigida:
  if (availableInClass < requiredSeats) {
    throw ApiError.conflict(
      `El vuelo ${newFlight.code} solo dispone de ${availableInClass} asientos libres en ${fareClass}. Se requieren ${requiredSeats} para reubicar la reserva ${booking.bookingCode}.`
    );
  }

  // Encontrar asientos libres en la nueva aeronave
  const occupiedPassengers = await prisma.bookingPassenger.findMany({
    where: {
      seatId: { not: null },
      booking: {
        flights: { some: { flightId: newFlight.id } },
        status: { not: BookingStatus.CANCELLED },
      },
    },
    select: { seatId: true },
  });
  const occupiedSeatIds = new Set(occupiedPassengers.map((p) => p.seatId).filter(Boolean));

  const availableSeatIds: string[] = [];
  for (const s of newFlight.aircraft.seats) {
    if (!occupiedSeatIds.has(s.id)) {
      const c = s.cabinClass === CabinClass.FIRST ? 'Primera Clase' : 'Economy';
      if (fareClass === 'Primera Clase' && c === 'Primera Clase') {
        availableSeatIds.push(s.id);
      } else if (fareClass !== 'Primera Clase' && c === 'Economy') {
        availableSeatIds.push(s.id);
      }
    }
  }

  // Ejecución atómica
  await prisma.$transaction(
    async (tx) => {
      // 1. Si había un vuelo propuesto previo, reponer el cupo
      if (booking.vueloPropuestoId && booking.vueloPropuesto) {
        const prevFareRow = await tx.flightFare.findFirst({
          where: {
            flightId: booking.vueloPropuestoId,
            fare: {
              name: { contains: fareClass === 'Primera Clase' ? 'Primera' : fareClass === 'Economy Premium' ? 'Premium' : 'Economy', mode: 'insensitive' },
            },
          },
        });
        if (prevFareRow) {
          await tx.flightFare.update({
            where: { id: prevFareRow.id },
            data: { availableSeats: { increment: requiredSeats } },
          });
        }
      }

      // 2. Descontar cupo en newFlight
      const newFareRow = await tx.flightFare.findFirst({
        where: {
          flightId: newFlight.id,
          fare: {
            name: { contains: fareClass === 'Primera Clase' ? 'Primera' : fareClass === 'Economy Premium' ? 'Premium' : 'Economy', mode: 'insensitive' },
          },
        },
      });
      if (newFareRow) {
        await tx.flightFare.update({
          where: { id: newFareRow.id },
          data: { availableSeats: { decrement: requiredSeats } },
        });
      }

      // 3. Reasignar asientos a los pasajeros
      for (const p of booking.passengers) {
        const newSeatId = availableSeatIds.shift() || null;
        await tx.bookingPassenger.update({
          where: { id: p.id },
          data: { seatId: newSeatId },
        });
      }

      // 4. Actualizar BookingFlight
      const matchingFare =
        newFlight.fares.find((f) => normalizeClassName(f.fare.name, f.fare.cabinClass) === fareClass) ||
        newFlight.fares[0];

      // 4. Si la reserva ya estaba confirmada como REPROGRAMADA, actualizar directamente BookingFlight.
      // Si estaba en propuesta o rechazada, se actualiza como nueva propuesta con respuesta PENDIENTE.
      const wasAlreadyReprogrammed = booking.status === BookingStatus.REPROGRAMADA;

      if (wasAlreadyReprogrammed && currentLeg) {
        await tx.bookingFlight.update({
          where: { id: currentLeg.id },
          data: {
            flightId: newFlight.id,
            departureAt: newFlight.departureAt,
            fareId: matchingFare ? matchingFare.fareId : currentLeg.fareId,
          },
        });
      }

      // 5. Actualizar estado y vuelo propuesto
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: wasAlreadyReprogrammed ? BookingStatus.REPROGRAMADA : BookingStatus.REASIGNACION_PROPUESTA,
          respuestaPasajero: wasAlreadyReprogrammed ? (booking.respuestaPasajero as any) : 'PENDIENTE',
          vueloPropuestoId: newFlight.id,
          propuestaMotivo: 'Cambiado por Admin',
          notes: wasAlreadyReprogrammed
            ? `Reprogramado manualmente al vuelo ${newFlight.code}`
            : `Propuesta actualizada manualmente al vuelo ${newFlight.code}`,
        },
      });

      // 6. Auditoría
      await audit({
        userId,
        action: 'BOOKING_FLIGHT_CHANGED',
        entity: 'Booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          newFlightCode: newFlight.code,
          departureAt: newFlight.departureAt.toISOString(),
        },
      });
    },
    { maxWait: 15000, timeout: 30000 },
  );

  return {
    bookingCode: booking.bookingCode,
    newFlightCode: newFlight.code,
    message: `Reserva ${booking.bookingCode} reubicada con éxito en el vuelo ${newFlight.code}.`,
  };
}

/**
 * US-12B v2.0: Cancelar reserva por rechazo de alternativas (WF-12B-C).
 * Libera el asiento/cupo en el vuelo propuesto y pasa a CANCELADO con reembolso pendiente.
 */
export async function cancelarReservaContingencia(params: {
  bookingIdOrCode: string;
  userId?: string;
}) {
  const { bookingIdOrCode, userId } = params;

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingIdOrCode }, { bookingCode: bookingIdOrCode }],
    },
    include: {
      passengers: { include: { seat: true } },
      vueloPropuesto: { include: { fares: { include: { fare: true } } } },
      flights: { include: { fare: true } },
    },
  });

  if (!booking) {
    throw ApiError.notFound('Reserva no encontrada');
  }

  const fareClass = normalizeClassName(booking.flights[0]?.fare?.name, booking.cabinClass);
  const requiredSeats = booking.passengers.length || booking.passengersCount || 1;

  await prisma.$transaction(
    async (tx) => {
      // 1. Reponer cupo en el vuelo propuesto si tenía
      if (booking.vueloPropuestoId && booking.vueloPropuesto) {
        const fareRow = await tx.flightFare.findFirst({
          where: {
            flightId: booking.vueloPropuestoId,
            fare: {
              name: { contains: fareClass === 'Primera Clase' ? 'Primera' : fareClass === 'Economy Premium' ? 'Premium' : 'Economy', mode: 'insensitive' },
            },
          },
        });
        if (fareRow) {
          await tx.flightFare.update({
            where: { id: fareRow.id },
            data: { availableSeats: { increment: requiredSeats } },
          });
        }
      }

      // 2. Liberar asientos
      await tx.bookingPassenger.updateMany({
        where: { bookingId: booking.id },
        data: { seatId: null },
      });

      // 3. Cancelar reserva con motivo oficial
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          reembolsoPendiente: true,
          notes: 'Contingencia – rechaza alternativas',
          propuestaMotivo: 'Cancelado por rechazo de alternativas',
          respuestaPasajero: 'RECHAZA',
        },
      });

      // 4. Auditoría
      await audit({
        userId,
        action: 'BOOKING_CANCELLED_CONTINGENCY',
        entity: 'Booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          reason: 'Contingencia – rechaza alternativas',
        },
      });
    },
    { maxWait: 15000, timeout: 30000 },
  );

  return {
    bookingCode: booking.bookingCode,
    message: `Reserva ${booking.bookingCode} cancelada. Reembolso pendiente registrado.`,
  };
}

/**
 * US-12B: Actualizar respuesta del pasajero (PENDIENTE / ACEPTA / RECHAZA).
 */
export async function actualizarRespuestaPasajero(params: {
  bookingIdOrCode: string;
  respuesta: 'PENDIENTE' | 'ACEPTA' | 'RECHAZA';
  userId?: string;
}) {
  const { bookingIdOrCode, respuesta, userId } = params;

  const booking = await prisma.booking.findFirst({
    where: {
      OR: [{ id: bookingIdOrCode }, { bookingCode: bookingIdOrCode }],
    },
  });

  if (!booking) {
    throw ApiError.notFound('Reserva no encontrada');
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { respuestaPasajero: respuesta },
  });

  await audit({
    userId,
    action: 'PASSENGER_RESPONSE_UPDATED',
    entity: 'Booking',
    entityId: booking.id,
    metadata: {
      bookingCode: booking.bookingCode,
      respuesta,
    },
  });

  return {
    bookingCode: booking.bookingCode,
    respuesta,
  };
}

/**
 * Wrapper de compatibilidad para endpoints y tests anteriores.
 */
export async function getPasajerosAfectados(flightId: string) {
  const result = await getReservasAfectadas(flightId);
  return {
    flight: result.flight,
    passengers: result.reservas.map((r) => ({
      id: r.id,
      bookingId: r.id,
      bookingCode: r.bookingCode,
      firstName: r.leadPassengerName.split(' ')[0] || '',
      lastName: r.leadPassengerName.split(' ').slice(1).join(' ') || '',
      fullName: r.leadPassengerName,
      documentType: 'DNI',
      documentNumber: '',
      fareName: r.cabinClassDisplay,
      cabinClass: r.cabinClass,
      status: r.status,
      isReassigned: r.status === BookingStatus.REPROGRAMADA,
    })),
    alternativeFlights: [] as Array<{
      id: string;
      code: string;
      departureAt: Date;
      availableSeats: number;
    }>,
  };
}

export async function reprogramarPasajeros(params: {
  flightId: string;
  newFlightId: string;
  bookingIds?: string[];
  userId?: string;
}) {
  const { flightId, newFlightId, bookingIds, userId } = params;
  if (bookingIds && bookingIds.length > 0) {
    for (const id of bookingIds) {
      await cambiarVueloReserva({ bookingIdOrCode: id, newFlightId, userId });
    }
  } else {
    const data = await getReservasAfectadas(flightId);
    for (const r of data.reservas) {
      await cambiarVueloReserva({ bookingIdOrCode: r.id, newFlightId, userId });
    }
  }
  return {
    reallocatedCount: bookingIds ? bookingIds.length : 1,
    newFlightCode: 'CONFIRMED',
    message: 'Pasajeros reprogramados exitosamente',
  };
}
