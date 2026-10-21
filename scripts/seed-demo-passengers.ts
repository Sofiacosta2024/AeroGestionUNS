import { PrismaClient, FlightStatus, BookingStatus, CabinClass, DocumentType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedDemoContingencias() {
  console.log('--- Configurando vuelo demo AG-1021A para US-12A y US-12B ---');

  const flight = await prisma.flight.findFirst({
    where: { code: 'AG-1021A' },
    include: {
      route: { include: { originAirport: true, destinationAirport: true } },
      fares: { include: { fare: true } }
    }
  });

  if (!flight) {
    console.error('No se encontró el vuelo AG-1021A');
    return;
  }

  // Asegurar que el vuelo esté activo (SCHEDULED) para poder cancelarlo en la demo
  await prisma.flight.update({
    where: { id: flight.id },
    data: {
      status: FlightStatus.SCHEDULED,
      notes: null,
    }
  });

  // Asegurar que los vuelos alternativos estén SCHEDULED
  await prisma.flight.updateMany({
    where: {
      code: { in: ['AG-1701', 'AG-1021B', 'AG-1021C'] }
    },
    data: { status: FlightStatus.SCHEDULED }
  });

  // Buscar tarifas disponibles
  const fareEco = flight.fares.find(f => f.fare.name.toLowerCase().includes('eco') && !f.fare.name.toLowerCase().includes('premium')) || flight.fares[0];
  const farePrem = flight.fares.find(f => f.fare.name.toLowerCase().includes('premium')) || flight.fares[0];
  const fareFirst = flight.fares.find(f => f.fare.name.toLowerCase().includes('primera')) || flight.fares[1] || flight.fares[0];

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
      where: { bookingCode: dp.bookingCode }
    });

    if (existing) {
      await prisma.booking.update({
        where: { id: existing.id },
        data: {
          status: BookingStatus.PAID,
          cabinClass: dp.cabinClass,
        }
      });
      // Asegurar que el flight leg apunte a AG-1021A
      await prisma.bookingFlight.deleteMany({
        where: { bookingId: existing.id }
      });
      await prisma.bookingFlight.create({
        data: {
          bookingId: existing.id,
          flightId: flight.id,
          fareId: dp.fareId,
          price: 50000,
          departureAt: flight.departureAt,
        }
      });
      console.log(`✓ Reserva demo actualizada: ${dp.bookingCode} (${dp.firstName} ${dp.lastName})`);
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
            }
          },
          flights: {
            create: {
              flightId: flight.id,
              fareId: dp.fareId,
              price: 65000,
              departureAt: flight.departureAt,
            }
          }
        }
      });
      console.log(`✓ Reserva demo creada: ${dp.bookingCode} (${dp.firstName} ${dp.lastName})`);
    }
  }

  console.log('\n--- ¡Listo! Vuelo AG-1021A preparado con 4 pasajeros para la demo ---');
}

seedDemoContingencias()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
