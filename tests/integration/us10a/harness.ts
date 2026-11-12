import { randomUUID } from 'node:crypto';
import { PrismaClient, type CabinClass } from '@prisma/client';
import { assertLocalTestDatabaseUrl, type LocalTestDatabase } from '../../../scripts/lib/test-db-safety';

if (process.env.NODE_ENV !== 'test' || process.env.AEROGESTION_TEST_DB !== '1' || process.env.US10A_TEST_DB !== '1') {
  throw new Error('Ejecutar exclusivamente mediante npm run test:integration:us10a:smoke o db:test:run.');
}

const testDatabase: LocalTestDatabase = assertLocalTestDatabaseUrl(process.env.DATABASE_URL, process.env);

export const db = new PrismaClient({ datasourceUrl: testDatabase.url });

export function testDatabaseInfo(): LocalTestDatabase {
  return testDatabase;
}

function safeTag(value?: string): string {
  const source = value ?? randomUUID().replaceAll('-', '');
  return source.replace(/[^a-z0-9]/gi, '').slice(0, 8) || randomUUID().replaceAll('-', '').slice(0, 8);
}

export async function resetTestDatabase(): Promise<void> {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export async function seedTestUsers(tag?: string) {
  const suffix = safeTag(tag);
  const [web, mobile] = await Promise.all([
    db.user.create({
      data: {
        clerkId: `test_web_${suffix}`,
        email: `us10a.web.${suffix}@example.test`,
        firstName: 'Web',
        lastName: 'Test',
        role: 'PASAJERO',
      },
    }),
    db.user.create({
      data: {
        clerkId: `test_mobile_${suffix}`,
        email: `us10a.mobile.${suffix}@example.test`,
        firstName: 'Mobile',
        lastName: 'Test',
        role: 'PASAJERO',
      },
    }),
  ]);
  return { web, mobile };
}

export async function seedFlight(options: { tag?: string; seatCount?: number; cabinClass?: CabinClass } = {}) {
  const suffix = safeTag(options.tag);
  const seatCount = options.seatCount ?? 4;
  const cabinClass = options.cabinClass ?? 'ECONOMY';
  if (!Number.isInteger(seatCount) || seatCount < 1) throw new Error('seatCount debe ser un entero positivo.');

  const [origin, destination] = await Promise.all([
    db.airport.upsert({
      where: { iataCode: 'BHI' },
      update: {},
      create: { iataCode: 'BHI', name: 'Bahía Blanca', city: 'Bahía Blanca' },
    }),
    db.airport.upsert({
      where: { iataCode: 'AEP' },
      update: {},
      create: { iataCode: 'AEP', name: 'Aeroparque', city: 'Buenos Aires' },
    }),
  ]);

  const route = await db.route.upsert({
    where: { originAirportId_destinationAirportId: { originAirportId: origin.iataCode, destinationAirportId: destination.iataCode } },
    update: {},
    create: {
      code: 'BHI-AEP',
      originAirportId: origin.iataCode,
      destinationAirportId: destination.iataCode,
      durationMinutes: 60,
    },
  });

  const aircraft = await db.aircraft.create({
    data: {
      registration: `T-${suffix}`,
      model: 'US10A Test',
      manufacturer: 'Test',
      seatCount,
      seats: {
        create: Array.from({ length: seatCount }, (_, index) => ({
          rowNumber: index + 1,
          columnLetter: 'A',
          cabinClass,
          type: 'AISLE',
        })),
      },
    },
    include: { seats: { orderBy: { rowNumber: 'asc' } } },
  });

  const fare = await db.fare.create({
    data: {
      code: `US10A-${suffix}`,
      name: 'US10A Test Fare',
      cabinClass,
      basePrice: 100,
      seatSelection: true,
      seatSelectionFee: 20,
    },
  });

  const departureAt = new Date(Date.now() + 86_400_000);
  const flight = await db.flight.create({
    data: {
      code: `T${suffix}`,
      routeId: route.id,
      aircraftId: aircraft.id,
      departureAt,
      arrivalAt: new Date(departureAt.getTime() + 3_600_000),
      fares: {
        create: {
          fareId: fare.id,
          price: 100,
          availableSeats: seatCount,
          seatCapacity: seatCount,
        },
      },
    },
  });

  return { flight, fare, aircraft, seats: aircraft.seats, route, origin, destination };
}

export async function getBookingsForFlight(flightId: string) {
  return db.booking.findMany({
    where: { flights: { some: { flightId } } },
    include: { flights: true, passengers: true, seatLocks: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getSeatLocksForFlight(flightId: string) {
  return db.seatLock.findMany({
    where: { flightId },
    include: { seat: true, booking: true },
    orderBy: { lockedAt: 'asc' },
  });
}

export async function closeTestDatabase(): Promise<void> {
  await db.$disconnect();
}
