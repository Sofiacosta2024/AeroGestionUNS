import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingStatus, CabinClass, FlightStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  cancelarVuelo,
  getCancelacionInfo,
  getPasajerosAfectados,
  reprogramarPasajeros,
} from '@/lib/contingencias';

test('US-12A y US-12B: Ciclo de vida completo de cancelación lógica y reasignación operativa', async () => {
  // 1. Setup: Buscar usuario admin real para el audit log
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const adminId = adminUser?.id;

  const timestamp = Date.now();
  const testReg = `LV-T${timestamp.toString().slice(-4)}`;

  const airportOrigin = await prisma.airport.findFirstOrThrow();
  const airportDest = await prisma.airport.findFirstOrThrow({
    where: { iataCode: { not: airportOrigin.iataCode } },
  });

  // Asegurar o buscar ruta
  let route = await prisma.route.findUnique({
    where: {
      originAirportId_destinationAirportId: {
        originAirportId: airportOrigin.iataCode,
        destinationAirportId: airportDest.iataCode,
      },
    },
  });

  if (!route) {
    route = await prisma.route.create({
      data: {
        code: `R-${timestamp.toString().slice(-6)}`,
        originAirportId: airportOrigin.iataCode,
        destinationAirportId: airportDest.iataCode,
        durationMinutes: 75,
      },
    });
  }

  const aircraft = await prisma.aircraft.create({
    data: {
      registration: testReg,
      model: 'Boeing 737-800 Test',
      manufacturer: 'Boeing',
      seatCount: 150,
    },
  });

  const fares = await prisma.fare.findMany({ where: { isActive: true }, take: 3 });
  assert.ok(fares.length >= 1, 'Debe haber al menos 1 tarifa activa en la base');

  // Crear vuelo a cancelar (vuelo A)
  const departureA = new Date(Date.now() + 86400000 * 2); // En 2 días
  const arrivalA = new Date(departureA.getTime() + 75 * 60000);

  const flightA = await prisma.flight.create({
    data: {
      code: `AG-A${timestamp.toString().slice(-3)}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt: departureA,
      arrivalAt: arrivalA,
      status: FlightStatus.SCHEDULED,
      fares: {
        create: fares.map((f) => ({
          fareId: f.id,
          price: f.basePrice,
          availableSeats: 50,
          seatCapacity: 50,
        })),
      },
    },
    include: { fares: { include: { fare: true } } },
  });

  // Crear vuelo alternativo (vuelo B) para la misma ruta
  const departureB = new Date(Date.now() + 86400000 * 3); // En 3 días
  const arrivalB = new Date(departureB.getTime() + 75 * 60000);

  const flightB = await prisma.flight.create({
    data: {
      code: `AG-B${timestamp.toString().slice(-3)}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt: departureB,
      arrivalAt: arrivalB,
      status: FlightStatus.SCHEDULED,
      fares: {
        create: fares.map((f) => ({
          fareId: f.id,
          price: f.basePrice,
          availableSeats: 10,
          seatCapacity: 10,
        })),
      },
    },
    include: { fares: { include: { fare: true } } },
  });

  const fareA0 = flightA.fares[0]!;
  const fareB0 = flightB.fares[0]!;

  // Crear una reserva confirmada con 2 pasajeros en el vuelo A
  const bookingCode = `TST${timestamp.toString().slice(-3)}`;
  const bookingA = await prisma.booking.create({
    data: {
      bookingCode,
      status: BookingStatus.PAID,
      tripType: 'ONE_WAY',
      passengersCount: 2,
      cabinClass: CabinClass.ECONOMY,
      totalAmount: 150000,
      contactEmail: 'pasajero.test@uns.edu.ar',
      flights: {
        create: {
          flightId: flightA.id,
          fareId: fareA0.fareId,
          price: fareA0.price,
          departureAt: departureA,
        },
      },
      passengers: {
        create: [
          {
            firstName: 'Mariano',
            lastName: 'Rodríguez',
            documentNumber: '38452190',
            documentType: 'DNI',
          },
          {
            firstName: 'Lucía',
            lastName: 'Gómez',
            documentNumber: '39112804',
            documentType: 'DNI',
          },
        ],
      },
    },
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: US-12A - Información previa de cancelación (WF-12A)
    // -------------------------------------------------------------
    const info = await getCancelacionInfo(flightA.id);
    assert.equal(info.flight.id, flightA.id);
    assert.equal(info.affectedBookingsCount, 1);
    assert.equal(info.affectedPassengersCount, 2);
    assert.ok(info.breakdown.economy > 0 || info.breakdown.economyPremium > 0 || info.breakdown.primeraClase > 0);

    // -------------------------------------------------------------
    // TEST 2: US-12A - Cancelación Lógica del Vuelo y Retiro Comercial
    // -------------------------------------------------------------
    const cancelRes = await cancelarVuelo(flightA.id, 'Clima', adminId);
    assert.equal(cancelRes.flightId, flightA.id);
    assert.equal(cancelRes.reason, 'Clima');
    assert.equal(cancelRes.affectedPassengersCount, 2);

    // Verificar en BD que el vuelo está CANCELLED y tiene la nota
    const updatedFlightA = await prisma.flight.findUniqueOrThrow({ where: { id: flightA.id } });
    assert.equal(updatedFlightA.status, FlightStatus.CANCELLED);
    assert.ok(updatedFlightA.notes?.includes('Clima'));

    // Verificar que la reserva pasó a REPROGRAMACION_PENDIENTE
    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingA.id } });
    assert.equal(updatedBooking.status, BookingStatus.REPROGRAMACION_PENDIENTE);

    // Intentar cancelar nuevamente debe fallar con conflicto (409)
    await assert.rejects(
      async () => cancelarVuelo(flightA.id, 'Operativo', adminId),
      (err: any) => err.status === 409 && err.message.includes('ya se encuentra cancelado'),
    );

    // -------------------------------------------------------------
    // TEST 3: US-12B - Consulta de pasajeros afectados y vuelos sugeridos
    // -------------------------------------------------------------
    const contingencyData = await getPasajerosAfectados(flightA.id);
    assert.equal(contingencyData.flight.id, flightA.id);
    assert.equal(contingencyData.passengers.length, 2);
    assert.ok(contingencyData.passengers[0]);
    assert.equal(contingencyData.passengers[0].status, 'Pendiente de Reasignación');
    assert.equal(contingencyData.passengers[0].isReassigned, false);

    // Vuelo B debe ser sugerido como alternativo en la misma ruta
    const altFlightB = contingencyData.alternativeFlights.find((f) => f.id === flightB.id);
    assert.ok(altFlightB, 'El vuelo alternativo B debe figurar en la lista');

    // -------------------------------------------------------------
    // TEST 4: US-12B - Rechazo por cupos insuficientes (Mensaje exacto WF-12B-E1)
    // -------------------------------------------------------------
    // Setear availableSeats en flightB a 1 para forzar falta de cupo (se requieren 2)
    await prisma.flightFare.updateMany({
      where: { flightId: flightB.id },
      data: { availableSeats: 0 },
    });
    // Poner 1 asiento solo en la primera tarifa
    await prisma.flightFare.update({
      where: { id: fareB0.id },
      data: { availableSeats: 1 },
    });

    await assert.rejects(
      async () =>
        reprogramarPasajeros({
          flightId: flightA.id,
          newFlightId: flightB.id,
          bookingIds: [bookingA.id],
          userId: adminId,
        }),
      (err: any) => {
        assert.equal(err.status, 409);
        // Debe coincidir exactamente con el texto de la especificación:
        // "El vuelo seleccionado solo dispone de N asientos libres. Se requieren M ubicaciones para reasignar a los pasajeros."
        assert.match(
          err.message,
          /^El vuelo seleccionado solo dispone de \d+ asientos libres\. Se requieren \d+ ubicaciones para reasignar a los pasajeros\.$/,
        );
        return true;
      },
    );

    // -------------------------------------------------------------
    // TEST 5: US-12B - Reasignación atómica exitosa
    // -------------------------------------------------------------
    // Restaurar cupos suficientes en flightB
    await prisma.flightFare.updateMany({
      where: { flightId: flightB.id },
      data: { availableSeats: 15 },
    });

    const reassignRes = await reprogramarPasajeros({
      flightId: flightA.id,
      newFlightId: flightB.id,
      bookingIds: [bookingA.id],
      userId: adminId,
    });

    assert.equal(reassignRes.reallocatedCount, 2);
    assert.equal(reassignRes.newFlightCode, flightB.code);

    // Verificar en BD que la reserva quedó en REASIGNADO
    const reassignedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingA.id },
      include: { flights: true },
    });
    assert.equal(reassignedBooking.status, BookingStatus.REASIGNADO);
    assert.ok(reassignedBooking.flights[0]);
    assert.equal(reassignedBooking.flights[0].flightId, flightB.id);

    // Verificar que los cupos de flightB se redujeron en 2
    const updatedFareB = await prisma.flightFare.findUniqueOrThrow({
      where: { id: fareB0.id },
    });
    assert.equal(updatedFareB.availableSeats, 13);
  } finally {
    // Cleanup: eliminar datos creados en el test
    await prisma.bookingPassenger.deleteMany({ where: { bookingId: bookingA.id } });
    await prisma.bookingFlight.deleteMany({ where: { bookingId: bookingA.id } });
    await prisma.booking.delete({ where: { id: bookingA.id } }).catch(() => {});
    await prisma.flightFare.deleteMany({ where: { flightId: { in: [flightA.id, flightB.id] } } });
    await prisma.flight.deleteMany({ where: { id: { in: [flightA.id, flightB.id] } } });
    await prisma.aircraft.delete({ where: { id: aircraft.id } }).catch(() => {});
  }
});
