import { BookingStatus, FlightStatus, Prisma } from '@prisma/client';
import { ApiError, handler, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { BOOKABLE_STATUSES } from '@/lib/flights';
import { LOCK_DURATION_MS, releaseExpiredSeatLocks } from '@/lib/seat-locks';
import { generateShortCode } from '@/lib/codes';
import { prisma } from '@/lib/prisma';
import { findPublicBooking, toPublicBookingView } from '@/lib/public-booking';
import { bookingReprogramSchema } from '@/lib/validation';
import { toUtcRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const REBOOKABLE_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.PAID];
const LOCKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, ...REBOOKABLE_STATUSES];
const OCCUPYING_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.PAID, BookingStatus.BOARDED];
const FLIGHT_CLOSED_STATUSES: FlightStatus[] = [FlightStatus.DEPARTED, FlightStatus.ARRIVED, FlightStatus.CANCELLED];
const OLD_FLIGHT_REBOOKABLE_STATUSES: FlightStatus[] = [FlightStatus.SCHEDULED, FlightStatus.DELAYED];
const SEAT_EXHAUSTED_MESSAGE =
  'El vuelo seleccionado acaba de agotar sus ubicaciones disponibles. Por favor elija otra alternativa.';

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, bookingReprogramSchema);
  const booking = await findPublicBooking(prisma, { code: body.code, lastName: body.lastName });
  if (!booking) throw ApiError.notFound('No encontramos ninguna reserva que coincida con el código y apellido ingresados.');

  const currentLeg = booking.flights.find((leg) => leg.flight.code === body.flightCode);
  if (!currentLeg) throw ApiError.notFound('El vuelo indicado no pertenece a esta reserva.');
  assertRebookable(booking, currentLeg.flight.departureAt, currentLeg.flight.status, booking.passengers);

  if (body.action === 'search') {
    const range = toUtcRange(body.date);
    const now = new Date();
    if (!range.gte || !range.lt || body.date <= todayInArgentina() || range.lt <= now) {
      throw ApiError.badRequest('La nueva fecha debe ser posterior a hoy.');
    }

    const candidates = await prisma.flight.findMany({
      where: {
        routeId: currentLeg.flight.routeId,
        id: { not: currentLeg.flightId },
        status: { in: BOOKABLE_STATUSES },
        departureAt: { gte: range.gte > now ? range.gte : now, lt: range.lt },
        fares: {
          some: {
            fareId: currentLeg.fareId,
            availableSeats: { gte: booking.passengersCount },
            fare: { isActive: true },
          },
        },
      },
      include: {
        route: { include: { originAirport: true, destinationAirport: true } },
        aircraft: { include: { seats: { where: { cabinClass: currentLeg.fare.cabinClass }, orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }] } } },
        fares: {
          where: {
            fareId: currentLeg.fareId,
            availableSeats: { gte: booking.passengersCount },
            fare: { isActive: true },
          },
          include: { fare: true },
          orderBy: { price: 'asc' },
        },
      },
      orderBy: { departureAt: 'asc' },
      take: 50,
    });

    const seatIdsByFlight = new Map(candidates.map((flight) => [flight.id, flight.aircraft.seats.map((seat) => seat.id)]));
    const candidateFlightIds = candidates.map((flight) => flight.id);
    const allCandidateSeatIds = [...new Set([...seatIdsByFlight.values()].flat())];
    const [occupied, locks] = allCandidateSeatIds.length
      ? await Promise.all([
          prisma.bookingPassenger.findMany({
            where: {
              seatId: { in: allCandidateSeatIds },
              booking: { status: { in: OCCUPYING_STATUSES }, flights: { some: { flightId: { in: candidateFlightIds } } } },
            },
            select: {
              seatId: true,
              booking: { select: { flights: { where: { flightId: { in: candidateFlightIds } }, select: { flightId: true } } } },
            },
          }),
          prisma.seatLock.findMany({
            where: {
              flightId: { in: candidateFlightIds },
              seatId: { in: allCandidateSeatIds },
              expiresAt: { gt: now },
              booking: { status: { in: LOCKING_STATUSES } },
            },
            select: { flightId: true, seatId: true },
          }),
        ])
      : [[], []];
    const unavailableByFlight = new Map(candidateFlightIds.map((flightId) => [flightId, new Set<string>()]));
    for (const row of occupied) {
      if (!row.seatId) continue;
      for (const leg of row.booking.flights) unavailableByFlight.get(leg.flightId)?.add(row.seatId);
    }
    for (const lock of locks) unavailableByFlight.get(lock.flightId)?.add(lock.seatId);

    const data = candidates.map((flight) => {
      const seatIds = seatIdsByFlight.get(flight.id) ?? [];
      const unavailable = unavailableByFlight.get(flight.id) ?? new Set<string>();
      const physicalSeatsAvailable = seatIds.filter((id) => !unavailable.has(id)).length;
      const fares = flight.fares
        .map((fare) => ({
          id: fare.fareId,
          name: fare.fare.name,
          cabinClass: fare.fare.cabinClass,
          price: Number(fare.price),
          seatsAvailable: Math.min(fare.availableSeats, physicalSeatsAvailable),
        }))
        .filter((fare) => fare.seatsAvailable >= booking.passengersCount);

      return {
        id: flight.id,
        code: flight.code,
        departureAt: flight.departureAt.toISOString(),
        arrivalAt: flight.arrivalAt.toISOString(),
        origin: { iataCode: flight.route.originAirport.iataCode, city: flight.route.originAirport.city },
        destination: { iataCode: flight.route.destinationAirport.iataCode, city: flight.route.destinationAirport.city },
        fares,
        availableSeats: (currentLeg.seatSelectionIncluded ?? currentLeg.fare.seatSelection)
          ? flight.aircraft.seats
              .filter((seat) => !unavailable.has(seat.id))
              .map((seat) => ({ id: seat.id, label: `${seat.rowNumber}${seat.columnLetter}` }))
          : [],
      };
    });

    return ok({
      cabinClass: currentLeg.fare.cabinClass,
      passengersCount: booking.passengersCount,
      seatSelectionPreserved: currentLeg.seatSelectionIncluded ?? currentLeg.fare.seatSelection,
      data: data.filter((flight) => flight.fares.length > 0),
    });
  }

  if (booking.flights.length !== 1) {
    throw ApiError.conflict('La reprogramación autónoma todavía no está disponible para reservas con más de un tramo.');
  }
  if (currentLeg.flight.departureAt <= new Date() || FLIGHT_CLOSED_STATUSES.includes(currentLeg.flight.status)) {
    throw ApiError.conflict('No se puede reprogramar un vuelo que ya comenzó o finalizó.');
  }
  if (booking.passengers.some((passenger) => passenger.checkInStatus === 'DONE')) {
    throw ApiError.conflict('No se puede reprogramar después de completar el check-in.');
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await releaseExpiredSeatLocks(tx);
    await tx.seatLock.deleteMany({ where: { expiresAt: { lte: now } } });

    const lockedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      include: {
        flights: { include: { flight: true, fare: true } },
        passengers: { include: { seat: true, boardingPass: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!lockedBooking || !REBOOKABLE_STATUSES.includes(lockedBooking.status)) {
      throw ApiError.conflict('La reserva ya no se encuentra disponible para reprogramar.');
    }
    if (lockedBooking.flights.length !== 1) {
      throw ApiError.conflict('La reprogramación autónoma todavía no está disponible para reservas con más de un tramo.');
    }

    const oldLeg = lockedBooking.flights[0]!;
    if (
      oldLeg.flight.code !== body.flightCode ||
      oldLeg.flight.departureAt <= now ||
      !OLD_FLIGHT_REBOOKABLE_STATUSES.includes(oldLeg.flight.status)
    ) {
      throw ApiError.conflict('El vuelo original ya no puede reprogramarse.');
    }
    if (lockedBooking.passengers.some((passenger) => passenger.checkInStatus === 'DONE')) {
      throw ApiError.conflict('No se puede reprogramar después de completar el check-in.');
    }

    const replacement = await tx.flight.findUnique({
      where: { id: body.replacementFlightId },
      include: {
        aircraft: { include: { seats: { where: { cabinClass: oldLeg.fare.cabinClass }, orderBy: [{ rowNumber: 'asc' }, { columnLetter: 'asc' }] } } },
        fares: { where: { fareId: body.replacementFareId }, include: { fare: true } },
      },
    });
    const newFare = replacement?.fares[0];
    if (
      !replacement ||
      !newFare ||
      replacement.routeId !== oldLeg.flight.routeId ||
      replacement.id === oldLeg.flightId ||
      !BOOKABLE_STATUSES.includes(replacement.status) ||
      replacement.departureAt <= now ||
      newFare.fareId !== oldLeg.fareId ||
      !newFare.fare.isActive
    ) {
      throw ApiError.conflict('El vuelo seleccionado ya no está disponible en la misma ruta y clase. Busque otra alternativa.');
    }

    const fareCapacity = await tx.flightFare.updateMany({
      where: {
        flightId: replacement.id,
        fareId: newFare.fareId,
        availableSeats: { gte: lockedBooking.passengersCount },
      },
      data: { availableSeats: { decrement: lockedBooking.passengersCount } },
    });
    if (fareCapacity.count === 0) throw ApiError.conflict(SEAT_EXHAUSTED_MESSAGE);

    await tx.seatLock.deleteMany({
      where: { bookingId: lockedBooking.id, expiresAt: { lte: now } },
    });
    const seatIds = replacement.aircraft.seats.map((seat) => seat.id);
    const [occupied, activeLocks] = await Promise.all([
      tx.bookingPassenger.findMany({
        where: {
          bookingId: { not: lockedBooking.id },
          seatId: { in: seatIds },
          booking: { status: { in: OCCUPYING_STATUSES }, flights: { some: { flightId: replacement.id } } },
        },
        select: { seatId: true },
      }),
      tx.seatLock.findMany({
        where: {
          flightId: replacement.id,
          seatId: { in: seatIds },
          expiresAt: { gt: now },
          booking: { status: { in: LOCKING_STATUSES } },
        },
        select: { seatId: true },
      }),
    ]);
    const unavailable = new Set([...occupied, ...activeLocks].map((entry) => entry.seatId).filter(Boolean));
    const freeSeats = replacement.aircraft.seats.filter((seat) => !unavailable.has(seat.id));
    if (freeSeats.length < lockedBooking.passengers.length) throw ApiError.conflict(SEAT_EXHAUSTED_MESSAGE);

    const seatSelectionPaid = oldLeg.seatSelectionIncluded ?? oldLeg.fare.seatSelection;
    if (seatSelectionPaid && body.seatIds.length !== lockedBooking.passengers.length) {
      throw ApiError.badRequest('Seleccione un asiento disponible para cada pasajero.');
    }
    if (!seatSelectionPaid && body.seatIds.length > 0) {
      throw ApiError.badRequest('La tarifa no incluye selección de asiento.');
    }

    const availableByLabel = new Map(freeSeats.map((seat) => [`${seat.rowNumber}${seat.columnLetter}`, seat]));
    const freeById = new Map(freeSeats.map((seat) => [seat.id, seat]));
    const assigned = lockedBooking.passengers.map((passenger, index) => {
      if (seatSelectionPaid) {
        const selectedSeat = freeById.get(body.seatIds[index]!);
        if (!selectedSeat) throw ApiError.conflict(SEAT_EXHAUSTED_MESSAGE);
        freeById.delete(selectedSeat.id);
        return { passenger, seat: selectedSeat };
      }
      const oldLabel = passenger.seat ? `${passenger.seat.rowNumber}${passenger.seat.columnLetter}` : null;
      const seat = (oldLabel ? availableByLabel.get(oldLabel) : undefined) ?? availableByLabel.values().next().value;
      if (!seat) throw ApiError.conflict(SEAT_EXHAUSTED_MESSAGE);
      availableByLabel.delete(`${seat.rowNumber}${seat.columnLetter}`);
      return { passenger, seat };
    });

    const oldCapacity = await tx.flightFare.updateMany({
      where: { flightId: oldLeg.flightId, fareId: oldLeg.fareId },
      data: { availableSeats: { increment: lockedBooking.passengersCount } },
    });
    if (oldCapacity.count === 0) throw ApiError.conflict('No se pudo liberar el cupo del vuelo original.');

    await tx.seatLock.deleteMany({ where: { bookingId: lockedBooking.id } });
    await tx.bookingFlight.update({
      where: { id: oldLeg.id },
      data: {
        flightId: replacement.id,
        fareId: newFare.fareId,
        departureAt: replacement.departureAt,
        seatSelectionIncluded: seatSelectionPaid,
      },
    });
    for (const { passenger, seat } of assigned) {
      await tx.bookingPassenger.update({
        where: { id: passenger.id },
        data: { seatId: seat.id },
      });
      if (passenger.boardingPass) {
        await tx.boardingPass.update({
          where: { id: passenger.boardingPass.id },
          data: {
            code: `BP-${generateShortCode(6)}`,
            seatId: seat.id,
            flightCode: replacement.code,
            status: 'ISSUED',
            issuedAt: now,
          },
        });
      }
    }
    await tx.seatLock.createMany({
      data: assigned.map(({ seat }) => ({
        flightId: replacement.id,
        seatId: seat.id,
        bookingId: lockedBooking.id,
        lockedAt: now,
        expiresAt: new Date(now.getTime() + LOCK_DURATION_MS),
      })),
    });

    return { oldFlightCode: oldLeg.flight.code, newFlightCode: replacement.code };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000,
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      throw ApiError.conflict(SEAT_EXHAUSTED_MESSAGE);
    }
    throw error;
  });

  await audit({
    userId: null,
    action: 'REBOOK',
    entity: 'Booking',
    entityId: booking.id,
    metadata: {
      bookingCode: booking.bookingCode,
      oldFlightCode: result.oldFlightCode,
      newFlightCode: result.newFlightCode,
    },
  });

  const updatedBooking = await findPublicBooking(prisma, { code: body.code, lastName: body.lastName });
  if (!updatedBooking) throw ApiError.notFound();
  return ok({ booking: toPublicBookingView(updatedBooking), oldFlightCode: result.oldFlightCode, newFlightCode: result.newFlightCode });
});

