import { Prisma, CabinClass, BookingStatus } from '@prisma/client';
import { ApiError } from './api';
import { prisma } from './prisma';

/** Duración del bloqueo temporal estipulado por RF-03: 5 minutos en milisegundos */
export const LOCK_DURATION_MS = 5 * 60 * 1000;

/** Límites de asientos por reserva según RF-03 */
export const MIN_SEATS_PER_RESERVATION = 1;
export const MAX_SEATS_PER_RESERVATION = 9;

export type SeatDisplayStatus = 'FREE' | 'SELECTED' | 'LOCKED' | 'OCCUPIED';

export type FlightSeatView = {
  id: string;
  rowNumber: number;
  columnLetter: string;
  cabinClass: CabinClass;
  type: string;
  isExitRow: boolean;
  status: SeatDisplayStatus;
  allowedForFare: boolean;
  lockedUntil?: string | null;
};

/**
 * Libera de forma atómica todas las reservas PENDING cuyo tiempo de bloqueo de 5 minutos
 * haya expirado (RF-03). Restaura los cupos de asientos en las tarifas del vuelo.
 */
export async function releaseExpiredSeatLocks(txClient?: Prisma.TransactionClient): Promise<number> {
  const db = txClient ?? prisma;
  const now = new Date();

  // Buscar reservas PENDING cuyo tiempo de bloqueo expiró
  const expiredBookings = await db.booking.findMany({
    where: {
      status: BookingStatus.PENDING,
      expiresAt: { lt: now },
    },
    include: {
      flights: true,
      seatLocks: true,
    },
  });

  if (expiredBookings.length === 0) {
    // También limpiar locks huérfanos que hayan quedado vencidos
    await db.seatLock.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return 0;
  }

  for (const booking of expiredBookings) {
    // Eliminar los bloqueos de asientos
    await db.seatLock.deleteMany({
      where: { bookingId: booking.id },
    });

    // Cancelar la reserva
    await db.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });

    // Devolver los cupos a cada vuelo y tarifa de la reserva
    for (const bf of booking.flights) {
      await db.flightFare.updateMany({
        where: {
          flightId: bf.flightId,
          fareId: bf.fareId,
        },
        data: {
          availableSeats: { increment: booking.passengersCount },
        },
      });
    }
  }

  return expiredBookings.length;
}

/**
 * Obtiene el mapa completo de asientos para un vuelo puntual, calculando
 * el estado de cada butaca (FREE, LOCKED por otro usuario, OCCUPIED, o SELECTED)
 * en tiempo real considerando la expiración de 5 minutos.
 */
export async function getFlightSeatsStatus(
  flightId: string,
  fareId?: string,
  currentBookingId?: string,
): Promise<{
  aircraft: { id: string; model: string; registration: string; layout: string | null; seatCount: number };
  fare: { id: string; name: string; cabinClass: CabinClass; price: number } | null;
  seats: FlightSeatView[];
}> {
  // Primero aplicamos limpieza pasiva de bloqueos vencidos
  await releaseExpiredSeatLocks().catch((err) => {
    console.error('Error al liberar bloqueos vencidos:', err);
  });

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      aircraft: {
        include: {
          seats: {
            orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }],
          },
        },
      },
      fares: {
        include: { fare: true },
      },
    },
  });

  if (!flight) throw ApiError.notFound('Vuelo no encontrado');

  const selectedFlightFare = fareId ? flight.fares.find((f) => f.fareId === fareId) : flight.fares[0];
  const targetCabinClass = selectedFlightFare?.fare.cabinClass ?? CabinClass.ECONOMY;

  const now = new Date();

  // Bloqueos activos no vencidos para este vuelo
  const activeLocks = await prisma.seatLock.findMany({
    where: {
      flightId,
      expiresAt: { gt: now },
      booking: {
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.PAID] },
      },
    },
    select: {
      seatId: true,
      bookingId: true,
      expiresAt: true,
      booking: { select: { status: true } },
    },
  });

  const lockBySeatId = new Map(activeLocks.map((l) => [l.seatId, l]));

  // Asientos con compras confirmadas o pagadas
  const occupiedSeats = await prisma.bookingPassenger.findMany({
    where: {
      seatId: { not: null },
      booking: {
        flights: { some: { flightId } },
        status: { in: [BookingStatus.PAID, BookingStatus.CONFIRMED] },
      },
    },
    select: { seatId: true },
  });

  const occupiedSet = new Set(occupiedSeats.map((p) => p.seatId!));

  const seats: FlightSeatView[] = flight.aircraft.seats.map((seat) => {
    let status: SeatDisplayStatus = 'FREE';
    let lockedUntil: string | null = null;

    if (occupiedSet.has(seat.id)) {
      status = 'OCCUPIED';
    } else {
      const activeLock = lockBySeatId.get(seat.id);
      if (activeLock) {
        if (activeLock.booking.status === BookingStatus.PAID || activeLock.booking.status === BookingStatus.CONFIRMED) {
          status = 'OCCUPIED';
        } else if (currentBookingId && activeLock.bookingId === currentBookingId) {
          status = 'SELECTED';
          lockedUntil = activeLock.expiresAt.toISOString();
        } else {
          status = 'LOCKED';
          lockedUntil = activeLock.expiresAt.toISOString();
        }
      }
    }

    // Comprobar si la butaca es apta para la tarifa elegida (Economy vs Primera Clase)
    const allowedForFare = seat.cabinClass === targetCabinClass;

    return {
      id: seat.id,
      rowNumber: seat.rowNumber,
      columnLetter: seat.columnLetter,
      cabinClass: seat.cabinClass,
      type: seat.type,
      isExitRow: seat.isExitRow,
      status,
      allowedForFare,
      lockedUntil,
    };
  });

  return {
    aircraft: {
      id: flight.aircraft.id,
      model: flight.aircraft.model,
      registration: flight.aircraft.registration,
      layout: flight.aircraft.layout,
      seatCount: flight.aircraft.seatCount,
    },
    fare: selectedFlightFare
      ? {
          id: selectedFlightFare.fare.id,
          name: selectedFlightFare.fare.name,
          cabinClass: selectedFlightFare.fare.cabinClass,
          price: Number(selectedFlightFare.price),
        }
      : null,
    seats,
  };
}

