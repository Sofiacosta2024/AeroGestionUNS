import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingStatus, CabinClass, FlightStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CONTINGENCY_REPROGRAMMING_MESSAGE } from '@/lib/contingency-status';
import { POST } from '@/app/api/v1/reservas/consulta/reprogramar/route';

/**
 * US-14B v2.0: mientras la reserva está en gestión por contingencia (US-12B),
 * el pasajero no puede reprogramarla de forma autónoma. El endpoint debe
 * rechazar tanto la búsqueda como la confirmación con el mensaje literal y sin
 * tocar los cupos.
 */
test('US-14B: bloquea la reprogramación autónoma de una reserva en contingencia', async () => {
  const timestamp = Date.now();
  const registration = `LV-T${timestamp.toString().slice(-4)}`;

  const route = await prisma.route.findFirstOrThrow();
  const fare = await prisma.fare.findFirstOrThrow({ where: { isActive: true } });

  const aircraft = await prisma.aircraft.create({
    data: {
      registration,
      model: 'Boeing 737-800 Test US-14B',
      manufacturer: 'Boeing',
      seatCount: 150,
    },
  });

  const departureA = new Date(Date.now() + 2 * 86400000);
  const departureB = new Date(Date.now() + 3 * 86400000);

  const flightA = await prisma.flight.create({
    data: {
      code: `AG-C${timestamp.toString().slice(-3)}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt: departureA,
      arrivalAt: new Date(departureA.getTime() + 75 * 60000),
      status: FlightStatus.SCHEDULED,
      fares: {
        create: {
          fareId: fare.id,
          price: fare.basePrice,
          availableSeats: 20,
          seatCapacity: 20,
        },
      },
    },
    include: { fares: true },
  });

  const flightB = await prisma.flight.create({
    data: {
      code: `AG-D${timestamp.toString().slice(-3)}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt: departureB,
      arrivalAt: new Date(departureB.getTime() + 75 * 60000),
      status: FlightStatus.SCHEDULED,
      fares: {
        create: {
          fareId: fare.id,
          price: fare.basePrice,
          availableSeats: 10,
          seatCapacity: 10,
        },
      },
    },
    include: { fares: true },
  });

  const fareA = flightA.fares[0]!;
  const fareB = flightB.fares[0]!;

  const booking = await prisma.booking.create({
    data: {
      bookingCode: `AG-${timestamp.toString().slice(-6)}`,
      status: BookingStatus.REPROGRAMACION_PENDIENTE,
      tripType: 'ONE_WAY',
      passengersCount: 1,
      cabinClass: CabinClass.ECONOMY,
      totalAmount: 50000,
      contactEmail: 'us14b.contingencia@uns.edu.ar',
      flights: {
        create: {
          flightId: flightA.id,
          fareId: fareA.fareId,
          price: fareA.price,
          departureAt: departureA,
        },
      },
      passengers: {
        create: {
          firstName: 'Lucía',
          lastName: 'Gómez',
          documentNumber: `14B${timestamp.toString().slice(-5)}`,
          documentType: 'DNI',
        },
      },
    },
  });

  const endpoint = 'http://localhost/api/v1/reservas/consulta/reprogramar';
  const lookup = {
    code: booking.bookingCode,
    lastName: 'Gómez',
    flightCode: flightA.code,
  };

  try {
    // La búsqueda tampoco debe exponer alternativas durante la contingencia.
    const searchResponse = await POST(
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          ...lookup,
          date: departureB.toISOString().slice(0, 10),
        }),
      }),
    );
    const searchBody = (await searchResponse.json()) as {
      ok: false;
      error: { message: string };
    };
    assert.equal(searchResponse.status, 409);
    assert.equal(searchBody.ok, false);
    assert.equal(searchBody.error.message, CONTINGENCY_REPROGRAMMING_MESSAGE);

    // La confirmación debe rechazarse sin modificar cupos ni el tramo reservado.
    const confirmResponse = await POST(
      new Request(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          ...lookup,
          replacementFlightId: flightB.id,
          replacementFareId: fareB.fareId,
          seatIds: [],
        }),
      }),
    );
    const confirmBody = (await confirmResponse.json()) as {
      ok: false;
      error: { message: string };
    };
    assert.equal(confirmResponse.status, 409);
    assert.equal(confirmBody.ok, false);
    assert.equal(confirmBody.error.message, CONTINGENCY_REPROGRAMMING_MESSAGE);

    const storedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { flights: true },
    });
    assert.equal(storedBooking.status, BookingStatus.REPROGRAMACION_PENDIENTE);
    assert.equal(storedBooking.flights[0]?.flightId, flightA.id);

    const storedFareB = await prisma.flightFare.findUniqueOrThrow({
      where: { id: fareB.id },
    });
    assert.equal(storedFareB.availableSeats, 10, 'no debe descontar cupo del vuelo destino');
  } finally {
    await prisma.bookingPassenger.deleteMany({ where: { bookingId: booking.id } });
    await prisma.bookingFlight.deleteMany({ where: { bookingId: booking.id } });
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
    await prisma.flightFare.deleteMany({ where: { flightId: { in: [flightA.id, flightB.id] } } });
    await prisma.flight.deleteMany({ where: { id: { in: [flightA.id, flightB.id] } } });
    await prisma.aircraft.delete({ where: { id: aircraft.id } }).catch(() => {});
  }
});
