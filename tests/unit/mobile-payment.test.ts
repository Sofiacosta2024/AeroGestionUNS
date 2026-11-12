import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../src/lib/api';
import type { AuthUser } from '../../src/lib/auth';
import {
  MOBILE_PAYMENT_NOT_FOUND,
  payOwnedMobileBooking,
  type MobilePaymentDeps,
} from '../../src/lib/mobile/payment';
import { settlePayment } from '../../src/lib/payment-service';
import {
  mobilePaymentSchema,
  type MobilePaymentInput,
} from '../../src/lib/validation';

const owner: AuthUser = {
  id: 'owner',
  email: 'owner@example.com',
  firstName: 'Ana',
  lastName: 'Perez',
  role: 'PASAJERO',
  legajo: null,
};

function authUser(role: AuthUser['role'], id = 'intruder'): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    firstName: 'Ana',
    lastName: 'Perez',
    role,
    legajo: null,
  };
}

const mobileBody = mobilePaymentSchema.parse({
  bookingCode: 'ag-7f3k9q',
  method: 'CREDIT_CARD',
  cardNumber: '1234567890123456',
  cardholder: 'Ana Perez',
  expiry: '12/99',
  cvv: '123',
  contactEmail: 'movil@example.com',
  installments: 1,
});

type SettleResult = Awaited<ReturnType<typeof settlePayment>>;
type SettleCall = { code: string; user: AuthUser; body: MobilePaymentInput };

const approvedResult = {
  payment: { id: 'payment', status: 'APPROVED', amount: 165400 },
  reused: false,
  booking: {},
  email: null,
} as unknown as SettleResult;

function makeDeps(options: {
  ownerId?: string | null;
  settle?: (call: SettleCall) => Promise<SettleResult>;
} = {}) {
  const calls: string[] = [];
  const deps: MobilePaymentDeps = {
    db: {
      booking: {
        findUnique: async () => {
          calls.push('find');
          if (options.ownerId === null) return null;
          return { userId: options.ownerId ?? owner.id };
        },
      },
    } as unknown as MobilePaymentDeps['db'],
    releaseExpiredSeatLocks: async (bookingCode) => {
      calls.push(`release:${bookingCode}`);
    },
    settlePayment: async (code, user, body) => {
      calls.push(`settle:${code}`);
      return options.settle
        ? options.settle({ code, user, body })
        : approvedResult;
    },
  };
  return { deps, calls };
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  let caught: unknown;
  await promise.catch((err) => {
    caught = err;
  });
  assert.notEqual(caught, undefined, 'se esperaba un rechazo');
  return caught;
}

