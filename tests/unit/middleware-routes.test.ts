import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublic, isAdmin, isMostrador } from '../../src/middleware';

/**
 * Rutas publicas y protegidas (US-14A). `createRouteMatcher` solo lee
 * `url` y `nextUrl.pathname`, asi que basta un duck-typed NextRequest.
 */

function req(path: string) {
  const url = `http://localhost${path}`;
  return { url, nextUrl: new URL(url) } as never;
}

// ---------------------------------------------------------------------------
// Publicas: consulta y sus dos documentos, pagina de reserva, login/sign-up
// ---------------------------------------------------------------------------

test('publicas: los tres endpoints de la consulta estan abiertos', () => {
  assert.equal(isPublic(req('/api/v1/reservas/consulta')), true);
  assert.equal(isPublic(req('/api/v1/reservas/consulta/pasaje')), true);
  assert.equal(isPublic(req('/api/v1/reservas/consulta/factura')), true);
});

test('publicas: la pagina de reserva y las de autenticacion', () => {
  assert.equal(isPublic(req('/reserva')), true);
  assert.equal(isPublic(req('/reserva/consulta')), true);
  assert.equal(isPublic(req('/login')), true);
  assert.equal(isPublic(req('/login/factor-one')), true);
  assert.equal(isPublic(req('/sign-up')), true);
});

// ---------------------------------------------------------------------------
// Protegidas: nada de negocio queda publico por wildcard
// ---------------------------------------------------------------------------

test('protegidas: APIs internas de reservas, pagos y pasajes', () => {
  assert.equal(isPublic(req('/api/bookings')), false);
  assert.equal(isPublic(req('/api/bookings/AG-7F3K9Q')), false);
  assert.equal(isPublic(req('/api/bookings/AG-7F3K9Q/payments')), false);
  assert.equal(isPublic(req('/api/bookings/AG-7F3K9Q/boarding-passes')), false);
});

test('protegidas: otros endpoints internos (flights, passengers, users, etc.)', () => {
  assert.equal(isPublic(req('/api/flights')), false);
  assert.equal(isPublic(req('/api/passengers')), false);
  assert.equal(isPublic(req('/api/users')), false);
  assert.equal(isPublic(req('/api/fares')), false);
  assert.equal(isPublic(req('/api/audit-logs')), false);
});

test('protegidas: admin y mostrador (paginas y APIs)', () => {
  assert.equal(isPublic(req('/admin')), false);
  assert.equal(isPublic(req('/admin/bookings')), false);
  assert.equal(isPublic(req('/api/admin/users')), false);
  assert.equal(isPublic(req('/mostrador')), false);
  assert.equal(isPublic(req('/mostrador/check-in')), false);
  assert.equal(isPublic(req('/api/mostrador/bookings')), false);
});

test('protegidas: prefijos parecidos a la consulta no cuelgan del publico', () => {
  assert.equal(isPublic(req('/api/v1/reservas/consultaXtra')), false);
  assert.equal(isPublic(req('/api/v1/reservas/consulta-admin')), false);
  assert.equal(isPublic(req('/api/v1/reservas/consulta/pasaje/admin')), false);
  assert.equal(isPublic(req('/api/v1/reservas/otra')), false);
  assert.equal(isPublic(req('/api/v1')), false);
  assert.equal(isPublic(req('/api')), false);
});

// ---------------------------------------------------------------------------
// Matchers de rol: siguen restringiendo como antes
// ---------------------------------------------------------------------------

test('isAdmin: solo rutas de admin', () => {
  assert.equal(isAdmin(req('/admin')), true);
  assert.equal(isAdmin(req('/admin/bookings')), true);
  assert.equal(isAdmin(req('/api/admin/users')), true);
  assert.equal(isAdmin(req('/mostrador')), false);
  assert.equal(isAdmin(req('/')), false);
  assert.equal(isAdmin(req('/api/v1/reservas/consulta')), false);
});

test('isMostrador: solo rutas de mostrador', () => {
  assert.equal(isMostrador(req('/mostrador')), true);
  assert.equal(isMostrador(req('/mostrador/check-in')), true);
  assert.equal(isMostrador(req('/api/mostrador/bookings')), true);
  assert.equal(isMostrador(req('/admin')), false);
  assert.equal(isMostrador(req('/')), false);
  assert.equal(isMostrador(req('/api/v1/reservas/consulta')), false);
});
