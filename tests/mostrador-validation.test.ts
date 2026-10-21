import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterSaleSchema, counterFieldErrors } from '../src/lib/mostrador/validation';

const valid = {
  requestId: 'b497133e-66a0-44ca-a16f-e1720c107b48', flightId: 'flight', fareId: 'fare',
  quotedTotal: '100.00', seatMode: 'AUTO', contactEmail: 'lucia@example.com',
  contactPhone: '2914567890', paymentMethod: 'CASH',
  passengers: [{ firstName: 'Lucía Belén', lastName: 'Gómez', documentNumber: '39112804' }],
};
test('mostrador valida 1 a 9 viajeros y datos de identificación', () => {
  assert.equal(counterSaleSchema.safeParse(valid).success, true);
  for (const n of [0, 10]) assert.equal(counterSaleSchema.safeParse({ ...valid, passengers: Array(n).fill(valid.passengers[0]) }).success, false);
  for (const patch of [{ firstName: 'Lucía2' }, { firstName: '\u0301' }, { documentNumber: '123456' }, { documentNumber: '123456789' }])
    assert.equal(counterSaleSchema.safeParse({ ...valid, passengers: [{ ...valid.passengers[0], ...patch }] }).success, false);
  for (const contactPhone of ['1234567', '1234567890123456', '1234567a'])
    assert.equal(counterSaleSchema.safeParse({ ...valid, contactPhone }).success, false);
  assert.equal(counterSaleSchema.safeParse({ ...valid, paymentMethod: 'WALLET' }).success, false);
});
test('selección manual exige asientos únicos; automática rechaza asientos enviados', () => {
  assert.equal(counterSaleSchema.safeParse({ ...valid, seatMode: 'MANUAL' }).success, false);
  const passenger = { ...valid.passengers[0], seatId: 'seat' };
  assert.equal(counterSaleSchema.safeParse({ ...valid, passengers: [passenger] }).success, false);
  assert.equal(counterSaleSchema.safeParse({ ...valid, seatMode: 'MANUAL', passengers: [passenger, { ...passenger, documentNumber: '30111222' }] }).success, false);
});

test('errores por campo en español, sin repetir mensajes ni mezclar pasajeros', () => {
  const result = counterSaleSchema.safeParse({ ...valid, contactEmail: 'mal', contactPhone: '', passengers: [
    { firstName: '', lastName: '', documentNumber: '' },
    { firstName: 'Nombre2', lastName: 'Gómez', documentNumber: '123' },
  ] });
  assert.equal(result.success, false); if (result.success) return;
  const errors = counterFieldErrors(result.error.issues);
  assert.equal(errors['passengers.0.firstName'], 'Ingresá el nombre.');
  assert.equal(errors['passengers.0.lastName'], 'Ingresá el apellido.');
  assert.equal(errors['passengers.0.documentNumber'], 'Ingresá el DNI.');
  assert.equal(errors['passengers.1.firstName'], 'Ingresá sólo letras y espacios.');
  assert.equal(errors['passengers.1.lastName'], undefined);
  assert.equal(errors.contactEmail, 'Ingresá un email válido.');
  assert.equal(errors.contactPhone, 'Ingresá el teléfono.');
  assert.doesNotMatch(Object.values(errors).join(' '), /String must|Invalid email/);
});

test('DNI y asiento repetidos se señalan en los campos de los pasajeros afectados', () => {
  const result = counterSaleSchema.safeParse({ ...valid, seatMode: 'MANUAL', passengers: [
    { ...valid.passengers[0], seatId: 'seat' }, { ...valid.passengers[0], seatId: 'seat' },
  ] });
  assert.equal(result.success, false); if (result.success) return;
  const errors = counterFieldErrors(result.error.issues);
  for (const i of [0, 1]) {
    assert.equal(errors[`passengers.${i}.documentNumber`], 'Este DNI se repite en otro pasajero.');
    assert.equal(errors[`passengers.${i}.seatId`], 'Este asiento ya está elegido para otro pasajero.');
  }
});
