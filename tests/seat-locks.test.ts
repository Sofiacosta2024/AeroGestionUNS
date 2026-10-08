import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, CabinClass, BookingStatus } from '@prisma/client';
import { ApiError } from '../src/lib/api';
import {
  LOCK_DURATION_MS,
  MIN_SEATS_PER_RESERVATION,
  MAX_SEATS_PER_RESERVATION,
  lockSeatsAtomic,
  releaseExpiredSeatLocks,
} from '../src/lib/seat-locks';
import { lockSeatsSchema } from '../src/lib/validation';
import { settlePayment } from '../src/lib/payment-service';
import { paymentSchema } from '../src/lib/validation';

const validCuid = 'c1234567890123456789012345';
const validSeat1 = 'c123456789012345678901234a';
const validSeat2 = 'c123456789012345678901234b';

test('RF-03: constante de bloqueo temporal es exactamente de 5 minutos', () => {
  assert.equal(LOCK_DURATION_MS, 5 * 60 * 1000);
  assert.equal(MIN_SEATS_PER_RESERVATION, 1);
  assert.equal(MAX_SEATS_PER_RESERVATION, 9);
});

test('RF-03: esquema de validación controla entre 1 y hasta 9 asientos', () => {
  const base = {
    fareId: validCuid,
    contactEmail: 'pasajero@example.com',
  };

  // 0 asientos: rechazado
  assert.equal(lockSeatsSchema.safeParse({ ...base, seatIds: [] }).success, false);

  // 1 asiento: permitido
  assert.equal(lockSeatsSchema.safeParse({ ...base, seatIds: [validSeat1] }).success, true);

  // 9 asientos: permitido (máximo permitido por RF-03)
  const nineSeats = Array.from({ length: 9 }, (_, i) => `c123456789012345678901230${i}`);
  assert.equal(lockSeatsSchema.safeParse({ ...base, seatIds: nineSeats }).success, true);

  // 10 asientos: rechazado
  const tenSeats = Array.from({ length: 10 }, (_, i) => `c12345678901234567890123${i < 10 ? '0' + i : i}`);
  assert.equal(lockSeatsSchema.safeParse({ ...base, seatIds: tenSeats }).success, false);
});

function createMockSeatLockTx(overrides: {
  existingLocks?: Array<{ seatId: string; expiresAt: Date; booking: { status: BookingStatus } }>;
  existingPaid?: boolean;
  flightFareSeats?: number;
  aircraftSeatsClass?: CabinClass;
  fareClass?: CabinClass;
  uniqueConstraintError?: boolean;
} = {}) {
  const {
    existingLocks = [],
    existingPaid = false,
    flightFareSeats = 10,
    aircraftSeatsClass = CabinClass.ECONOMY,
    fareClass = CabinClass.ECONOMY,
    uniqueConstraintError = false,
  } = overrides;

  const createdLocks: Array<Record<string, unknown>> = [];
  const createdBookings: Array<Record<string, unknown>> = [];

  const tx = {
    booking: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdBookings.push(data);
        return { id: 'booking-1', bookingCode: 'AG-LOCK01', ...data };
      },
      update: async () => ({}),
    },
    seatLock: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => existingLocks,
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        if (uniqueConstraintError) {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.19.3',
          });
          throw err;
        }
        createdLocks.push(...data);
        return { count: data.length };
      },
    },
    flight: {
      findUnique: async () => ({
        id: validCuid,
        code: 'AG-1420',
        aircraftId: 'aircraft-1',
        departureAt: new Date('2026-10-10T10:00:00Z'),
        status: 'SCHEDULED',
        fares: [{ fareId: validCuid, price: new Prisma.Decimal(50000), currency: 'ARS' }],
      }),
    },
    seat: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        return where.id.in.map((id, index) => ({
          id,
          aircraftId: 'aircraft-1',
          rowNumber: index + 2,
          columnLetter: 'A',
          cabinClass: aircraftSeatsClass,
        }));
      },
    },
    fare: {
      findUnique: async () => ({
        id: validCuid,
        name: 'Economy Flex',
        cabinClass: fareClass,
      }),
    },
    bookingPassenger: {
      findFirst: async () => (existingPaid ? { id: 'bp-1' } : null),
      create: async () => ({ id: 'bp-1' }),
    },
    flightFare: {
      updateMany: async () => ({ count: flightFareSeats > 0 ? 1 : 0 }),
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, createdLocks, createdBookings };
}

test('RF-03: lockSeatsAtomic crea el bloqueo temporal con ventana de 5 minutos', async () => {
  const { tx, createdLocks, createdBookings } = createMockSeatLockTx();

  const before = Date.now();
  const result = await lockSeatsAtomic(
    {
      flightId: validCuid,
      fareId: validCuid,
      seatIds: [validSeat1, validSeat2],
      contactEmail: 'cliente@example.com',
    },
    tx,
  );
  const after = Date.now();

  assert.ok(result.bookingCode.startsWith('AG-'));
  assert.equal(result.seatsCount, 2);
  assert.equal(createdLocks.length, 2);

  // Verificar que expiresAt fue configurado exactamente a 5 minutos (con margen de 2s de ejecución)
  const expiresAtMs = new Date(result.expiresAt).getTime();
  assert.ok(expiresAtMs >= before + LOCK_DURATION_MS - 2000);
  assert.ok(expiresAtMs <= after + LOCK_DURATION_MS + 2000);

  // La reserva queda en estado PENDING con expiresAt
  assert.equal(createdBookings[0]?.status, BookingStatus.PENDING);
  assert.ok(createdBookings[0]?.expiresAt);
});

