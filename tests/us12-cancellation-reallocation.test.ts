import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingStatus, CabinClass, FlightStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  actualizarRespuestaPasajero,
  cambiarVueloReserva,
  cancelarReservaContingencia,
  cancelarVuelo,
  confirmarReasignacion,
  getCancelacionInfo,
  getPasajerosAfectados,
  getReservasAfectadas,
  getVuelosAlternativosParaReserva,
  reprogramarPasajeros,
} from '@/lib/contingencias';

test('US-12A y US-12B v2.0: Ciclo de vida completo de cancelación lógica y reasignación operativa', async (t) => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'aerogestion.example';
  t.after(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });
  const origin = 'https://aerogestion.example';
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

  // Crear aeronave con asientos físicos
  const aircraft = await prisma.aircraft.create({
    data: {
      registration: testReg,
      model: 'Boeing 737-800 Test',
      manufacturer: 'Boeing',
      seatCount: 150,
      seats: {
        create: [
          { rowNumber: 1, columnLetter: 'A', cabinClass: CabinClass.ECONOMY },
          { rowNumber: 1, columnLetter: 'B', cabinClass: CabinClass.ECONOMY },
          { rowNumber: 1, columnLetter: 'C', cabinClass: CabinClass.ECONOMY },
          { rowNumber: 2, columnLetter: 'A', cabinClass: CabinClass.ECONOMY },
          { rowNumber: 2, columnLetter: 'B', cabinClass: CabinClass.ECONOMY },
          { rowNumber: 2, columnLetter: 'C', cabinClass: CabinClass.ECONOMY },
        ],
      },
    },
    include: { seats: true },
  });

  const fares = await prisma.fare.findMany({ where: { isActive: true }, take: 3 });
  assert.ok(fares.length >= 1, 'Debe haber al menos 1 tarifa activa en la base');
  const economyFare = (await prisma.fare.findFirst({ where: { name: 'Economy' } })) || fares[0]!;

  // Crear vuelo a cancelar (Vuelo A)
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

  // Crear vuelo alternativo 1 (Vuelo B) para la misma ruta (sale 6h después de A)
  const departureB = new Date(departureA.getTime() + 6 * 3600000);
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

  // Crear vuelo alternativo 2 (Vuelo C) para la misma ruta (sale 12h después de A)
  const departureC = new Date(departureA.getTime() + 12 * 3600000);
  const arrivalC = new Date(departureC.getTime() + 75 * 60000);

  const flightC = await prisma.flight.create({
    data: {
      code: `AG-C${timestamp.toString().slice(-3)}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt: departureC,
      arrivalAt: arrivalC,
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

  const fareA0 = flightA.fares.find((f) => f.fareId === economyFare.id) || flightA.fares[0]!;
  const fareB0 = flightB.fares.find((f) => f.fareId === economyFare.id) || flightB.fares[0]!;
  const fareC0 = flightC.fares.find((f) => f.fareId === economyFare.id) || flightC.fares[0]!;

  // Reserva 1: 2 pasajeros en vuelo A
  const bookingCode1 = `T1${timestamp.toString().slice(-4)}`;
  const booking1 = await prisma.booking.create({
    data: {
      bookingCode: bookingCode1,
      status: BookingStatus.PAID,
      tripType: 'ONE_WAY',
      passengersCount: 2,
      cabinClass: CabinClass.ECONOMY,
      totalAmount: 150000,
      contactEmail: 'pasajero1.test@uns.edu.ar',
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

  // Reserva 2: 1 pasajero en vuelo A
  const bookingCode2 = `T2${timestamp.toString().slice(-4)}`;
  const booking2 = await prisma.booking.create({
    data: {
      bookingCode: bookingCode2,
      status: BookingStatus.CONFIRMED,
      tripType: 'ONE_WAY',
      passengersCount: 1,
      cabinClass: CabinClass.ECONOMY,
      totalAmount: 75000,
      contactEmail: 'pasajero2.test@uns.edu.ar',
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
            firstName: 'Esteban',
            lastName: 'Quito',
            documentNumber: '35123456',
            documentType: 'DNI',
          },
        ],
      },
    },
  });

  let booking3Id: string | null = null;
  let bookingWithoutAlternativeId: string | null = null;

  try {
    // -------------------------------------------------------------
    // TEST 1: US-12A - Información previa de cancelación (WF-12A)
    // -------------------------------------------------------------
    const info = await getCancelacionInfo(flightA.id);
    assert.equal(info.flight.id, flightA.id);
    assert.equal(info.affectedBookingsCount, 2);
    assert.equal(info.affectedPassengersCount, 3);
    const totalInBreakdown = info.breakdown.economy + info.breakdown.economyPremium + info.breakdown.primeraClase;
    assert.equal(totalInBreakdown, 3);

    // -------------------------------------------------------------
    // TEST 2: US-12A - Cancelación Lógica del Vuelo y Retiro Comercial
    // -------------------------------------------------------------
    const cancellations = await Promise.allSettled([
      cancelarVuelo(flightA.id, 'Clima', adminId),
      cancelarVuelo(flightA.id, 'Clima', adminId),
    ]);
    const succeeded = cancellations.filter((result) => result.status === 'fulfilled');
    const rejected = cancellations.filter((result) => result.status === 'rejected');
    assert.equal(succeeded.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason.status, 400);
    const cancelRes = succeeded[0]!.value;
    assert.equal(cancelRes.flightId, flightA.id);
    assert.equal(cancelRes.reason, 'Clima');
    assert.equal(cancelRes.affectedPassengersCount, 3);

    // Verificar en BD que el vuelo está CANCELLED y tiene la nota
    const updatedFlightA = await prisma.flight.findUniqueOrThrow({ where: { id: flightA.id } });
    assert.equal(updatedFlightA.status, FlightStatus.CANCELLED);
    assert.ok(updatedFlightA.notes?.includes('Clima'));

    const notices = await prisma.emailDispatch.findMany({
      where: { bookingId: { in: [booking1.id, booking2.id] } },
      orderBy: { recipient: 'asc' },
    });
    assert.equal(notices.length, 2);
    for (const [index, booking] of [booking1, booking2].entries()) {
      const notice = notices[index]!;
      assert.equal(notice.kind, 'FLIGHT_CANCELLED');
      assert.equal(notice.dedupeKey, `cancel-${flightA.id}-${booking.id}`);
      assert.equal(notice.recipient, booking.contactEmail);
      assert.equal(notice.paymentId, null);
      assert.equal(notice.status, 'PENDIENTE');
      assert.deepEqual(notice.snapshot, {
        version: 1,
        recipient: booking.contactEmail,
        greetingName: index === 0 ? 'Mariano' : 'Esteban',
        displayCode: booking.bookingCode,
        bookingUrl: 'http://localhost:3000/reserva',
        reason: 'Clima',
        status: 'REASIGNACION_PROPUESTA',
        cancelled: { flightCode: flightA.code, departureAt: departureA.toISOString(), arrivalAt: arrivalA.toISOString() },
        proposed: { flightCode: flightB.code, departureAt: departureB.toISOString(), arrivalAt: arrivalB.toISOString() },
      });
    }

    // -------------------------------------------------------------
    // TEST 3: US-12B v2.0 - Métricas y Propuestas Automáticas (WF-12B)
    // -------------------------------------------------------------
    const contingencyData = await getReservasAfectadas(flightA.id);
    assert.equal(contingencyData.flight.id, flightA.id);
    assert.equal(contingencyData.metrics.totalAfectadas, 2);
    assert.equal(contingencyData.metrics.totalPasajeros, 3);
    assert.equal(contingencyData.metrics.conPropuesta, 2);
    assert.equal(contingencyData.metrics.reprogramadas, 0);
    assert.equal(contingencyData.metrics.sinAlternativa, 0);
    assert.equal(contingencyData.metrics.pendientesSinRespuesta, 2);

    // Verificar que ambas reservas tienen asignada la propuesta en Flight B (el más cercano)
    const res1 = contingencyData.reservas.find((r) => r.id === booking1.id);
    assert.ok(res1);
    assert.equal(res1.status, BookingStatus.REASIGNACION_PROPUESTA);
    assert.equal(res1.vueloPropuesto?.id, flightB.id);
    assert.equal(res1.respuestaPasajero, 'PENDIENTE');
    assert.ok(res1.propuestaMotivo?.includes('Sugerido'));
    assert.equal(res1.asientosAsignados.length, 2);

    const res2 = contingencyData.reservas.find((r) => r.id === booking2.id);
    assert.ok(res2);
    assert.equal(res2.status, BookingStatus.REASIGNACION_PROPUESTA);
    assert.equal(res2.vueloPropuesto?.id, flightB.id);
    assert.equal(res2.asientosAsignados.length, 1);

    // -------------------------------------------------------------
    // TEST 4: US-12B v2.0 - Actualización de respuesta del pasajero
    // -------------------------------------------------------------
    await actualizarRespuestaPasajero({
      bookingIdOrCode: booking1.bookingCode,
      respuesta: 'ACEPTA',
      userId: adminId,
    });

    const b1AfterResponse = await prisma.booking.findUniqueOrThrow({ where: { id: booking1.id } });
    assert.equal(b1AfterResponse.respuestaPasajero, 'ACEPTA');

    // -------------------------------------------------------------
    // TEST 5: US-12B v2.0 - Consulta de Vuelos Alternativos (WF-12B-E)
    // -------------------------------------------------------------
    const drawerData = await getVuelosAlternativosParaReserva(booking1.bookingCode);
    assert.ok(drawerData.flights.length >= 2);
    const optionB = drawerData.flights.find((o) => o.id === flightB.id);
    assert.ok(optionB?.isCurrentProposal, 'Flight B debe figurar como la propuesta actual');

    // -------------------------------------------------------------
    // TEST 6: US-12B v2.0 - Capacidad Insuficiente en Cambio Manual (Literal WF-12B-E)
    // -------------------------------------------------------------
    // Forzar falta de cupo en Flight C (dispone de 1 asiento libre, pero la reserva 1 requiere 2)
    await prisma.flightFare.updateMany({
      where: { flightId: flightC.id },
      data: { availableSeats: 0 },
    });
    await prisma.flightFare.update({
      where: { id: fareC0.id },
      data: { availableSeats: 1 },
    });

    await assert.rejects(
      async () =>
        cambiarVueloReserva({
          bookingIdOrCode: booking1.bookingCode,
          newFlightId: flightC.id,
          userId: adminId,
        }),
      (err: any) => {
        assert.equal(err.status, 409);
        // Debe coincidir con la plantilla exacta de WF-12B-E:
        // "El vuelo {vuelo} solo dispone de {n} asientos libres en {clase}. Se requieren {m} para reubicar la reserva {código}."
        assert.ok(
          err.message.includes(`solo dispone de 1 asientos libres en Economy. Se requieren 2 para reubicar la reserva ${booking1.bookingCode}`),
          `El mensaje debe coincidir con la plantilla esperada. Recibido: ${err.message}`,
        );
        return true;
      },
    );

    // -------------------------------------------------------------
    // TEST 7: US-12B v2.0 - Cambio de Vuelo Manual Exitoso
    // -------------------------------------------------------------
    // Restaurar cupos en Flight C
    await prisma.flightFare.update({
      where: { id: fareC0.id },
      data: { availableSeats: 10 },
    });

    await cambiarVueloReserva({
      bookingIdOrCode: booking1.bookingCode,
      newFlightId: flightC.id,
      userId: adminId,
    });

    const b1Changed = await prisma.booking.findUniqueOrThrow({
      where: { id: booking1.id },
      include: { flights: true },
    });
    // Al cambiar manualmente de vuelo, la reserva pasa a tener la nueva propuesta con respuesta PENDIENTE
    assert.equal(b1Changed.status, BookingStatus.REASIGNACION_PROPUESTA);
    assert.equal(b1Changed.vueloPropuestoId, flightC.id);
    assert.equal(b1Changed.respuestaPasajero, 'PENDIENTE');

    // -------------------------------------------------------------
    // TEST 8: US-12B v2.0 - Confirmación de Reasignación Propuesta (WF-12B)
    // -------------------------------------------------------------
    await confirmarReasignacion({
      bookingIds: [booking1.id, booking2.id],
      userId: adminId,
      origin,
    });

    const b1Confirmed = await prisma.booking.findUniqueOrThrow({
      where: { id: booking1.id },
      include: { flights: true },
    });
    assert.equal(b1Confirmed.status, BookingStatus.REPROGRAMADA);
    assert.equal(b1Confirmed.flights[0]?.flightId, flightC.id);

    const b2Confirmed = await prisma.booking.findUniqueOrThrow({
      where: { id: booking2.id },
      include: { flights: true },
    });
    assert.equal(b2Confirmed.status, BookingStatus.REPROGRAMADA);
    assert.equal(b2Confirmed.flights[0]?.flightId, flightB.id);
    for (const booking of [booking1, booking2]) {
      const notice = await prisma.emailDispatch.findFirstOrThrow({
        where: { bookingId: booking.id, kind: 'ITINERARY_CHANGE' },
      });
      assert.equal(notice.recipient, booking.contactEmail);
      assert.equal((notice.snapshot as { bookingUrl: string }).bookingUrl, `${origin}/reserva`);
    }

    // -------------------------------------------------------------
    // TEST 9: US-12B v2.0 - Cancelación por Contingencia y Reembolso (WF-12B-C)
    // -------------------------------------------------------------
    const bookingCode3 = `T3${timestamp.toString().slice(-4)}`;
    const booking3 = await prisma.booking.create({
      data: {
        bookingCode: bookingCode3,
        status: BookingStatus.REASIGNACION_PROPUESTA,
        tripType: 'ONE_WAY',
        passengersCount: 1,
        cabinClass: CabinClass.ECONOMY,
        totalAmount: 80000,
        contactEmail: 'pasajero3.test@uns.edu.ar',
        vueloOriginalId: flightA.id,
        vueloPropuestoId: flightB.id,
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
              firstName: 'Ana',
              lastName: 'Cancelada',
              documentNumber: '40123987',
              documentType: 'DNI',
            },
          ],
        },
      },
    });
    booking3Id = booking3.id;

    await cancelarReservaContingencia({
      bookingIdOrCode: booking3.bookingCode,
      userId: adminId,
      origin,
    });

    const b3Cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking3.id } });
    assert.equal(b3Cancelled.status, BookingStatus.CANCELLED);
    assert.equal(b3Cancelled.reembolsoPendiente, true);
    assert.ok(b3Cancelled.notes?.includes('Contingencia – rechaza alternativas'));
    const bookingCancellation = await prisma.emailDispatch.findUniqueOrThrow({
      where: { dedupeKey: `booking-cancelled-${booking3.id}` },
    });
    assert.equal(bookingCancellation.kind, 'BOOKING_CANCELLED');
    assert.equal(bookingCancellation.recipient, booking3.contactEmail);
    assert.equal((bookingCancellation.snapshot as { bookingUrl: string }).bookingUrl, `${origin}/reserva`);

    // -------------------------------------------------------------
    // TEST 10: Wrappers de compatibilidad
    // -------------------------------------------------------------
    const compatData = await getPasajerosAfectados(flightA.id);
    assert.equal(compatData.flight.id, flightA.id);
    assert.ok(Array.isArray(compatData.passengers));

    // US-06B: el motor no encuentra cupo para esta reserva del vuelo C.
    const bookingWithoutAlternative = await prisma.booking.create({
      data: {
        bookingCode: `T4${timestamp.toString().slice(-4)}`,
        status: BookingStatus.PAID,
        contactEmail: 'pasajero4.test@uns.edu.ar',
        flights: { create: { flightId: flightC.id, fareId: fareC0.fareId, price: fareC0.price, departureAt: departureC } },
        passengers: {
          create: { firstName: 'Elena', lastName: 'Pérez', documentNumber: '39112806', documentType: 'DNI' },
        },
      },
    });
    bookingWithoutAlternativeId = bookingWithoutAlternative.id;
    await prisma.flightFare.updateMany({ where: { flightId: flightB.id }, data: { availableSeats: 0 } });
    await cancelarVuelo({ flightId: flightC.id, reason: 'Mantenimiento', userId: adminId, origin: 'https://aerogestion.example' });
    const fallback = await prisma.emailDispatch.findUniqueOrThrow({
      where: { dedupeKey: `cancel-${flightC.id}-${bookingWithoutAlternative.id}` },
    });
    assert.deepEqual(fallback.snapshot, {
      version: 1,
      recipient: bookingWithoutAlternative.contactEmail,
      greetingName: 'Elena',
      displayCode: bookingWithoutAlternative.bookingCode,
      bookingUrl: `${origin}/reserva`,
      reason: 'Mantenimiento',
      status: 'SIN_ALTERNATIVA',
      cancelled: { flightCode: flightC.code, departureAt: departureC.toISOString(), arrivalAt: arrivalC.toISOString() },
      proposed: null,
    });
  } finally {
    // Cleanup: eliminar datos creados en el test
    const bookingIds = [booking1.id, booking2.id, booking3Id, bookingWithoutAlternativeId].filter(Boolean) as string[];
    await prisma.emailDispatch.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingPassenger.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.bookingFlight.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.flightFare.deleteMany({ where: { flightId: { in: [flightA.id, flightB.id, flightC.id] } } });
    await prisma.flight.deleteMany({ where: { id: { in: [flightA.id, flightB.id, flightC.id] } } });
    await prisma.seat.deleteMany({ where: { aircraftId: aircraft.id } });
    await prisma.aircraft.delete({ where: { id: aircraft.id } }).catch(() => {});
  }
});