function assertRebookable(
  booking: { status: BookingStatus; flights: Array<{ flight: { departureAt: Date; status: FlightStatus } }>; passengersCount: number },
  departureAt: Date,
  flightStatus: FlightStatus,
  passengers: Array<{ checkInStatus: string; seatId: string | null }>,
) {
  if (!REBOOKABLE_STATUSES.includes(booking.status)) {
    throw ApiError.conflict('Solo se pueden reprogramar reservas confirmadas o pagadas.');
  }
  if (booking.flights.length !== 1) {
    throw ApiError.conflict('La reprogramación autónoma todavía no está disponible para reservas con más de un tramo.');
  }
  if (booking.passengersCount === 0 || passengers.length !== booking.passengersCount) {
    throw ApiError.conflict('La reserva todavía no tiene todos sus pasajeros registrados.');
  }
  if (departureAt <= new Date() || FLIGHT_CLOSED_STATUSES.includes(flightStatus)) {
    throw ApiError.conflict('No se puede reprogramar un vuelo que ya comenzó o finalizó.');
  }
  if (!OLD_FLIGHT_REBOOKABLE_STATUSES.includes(flightStatus)) {
    throw ApiError.conflict('El vuelo ya está en proceso de embarque y no puede reprogramarse.');
  }
  if (passengers.some((passenger) => passenger.checkInStatus === 'DONE')) {
    throw ApiError.conflict('No se puede reprogramar después de completar el check-in.');
  }
}

function todayInArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
