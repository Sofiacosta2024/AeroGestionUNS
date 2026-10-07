import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentSchema } from '../src/lib/validation';
import { mockPaymentStatus, digitsOnly } from '../src/lib/mock-payment';
import {
  receiptContent,
  sendReceipt,
  type Receipt,
} from '../src/lib/payment-email';
const valid = {
  method: 'CREDIT_CARD',
  cardNumber: '1234567890123456',
  cardholder: 'Manu Tina',
  expiry: '12/99',
  cvv: '123',
  contactEmail: 'pasajero@example.com',
  installments: 1,
};
test('rechaza tarjetas con letras y longitudes incorrectas antes de procesar', () => {
  for (const cardNumber of [
    '123456789012345',
    '12345678901234567',
    '123456789012345a',
  ])
    assert.equal(
      paymentSchema.safeParse({ ...valid, cardNumber }).success,
      false,
    );
});
test('solo una tarjeta compuesta por unos rechaza el pago simulado', () => {
  assert.equal(mockPaymentStatus('1111111111111111'), 'REJECTED');
  for (const card of [
    '1111111111111112',
    '0000000000000000',
    '1234567890123456',
  ])
    assert.equal(mockPaymentStatus(card), 'APPROVED');
  assert.throws(() => mockPaymentStatus('1111'));
});
test('limita los campos numericos y elimina letras y separadores pegados', () => {
  assert.equal(digitsOnly('1234 ab5678-9012 34567', 16), '1234567890123456');
  assert.equal(digitsOnly('12a345', 4), '1234');
});
test('ignora importes y aprobaciones enviados por el navegador', () => {
  const result = paymentSchema.parse({
    ...valid,
    amount: 1,
    status: 'APPROVED',
    transactionRef: 'inventada',
  });
  assert.equal('amount' in result, false);
  assert.equal('status' in result, false);
  assert.equal('transactionRef' in result, false);
});
const receipt: Receipt = {
  code: 'AG-TEST01',
  email: 'pasajero@example.com',
  reference: 'MOCK-test',
  amount: 165400,
  currency: 'ARS',
  flights: [
    {
      code: 'AG-1420',
      origin: 'BHI · Bahía Blanca',
      destination: 'AEP · Buenos Aires',
      departureAt: '2027-11-18T10:45:00Z',
      arrivalAt: '2027-11-18T11:55:00Z',
      isDirect: true,
    },
  ],
  passengers: [{ name: '<script>alert(1)</script>', seat: '12A' }],
};
test('el comprobante escapa datos de pasajeros y aclara que no hubo cobro real', () => {
  const content = receiptContent(receipt);
  assert.ok(!content.html.includes('<script>'));
  assert.ok(content.html.includes('&lt;script&gt;'));
  assert.ok(content.text.includes('No se realizó ningún cobro real'));
  assert.ok(content.text.includes('07:45–08:55 ART'));
});
test('Resend recibe el destinatario elegido y una clave estable para evitar duplicados', async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const email = await sendReceipt(receipt, 'payment-test', {
    apiKey: 'test-key',
    from: 'Demo <onboarding@resend.dev>',
    fetch: (async (url, init) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ id: 'email-test' }), {
        status: 200,
      });
    }) as typeof fetch,
  });
  assert.equal(email.status, 'accepted');
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.deepEqual(JSON.parse(String(captured.init?.body)).to, [
    'pasajero@example.com',
  ]);
  assert.equal(
    new Headers(captured.init?.headers).get('Idempotency-Key'),
    'payment-test',
  );
});
test('una restriccion de Resend o un fallo de red se informa sin fingir envio exitoso', async () => {
  const restricted = await sendReceipt(receipt, 'payment-test', {
    apiKey: 'test-key',
    fetch: (async () =>
      new Response(
        JSON.stringify({
          message:
            'You can only send testing emails to your own email address.',
        }),
        { status: 403 },
      )) as typeof fetch,
  });
  assert.equal(restricted.status, 'failed');
  assert.ok(restricted.message.includes('titular'));
  const network = await sendReceipt(receipt, 'payment-test', {
    apiKey: 'test-key',
    fetch: (async () => {
      throw new Error('network failure');
    }) as typeof fetch,
  });
  assert.equal(network.status, 'failed');
});
test('acepta tarjetas arbitrarias sin validar banco ni Luhn y conserva datos validados', () => {
  const parsed = paymentSchema.parse(valid);
  assert.equal(
    (parsed as Record<string, unknown>).cardNumber,
    '1234567890123456',
  );
});
test('rechaza CVV no numerico, titular vacio, mail invalido y vencimiento pasado', () => {
  for (const change of [
    { cvv: '12' },
    { cvv: 'a12' },
    { cardholder: ' ' },
    { contactEmail: 'no-mail' },
    { expiry: '13/99' },
    { expiry: '01/20' },
  ])
    assert.equal(
      paymentSchema.safeParse({ ...valid, ...change }).success,
      false,
    );
});
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../src/lib/auth';
import { settlePayment } from '../src/lib/payment-service';
import { ApiError } from '../src/lib/api';
const owner: AuthUser = {
  id: 'owner',
  email: 'owner@example.com',
  firstName: 'Manu',
  lastName: 'Tina',
  role: 'PASAJERO',
  legajo: null,
};
function transactionFixture(overrides: Record<string, unknown> = {}) {
  const state: any = {
    id: 'booking',
    bookingCode: 'AG-TEST01',
    userId: 'owner',
    status: 'PENDING',
    totalAmount: 165400,
    currency: 'ARS',
    contactEmail: 'old@example.com',
    passengersCount: 1,
    passengers: [{ id: 'passenger' }],
    payments: [],
    flights: [],
    ...overrides,
  };
  const writes: Record<string, unknown>[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async (sql: Prisma.Sql) => {
      assert.ok(sql.text.includes('FOR UPDATE'));
      assert.deepEqual(sql.values, ['AG-TEST01']);
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
    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        const payment = { ...data, id: 'payment' };
        state.payments.push(payment);
        return payment;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { state, writes, tx };
}
test('aprobar toma el total de la reserva, la marca pagada y no persiste tarjeta ni CVV', async () => {
  const f = transactionFixture();
  const result = await settlePayment(
    f.tx,
    'AG-TEST01',
    owner,
    paymentSchema.parse(valid),
  );
  assert.equal(result.payment.status, 'APPROVED');
  assert.equal(f.state.status, 'PAID');
  assert.equal(f.state.contactEmail, 'pasajero@example.com');
  assert.equal(f.writes[0]?.amount, 165400);
  assert.deepEqual(
    Object.keys(f.writes[0]!).sort(),
    [
      'amount',
      'bookingId',
      'currency',
      'installments',
      'method',
      'paidAt',
      'status',
      'transactionRef',
    ].sort(),
  );
  // Un reintento reutiliza el mismo pago, aunque cambie la tarjeta ingresada.
  const again = await settlePayment(
    f.tx,
    'AG-TEST01',
    owner,
    paymentSchema.parse({ ...valid, cardNumber: '1111111111111111' }),
  );
  assert.equal(again.reused, true);
  assert.equal(again.payment.id, result.payment.id);
  assert.equal(f.writes.length, 1);
});
test('rechazar registra un intento y conserva la reserva sin pagar para reintentar', async () => {
  const f = transactionFixture();
  const result = await settlePayment(
    f.tx,
    'AG-TEST01',
    owner,
    paymentSchema.parse({ ...valid, cardNumber: '1111111111111111' }),
  );
  assert.equal(result.payment.status, 'REJECTED');
  assert.equal(f.state.status, 'PENDING');
  assert.equal(f.writes[0]?.paidAt, null);
  const accepted = await settlePayment(
    f.tx,
    'AG-TEST01',
    owner,
    paymentSchema.parse(valid),
  );
  assert.equal(accepted.payment.status, 'APPROVED');
  assert.equal(f.state.status, 'PAID');
});
test('impide pagos de reservas ajenas, canceladas o con pasajeros incompletos', async () => {
  for (const [override, code] of [
    [{ userId: 'another-user' }, 'FORBIDDEN'],
    [{ status: 'CANCELLED' }, 'CONFLICT'],
    [{ passengers: [] }, 'CONFLICT'],
  ] as const) {
    const f = transactionFixture(override);
    await assert.rejects(
      () => settlePayment(f.tx, 'AG-TEST01', owner, paymentSchema.parse(valid)),
      (error: unknown) => error instanceof ApiError && error.code === code,
    );
    assert.equal(f.writes.length, 0);
  }
});