export type LockSeatsInput = {
  flightId: string;
  fareId: string;
  seatIds: string[];
  contactEmail: string;
  contactPhone?: string | null;
  userId?: string | null;
  passengers?: {
    firstName: string;
    lastName: string;
    documentType?: 'DNI' | 'PASAPORTE' | 'CEDULA' | 'OTRO';
    documentNumber: string;
    birthDate?: Date | string | null;
  }[];
};

/**
 * Realiza el Bloqueo Transaccional Atómico de Asientos (RF-03):
 * 1. Valida que la cantidad de asientos esté entre 1 y 9.
 * 2. Valida la clase de cabina de la tarifa seleccionada.
 * 3. Ejecuta transacción atómica con exclusión mutua en PostgreSQL.
 * 4. Si cualquier asiento está tomado por otro usuario, aborta con 409 "Asiento no disponible".
 * 5. Si están libres, fija el timer de 5 minutos (expiresAt) y descuenta cupo.
 */
export async function lockSeatsAtomic(
  input: LockSeatsInput,
  txClient?: Prisma.TransactionClient,
) {
  const { flightId, fareId, seatIds, contactEmail, contactPhone, userId, passengers = [] } = input;

  if (!seatIds || seatIds.length < MIN_SEATS_PER_RESERVATION || seatIds.length > MAX_SEATS_PER_RESERVATION) {
    throw ApiError.badRequest(
      `Debe seleccionar entre ${MIN_SEATS_PER_RESERVATION} y ${MAX_SEATS_PER_RESERVATION} asientos`,
    );
  }

  // Eliminar duplicados en el array solicitado
  const uniqueSeatIds = [...new Set(seatIds)];
  if (uniqueSeatIds.length !== seatIds.length) {
    throw ApiError.badRequest('No se pueden seleccionar asientos duplicados');
  }

  const runWithTx = async (tx: Prisma.TransactionClient) => {
    // 1. Limpieza pasiva inmediata de bloqueos vencidos dentro de la transacción
    await releaseExpiredSeatLocks(tx);

    // 2. Verificar que el vuelo exista y tenga la tarifa
    const flight = await tx.flight.findUnique({
      where: { id: flightId },
      include: {
        fares: { where: { fareId } },
        aircraft: true,
      },
    });

    if (!flight) throw ApiError.notFound('Vuelo no encontrado');
    if (flight.status === 'CANCELLED') throw ApiError.conflict(`El vuelo ${flight.code} está cancelado`);

    const flightFare = flight.fares[0];
    if (!flightFare) throw ApiError.badRequest('La tarifa seleccionada no existe para este vuelo');

    // 3. Obtener las butacas físicas de la aeronave
    const seats = await tx.seat.findMany({
      where: {
        id: { in: uniqueSeatIds },
        aircraftId: flight.aircraftId,
      },
    });

    if (seats.length !== uniqueSeatIds.length) {
      throw ApiError.badRequest('Uno o más asientos no pertenecen a la aeronave del vuelo');
    }

    // Verificar coincidencia de cabina (Economy vs Primera Clase)
    const fareModel = await tx.fare.findUnique({ where: { id: fareId } });
    if (!fareModel) throw ApiError.notFound('Tarifa no encontrada');

    for (const seat of seats) {
      if (seat.cabinClass !== fareModel.cabinClass) {
        throw ApiError.conflict(
          `El asiento ${seat.rowNumber}${seat.columnLetter} pertenece a la clase ${seat.cabinClass} y no corresponde a la tarifa seleccionada`,
        );
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

    // 4. VERIFICACIÓN ATÓMICA DE EXCLUSIÓN MUTUA
    // A) Verificar si hay bloqueos activos no vencidos para este vuelo
    const existingActiveLocks = await tx.seatLock.findMany({
      where: {
        flightId,
        seatId: { in: uniqueSeatIds },
        expiresAt: { gt: now },
        booking: {
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.PAID] },
        },
      },
    });

    if (existingActiveLocks.length > 0) {
      // Método de Verificación explícito de RF-03:
      throw ApiError.conflict('Asiento no disponible');
    }

    // B) Verificar si algún asiento ya fue vendido definitivamente
    const existingPaid = await tx.bookingPassenger.findFirst({
      where: {
        seatId: { in: uniqueSeatIds },
        booking: {
          flights: { some: { flightId } },
          status: { in: [BookingStatus.PAID, BookingStatus.CONFIRMED] },
        },
      },
    });

    if (existingPaid) {
      throw ApiError.conflict('Asiento no disponible');
    }

    // C) Verificar disponibilidad en flightFare y descontar
    const updatedFare = await tx.flightFare.updateMany({
      where: {
        flightId,
        fareId,
        availableSeats: { gte: uniqueSeatIds.length },
      },
      data: {
        availableSeats: { decrement: uniqueSeatIds.length },
      },
    });

    if (updatedFare.count === 0) {
      throw ApiError.conflict(`Se agotaron los asientos disponibles del vuelo ${flight.code}`);
    }

    // 5. Eliminar cualquier lock anterior vencido de estos asientos específicos
    await tx.seatLock.deleteMany({
      where: {
        flightId,
        seatId: { in: uniqueSeatIds },
      },
    });

    // 6. Generar código de reserva y crear la reserva en estado PENDING con expiresAt
    const { generateBookingCode } = await import('./codes');
    const bookingCode = generateBookingCode();
    const totalAmount = new Prisma.Decimal(flightFare.price).mul(uniqueSeatIds.length);

    const booking = await tx.booking.create({
      data: {
        bookingCode,
        userId: userId ?? null,
        status: BookingStatus.PENDING,
        passengersCount: uniqueSeatIds.length,
        cabinClass: fareModel.cabinClass,
        totalAmount,
        currency: flightFare.currency,
        contactEmail,
        contactPhone: contactPhone ?? null,
        expiresAt,
        flights: {
          create: [
            {
              flightId,
              fareId,
              price: flightFare.price,
              departureAt: flight.departureAt,
            },
          ],
        },
      },
    });

    // 7. Crear los registros de bloqueo atómico SeatLock
    try {
      await tx.seatLock.createMany({
        data: uniqueSeatIds.map((seatId) => ({
          flightId,
          seatId,
          bookingId: booking.id,
          lockedAt: now,
          expiresAt,
        })),
      });
    } catch (error) {
      // Capturar colisión concurrente (Unique constraint failed o conflicto de serialización)
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) ||
        (error instanceof Error && (error.message.includes('could not serialize access') || error.message.includes('deadlock')))
      ) {
        throw ApiError.conflict('Asiento no disponible');
      }
      throw error;
    }

    // 8. Crear los pasajeros vinculados a cada asiento
    const { generateShortCode } = await import('./codes');
    for (let i = 0; i < uniqueSeatIds.length; i++) {
      const seatId = uniqueSeatIds[i];
      const pData = passengers[i];

      await tx.bookingPassenger.create({
        data: {
          bookingId: booking.id,
          firstName: pData?.firstName ?? `Pasajero ${i + 1}`,
          lastName: pData?.lastName ?? 'Sin definir',
          documentType: pData?.documentType ?? 'DNI',
          documentNumber: pData?.documentNumber ?? `TEMP-${Date.now()}-${i}`,
          birthDate: pData?.birthDate ? new Date(pData.birthDate) : null,
          seatId,
          checkInCode: generateShortCode(),
          checkInStatus: 'NOT_STARTED',
        },
      });
    }

    return {
      bookingCode: booking.bookingCode,
      bookingId: booking.id,
      expiresAt: expiresAt.toISOString(),
      expiresAtDate: expiresAt,
      seatsCount: uniqueSeatIds.length,
      totalAmount: Number(totalAmount),
    };
  };

  if (txClient) {
    return runWithTx(txClient);
  } else {
    return prisma.$transaction(runWithTx, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });
  }
}