function paymentTransactionFixture(overrides: Record<string, unknown> = {}) {
  const state: any = {
    id: 'booking',
    bookingCode: 'AG-7F3K9Q',
    userId: owner.id,
    status: 'PENDING',
    totalAmount: 165400,
    currency: 'ARS',
    contactEmail: 'old@example.com',
    passengersCount: 1,
    passengers: [
      {
        id: 'passenger',
        firstName: 'Ana',
        lastName: 'Perez',
        documentType: 'DNI',
        documentNumber: '30111222',
        seat: null,
      },
    ],
    payments: [],
    flights: [
      {
        departureAt: new Date('2027-01-01T10:00Z'),
        seatSelectionAmount: 0,
        flight: {
          code: 'AG-1420',
          departureAt: new Date('2027-01-01T10:00Z'),
          arrivalAt: new Date('2027-01-01T11:00Z'),
          route: {
            originAirport: { iataCode: 'BHI', city: 'Bahía Blanca' },
            destinationAirport: { iataCode: 'AEP', city: 'Buenos Aires' },
          },
        },
      },
    ],
    ...overrides,
  };
  const writes: Record<string, unknown>[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async (sql: Prisma.Sql) => {
      assert.ok(sql.text.includes('FOR UPDATE'));
      assert.deepEqual(sql.values, ['AG-7F3K9Q']);
      locked = true;
      return [{ id: state.id }];
    },
    booking: {
      findUnique: async () => {
        assert.equal(locked, true, 'leer luego de bloquear la reserva');
        return state;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return state;
      },
    },
    comprobante: { upsert: async () => ({}) },
    emailDispatch: { upsert: async () => ({ id: 'dispatch' }) },
    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        const payment = { ...data, id: 'payment', createdAt: new Date() };
        state.payments.push(payment);
        return payment;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { state, writes, tx };
}

test('US-10A: el usuario autenticado puede pagar su propia reserva', async () => {
  let received: SettleCall | undefined;
  const { deps, calls } = makeDeps({
    ownerId: owner.id,
    settle: async (call) => {
      received = call;
      return approvedResult;
    },
  });

  const result = await payOwnedMobileBooking(owner, mobileBody, deps);

  assert.equal(result, approvedResult);
  assert.deepEqual(calls, [
    'find',
    `release:${mobileBody.bookingCode}`,
    `settle:${mobileBody.bookingCode}`,
  ]);
  assert.equal(received?.code, mobileBody.bookingCode);
  assert.equal(received?.user, owner);
  assert.equal(received?.body, mobileBody);
});

for (const role of ['PASAJERO', 'ADMIN', 'MOSTRADOR'] as const) {
  test(`US-10A: ${role} no puede pagar una reserva ajena`, async () => {
    const { deps, calls } = makeDeps({ ownerId: 'another-user' });

    await assert.rejects(
      payOwnedMobileBooking(authUser(role), mobileBody, deps),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 404 &&
        err.code === 'NOT_FOUND' &&
        err.message === MOBILE_PAYMENT_NOT_FOUND,
    );
    assert.deepEqual(calls, ['find']);
  });
}

test('US-10A: una reserva ajena se rechaza antes de liberar asientos o llamar a settlePayment', async () => {
  const { deps, calls } = makeDeps({ ownerId: 'another-user' });

  await assert.rejects(
    payOwnedMobileBooking(owner, mobileBody, deps),
    (err: unknown) => err instanceof ApiError && err.status === 404,
  );
  assert.equal(calls.includes(`release:${mobileBody.bookingCode}`), false);
  assert.equal(calls.includes(`settle:${mobileBody.bookingCode}`), false);
});

test('US-10A: reserva inexistente y reserva ajena devuelven el mismo error', async () => {
  const missing = await captureError(
    payOwnedMobileBooking(owner, mobileBody, makeDeps({ ownerId: null }).deps),
  );
  const foreign = await captureError(
    payOwnedMobileBooking(owner, mobileBody, makeDeps({ ownerId: 'another-user' }).deps),
  );

  assert.ok(missing instanceof ApiError);
  assert.ok(foreign instanceof ApiError);
  assert.deepEqual(
    { status: foreign.status, code: foreign.code, message: foreign.message },
    { status: missing.status, code: missing.code, message: missing.message },
  );
  assert.equal(foreign.message, MOBILE_PAYMENT_NOT_FOUND);
});

test('US-10A: conserva el contactEmail enviado por el cliente móvil', async () => {
  let received: MobilePaymentInput | undefined;
  const { deps } = makeDeps({
    ownerId: owner.id,
    settle: async ({ body }) => {
      received = body;
      return approvedResult;
    },
  });

  await payOwnedMobileBooking(owner, mobileBody, deps);

  assert.equal(received?.contactEmail, 'movil@example.com');
  assert.notEqual(received?.contactEmail, owner.email);
});

test('US-10A: el pago aprobado de una reserva propia usa el contactEmail del cliente', async () => {
  const f = paymentTransactionFixture();
  const { deps } = makeDeps({
    ownerId: owner.id,
    settle: ({ code, user, body }) => settlePayment(f.tx, code, user, body),
  });

  const result = await payOwnedMobileBooking(owner, mobileBody, deps);

  assert.equal(result.payment.status, 'APPROVED');
  assert.equal(f.state.contactEmail, mobileBody.contactEmail);
  assert.equal(f.writes.length, 1);
});

test('US-10A: un pago aprobado existente de una reserva propia conserva la idempotencia', async () => {
  const existing = {
    id: 'payment-existing',
    bookingId: 'booking',
    method: 'CREDIT_CARD',
    amount: 165400,
    currency: 'ARS',
    status: 'APPROVED',
    transactionRef: 'MOCK-existing',
    installments: 1,
    paidAt: new Date('2027-01-01T10:05Z'),
    createdAt: new Date('2027-01-01T10:00Z'),
    updatedAt: new Date('2027-01-01T10:05Z'),
  };
  const f = paymentTransactionFixture({ status: 'PAID', payments: [existing] });
  const { deps } = makeDeps({
    ownerId: owner.id,
    settle: ({ code, user, body }) => settlePayment(f.tx, code, user, body),
  });

  const result = await payOwnedMobileBooking(owner, mobileBody, deps);

  assert.equal(result.reused, true);
  assert.equal(result.payment.id, existing.id);
  assert.equal(f.writes.length, 0);
});
