import { PrismaClient, FlightStatus, BookingStatus, CabinClass, DocumentType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDemoContingencias() {
  console.log('--- Configurando vuelos demo para hoy 9 de noviembre de 2026 ---');

  // Fechas: Hoy 9 de Noviembre de 2026
  const nov9_1021A_dep = new Date('2026-11-09T15:00:00.000Z');
  const nov9_1021A_arr = new Date('2026-11-09T16:15:00.000Z');

  const nov9_1701_dep = new Date('2026-11-09T18:30:00.000Z');
  const nov9_1701_arr = new Date('2026-11-09T19:45:00.000Z');

  const nov9_1021B_dep = new Date('2026-11-09T22:00:00.000Z');
  const nov9_1021B_arr = new Date('2026-11-09T23:15:00.000Z');

  const nov10_1021C_dep = new Date('2026-11-10T14:00:00.000Z');
  const nov10_1021C_arr = new Date('2026-11-10T15:15:00.000Z');

  // 1. Actualizar AG-1021A (Vuelo a cancelar en la demo)
  const flight = await prisma.flight.findFirst({
    where: { code: 'AG-1021A' },
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
      fares: { include: { fare: true } },
    },
  });

  if (!flight) {
    console.error('No se encontró el vuelo AG-1021A');
    return;
  }

  await prisma.flight.update({
    where: { id: flight.id },
    data: {
      status: FlightStatus.SCHEDULED,
      notes: null,
      departureAt: nov9_1021A_dep,
      arrivalAt: nov9_1021A_arr,
    },
  });
  console.log(`✓ Vuelo AG-1021A actualizado: salida 9 de Noviembre 2026 a las 12:00 (15:00 UTC)`);

  // 2. Actualizar vuelos alternativos para hoy 9 de Noviembre y mañana
  const f1701 = await prisma.flight.findFirst({ where: { code: 'AG-1701' } });
  if (f1701) {
    await prisma.flight.update({
      where: { id: f1701.id },
      data: {
        status: FlightStatus.SCHEDULED,
        departureAt: nov9_1701_dep,
        arrivalAt: nov9_1701_arr,
      },
    });
    console.log(`✓ Vuelo AG-1701 actualizado: salida 9 de Noviembre a las 15:30 (+3h 30m)`);
  }

  const f1021B = await prisma.flight.findFirst({ where: { code: 'AG-1021B' } });
  if (f1021B) {
    await prisma.flight.update({
      where: { id: f1021B.id },
      data: {
        status: FlightStatus.SCHEDULED,
        departureAt: nov9_1021B_dep,
        arrivalAt: nov9_1021B_arr,
      },
    });
    console.log(`✓ Vuelo AG-1021B actualizado: salida 9 de Noviembre a las 19:00 (+7h)`);
  }

  const f1021C = await prisma.flight.findFirst({ where: { code: 'AG-1021C' } });
  if (f1021C) {
    await prisma.flight.update({
      where: { id: f1021C.id },
      data: {
        status: FlightStatus.SCHEDULED,
        departureAt: nov10_1021C_dep,
        arrivalAt: nov10_1021C_arr,
      },
    });
    console.log(`✓ Vuelo AG-1021C actualizado: salida 10 de Noviembre (+23h)`);
  }

  // Restaurar cupos disponibles en todas las tarifas de los vuelos de la ruta
  const allFlightIds = [flight.id, f1701?.id, f1021B?.id, f1021C?.id].filter(Boolean) as string[];
  await prisma.flightFare.updateMany({
    where: { flightId: { in: allFlightIds } },
    data: { availableSeats: 30 },
  });

  // 3. Buscar tarifas para las reservas
  const fareEco = flight.fares.find((f) => f.fare.name.toLowerCase().includes('eco') && !f.fare.name.toLowerCase().includes('premium')) || flight.fares[0];
  const farePrem = flight.fares.find((f) => f.fare.name.toLowerCase().includes('premium')) || flight.fares[0];
  const fareFirst = flight.fares.find((f) => f.fare.name.toLowerCase().includes('primera')) || flight.fares[1] || flight.fares[0];

  if (!fareEco || !farePrem || !fareFirst) {
    console.error('No se encontraron tarifas suficientes en el vuelo');
    return;
  }

  const demoPassengers = [
    {
      firstName: 'Juan',
      lastName: 'Pérez',
      documentNumber: '30123456',
      documentType: DocumentType.DNI,
      cabinClass: CabinClass.ECONOMY,
      fareId: fareEco.fareId,
      bookingCode: 'AG-DEMO1',
    },
    {
      firstName: 'María',
      lastName: 'Gómez',
      documentNumber: '32456789',
      documentType: DocumentType.DNI,
      cabinClass: CabinClass.ECONOMY,
      fareId: fareEco.fareId,
      bookingCode: 'AG-DEMO2',
    },
    {
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      documentNumber: '28987654',
      documentType: DocumentType.DNI,
      cabinClass: CabinClass.ECONOMY,
      fareId: farePrem.fareId,
      bookingCode: 'AG-DEMO3',
    },
    {
      firstName: 'Laura',
      lastName: 'Fernández',
      documentNumber: '25111222',
      documentType: DocumentType.DNI,
      cabinClass: CabinClass.FIRST,
      fareId: fareFirst.fareId,
      bookingCode: 'AG-DEMO4',
    },
  ];

  for (const dp of demoPassengers) {
    const existing = await prisma.booking.findUnique({
      where: { bookingCode: dp.bookingCode },
    });

    if (existing) {
      await prisma.booking.update({
        where: { id: existing.id },
        data: {
          status: BookingStatus.PAID,
          cabinClass: dp.cabinClass,
          vueloOriginalId: null,
          vueloPropuestoId: null,
          respuestaPasajero: 'PENDIENTE',
          propuestaMotivo: null,
          reembolsoPendiente: false,
        },
      });

      // Liberar asientos asignados previamente
      await prisma.bookingPassenger.updateMany({
        where: { bookingId: existing.id },
        data: { seatId: null },
      });

      // Apuntar al vuelo original AG-1021A
      await prisma.bookingFlight.deleteMany({
        where: { bookingId: existing.id },
      });
      await prisma.bookingFlight.create({
        data: {
          bookingId: existing.id,
          flightId: flight.id,
          fareId: dp.fareId,
          price: 50000,
          departureAt: nov9_1021A_dep,
        },
      });
      console.log(`✓ Reserva demo reiniciada: ${dp.bookingCode} (${dp.firstName} ${dp.lastName})`);
    } else {
      await prisma.booking.create({
        data: {
          bookingCode: dp.bookingCode,
          status: BookingStatus.PAID,
          contactEmail: `${dp.firstName.toLowerCase()}@ejemplo.com`,
          contactPhone: '+54 11 4000-1111',
          totalAmount: 65000,
          cabinClass: dp.cabinClass,
          passengersCount: 1,
          passengers: {
            create: {
              firstName: dp.firstName,
              lastName: dp.lastName,
              documentNumber: dp.documentNumber,
              documentType: dp.documentType,
            },
          },
          flights: {
            create: {
              flightId: flight.id,
              fareId: dp.fareId,
              price: 65000,
              departureAt: nov9_1021A_dep,
            },
          },
        },
      });
      console.log(`✓ Reserva demo creada: ${dp.bookingCode} (${dp.firstName} ${dp.lastName})`);
    }
  }

  console.log('\n--- ¡Listo! Vuelos configurados para HOY 9 DE NOVIEMBRE DE 2026 ---');
}

seedDemoContingencias()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
