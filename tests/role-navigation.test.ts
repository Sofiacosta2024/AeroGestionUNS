import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleHome } from '../src/lib/role-navigation';

test('cada rol llega a su pantalla al completar el login', () => {
  assert.equal(roleHome('MOSTRADOR'), '/mostrador');
  assert.equal(roleHome('ADMIN'), '/admin');
  assert.equal(roleHome('PASAJERO'), '/vuelos');
  assert.equal(roleHome('unknown'), '/vuelos');
});
