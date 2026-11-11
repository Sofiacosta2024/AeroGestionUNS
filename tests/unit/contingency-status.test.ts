import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINGENCY_BOOKING_STATUSES,
  CONTINGENCY_REPROGRAMMING_MESSAGE,
  isContingencyBookingStatus,
} from '../../src/lib/contingency-status';

// ---------------------------------------------------------------------------
// US-14B v2.0: bloqueo de la reprogramación autónoma durante una contingencia
// ---------------------------------------------------------------------------

test('contingencia: incluye los tres estados de gestión por contingencia', () => {
  assert.deepEqual(
    [...CONTINGENCY_BOOKING_STATUSES].sort(),
    ['REASIGNACION_PROPUESTA', 'REPROGRAMACION_PENDIENTE', 'SIN_ALTERNATIVA'],
  );
  for (const status of CONTINGENCY_BOOKING_STATUSES) {
    assert.equal(isContingencyBookingStatus(status), true);
  }
});

test('contingencia: reconoce el estado sin importar mayusculas ni espacios', () => {
  assert.equal(isContingencyBookingStatus(' reasignacion_propuesta '), true);
  assert.equal(isContingencyBookingStatus('Sin_Alternativa'), true);
  assert.equal(isContingencyBookingStatus('reprogramacion_pendiente'), true);
});

test('contingencia: no bloquea reservas reprogramables ni estados ajenos', () => {
  for (const status of ['CONFIRMED', 'PAID', 'REPROGRAMADA', 'CANCELLED', 'PENDING', 'REASIGNADO']) {
    assert.equal(isContingencyBookingStatus(status), false, status);
  }
  assert.equal(isContingencyBookingStatus(null), false);
  assert.equal(isContingencyBookingStatus(undefined), false);
  assert.equal(isContingencyBookingStatus(''), false);
  assert.equal(isContingencyBookingStatus('   '), false);
});

test('contingencia: el mensaje es el literal pedido por la historia', () => {
  assert.equal(
    CONTINGENCY_REPROGRAMMING_MESSAGE,
    'Tu reserva está siendo gestionada por la aerolínea por la cancelación de tu vuelo. Comunicate con Atención prioritaria al 0800-555-0199.',
  );
});