test('RF-03 (Método de Verificación): Simular selección simultánea del mismo asiento físico rechaza al segundo con "Asiento no disponible"', async () => {
  // Simular que el asiento ya está bloqueado por otro usuario en su ventana de 5 min
  const futureExpiry = new Date(Date.now() + 3 * 60 * 1000); // vence en 3 minutos
  const { tx } = createMockSeatLockTx({
    existingLocks: [
      {
        seatId: validSeat1,
        expiresAt: futureExpiry,
        booking: { status: BookingStatus.PENDING },
      },
    ],
  });

  await assert.rejects(
    () =>
      lockSeatsAtomic(
        {
          flightId: validCuid,
          fareId: validCuid,
          seatIds: [validSeat1],
          contactEmail: 'segundo_usuario@example.com',
        },
        tx,
      ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Asiento no disponible');
      return true;
    },
  );
});

test('RF-03: Exclusión mutua ante colisión de concurrencia atómica (P2002) responde "Asiento no disponible"', async () => {
  // Simular fallo de concurrencia a nivel de clave única en PostgreSQL (race condition atrapada por índice)
  const { tx } = createMockSeatLockTx({ uniqueConstraintError: true });

  await assert.rejects(
    () =>
      lockSeatsAtomic(
        {
          flightId: validCuid,
          fareId: validCuid,
          seatIds: [validSeat1],
          contactEmail: 'concurrente@example.com',
        },
        tx,
      ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Asiento no disponible');
      return true;
    },
  );
});

test('RF-03: Rechaza cuando los asientos no corresponden a la clase seleccionada', async () => {
  // Tarifa es FIRST (Primera Clase), pero los asientos son ECONOMY
  const { tx } = createMockSeatLockTx({
    fareClass: CabinClass.FIRST,
    aircraftSeatsClass: CabinClass.ECONOMY,
  });

  await assert.rejects(
    () =>
      lockSeatsAtomic(
        {
          flightId: validCuid,
          fareId: validCuid,
          seatIds: [validSeat1],
          contactEmail: 'pasajero@example.com',
        },
        tx,
      ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.ok(err.message.includes('no corresponde a la tarifa'));
      return true;
    },
  );
});

test('RF-03: Pago después de 5 minutos es rechazado y la reserva se cancela automáticamente', async () => {
  let bookingStatus: BookingStatus = BookingStatus.PENDING;
  let deletedLocks = false;
  let restoredSeats = 0;

  // Reserva creada hace 6 minutos (vencida)
  const expiredDate = new Date(Date.now() - 60 * 1000);

  const tx = {
    $queryRaw: async () => [{ id: 'b-1' }],
    booking: {
      findUnique: async () => ({
        id: 'b-1',
        bookingCode: 'AG-EXP01',
        userId: 'u-1',
        status: bookingStatus,
        passengersCount: 1,
        totalAmount: new Prisma.Decimal(50000),
        currency: 'ARS',
        contactEmail: 'expirado@example.com',
        expiresAt: expiredDate,
        flights: [{ flightId: validCuid, fareId: validCuid }],
        passengers: [{ firstName: 'Juan', lastName: 'Perez' }],
        payments: [],
      }),
      update: async ({ data }: { data: { status: BookingStatus } }) => {
        bookingStatus = data.status;
        return {};
      },
    },
    seatLock: {
      deleteMany: async () => {
        deletedLocks = true;
        return { count: 1 };
      },
    },
    flightFare: {
      updateMany: async ({ data }: { data: { availableSeats: { increment: number } } }) => {
        restoredSeats += data.availableSeats.increment;
        return { count: 1 };
      },
    },
    payment: {
      create: async () => ({ id: 'p-1' }),
    },
  } as unknown as Prisma.TransactionClient;

  const user = {
    id: 'u-1',
    email: 'expirado@example.com',
    role: 'PASAJERO' as const,
    legajo: null,
    firstName: 'Juan',
    lastName: 'Perez',
  };
  const cardData = paymentSchema.parse({
    method: 'CREDIT_CARD',
    cardNumber: '1234567890123456',
    cardholder: 'Juan Perez',
    expiry: '12/99',
    cvv: '123',
    contactEmail: 'expirado@example.com',
    installments: 1,
  });

  await assert.rejects(
    () => settlePayment(tx, 'AG-EXP01', user, cardData),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.ok(err.message.includes('5 minutos ha expirado'));
      return true;
    },
  );

  assert.equal(bookingStatus, BookingStatus.CANCELLED);
  assert.equal(deletedLocks, true);
  assert.equal(restoredSeats, 1);
});
