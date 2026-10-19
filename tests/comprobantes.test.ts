import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/lib/api';
import type { AuthUser } from '../src/lib/auth';
import type { BookingWithRelations } from '../src/lib/bookings';
import { requireComprobanteAccess } from '../src/lib/comprobantes';

type PaymentInput = { id: string; status: string; transactionRef?: string };

/** Reserva minima: solo lo que mira la regla de acceso a comprobantes. */
function makeBooking(
  options: { userId?: string | null; payments?: PaymentInput[] } = {},
) {
  return {
    userId: options.userId === undefined ? 'user_owner' : options.userId,
    payments: options.payments ?? [
      { id: 'pay_1', status: 'APPROVED', transactionRef: 'MOCK-777' },
    ],
  } as unknown as BookingWithRelations;
}

function makeUser(id: string, role = 'PASAJERO') {
  return {
    id,
    email: `${id}@uns.edu.ar`,
    role,
    firstName: null,
    lastName: null,
    legajo: null,
  } as unknown as AuthUser;
}

/** Status del ApiError que lanza la funcion, 0 si no lanza. */
function statusOf(run: () => unknown): number {
  try {
    run();
  } catch (error) {
    return error instanceof ApiError ? error.status : -1;
  }
  return 0;
}

test('sin sesion no se descarga el comprobante (403)', () => {
  assert.equal(statusOf(() => requireComprobanteAccess(null, makeBooking())), 403);
});

test('un tercero no ve el comprobante de otra reserva (403)', () => {
  assert.equal(
    statusOf(() => requireComprobanteAccess(makeUser('user_ajeno'), makeBooking())),
    403,
  );
});

test('el dueño accede y el comprobante queda ligado a la transaccion de pago', () => {
  const payment = requireComprobanteAccess(makeUser('user_owner'), makeBooking());
  assert.equal(payment.status, 'APPROVED');
  assert.equal(payment.transactionRef, 'MOCK-777');
});

test('Operations accede al comprobante de cualquier reserva', () => {
  const payment = requireComprobanteAccess(
    makeUser('mostrador_1', 'MOSTRADOR'),
    makeBooking({ userId: 'otro_usuario' }),
  );
  assert.equal(payment.id, 'pay_1');
});

test('sin pago aprobado no hay comprobante (409)', () => {
  assert.equal(
    statusOf(() => requireComprobanteAccess(makeUser('user_owner'), makeBooking({ payments: [] }))),
    409,
  );
  assert.equal(
    statusOf(() =>
      requireComprobanteAccess(
        makeUser('user_owner'),
        makeBooking({ payments: [{ id: 'pay_2', status: 'REJECTED' }] }),
      ),
    ),
    409,
  );
});
