import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPassengerErrors,
  normalizePassenger,
  validatePassenger,
  validatePassengers,
} from '../src/lib/passenger-form';

test('valida los campos obligatorios de cada pasajero', () => {
  const errors = validatePassenger({ firstName: '', lastName: '', documentNumber: '' });

  assert.equal(errors.firstName, 'Ingresá el nombre.');
  assert.equal(errors.lastName, 'Ingresá el apellido.');
  assert.equal(errors.documentNumber, 'Ingresá el DNI.');
});

test('rechaza nombres con números o símbolos inválidos', () => {
  const errors = validatePassenger({
    firstName: 'Ana123',
    lastName: 'Gómez',
    documentNumber: '39112804',
  });

  assert.equal(errors.firstName, 'Ingresá sólo letras y espacios.');
  assert.equal(errors.lastName, undefined);
  assert.equal(errors.documentNumber, undefined);
});

test('acepta nombres y apellidos con tildes, espacios, apóstrofes y guiones', () => {
  const errors = validatePassenger({
    firstName: 'María José',
    lastName: "O'Connor Pérez-Gómez",
    documentNumber: '39112804',
  });

  assert.deepEqual(errors, {});
});

test('rechaza un DNI fuera del rango esperado', () => {
  assert.equal(
    validatePassenger({ firstName: 'Ana', lastName: 'Gómez', documentNumber: '123' })
      .documentNumber,
    'Ingresá un DNI de 6 a 9 dígitos.',
  );
  assert.equal(
    validatePassenger({ firstName: 'Ana', lastName: 'Gómez', documentNumber: '1234567890' })
      .documentNumber,
    'Ingresá un DNI de 6 a 9 dígitos.',
  );
});

test('detecta el mismo DNI repetido entre pasajeros', () => {
  const errors = validatePassengers([
    { firstName: 'Ana', lastName: 'Gómez', documentNumber: '39112804' },
    { firstName: 'Luis', lastName: 'Pérez', documentNumber: '39112804' },
  ]);

  assert.equal(errors[0]?.documentNumber, 'Este DNI se repite en otro pasajero.');
  assert.equal(errors[1]?.documentNumber, 'Este DNI se repite en otro pasajero.');
  assert.equal(hasPassengerErrors(errors), true);
});

test('normaliza espacios y deja el DNI sólo con dígitos', () => {
  assert.deepEqual(
    normalizePassenger({
      firstName: '  María   José ',
      lastName: ' Pérez-Gómez ',
      documentNumber: '39.112.804',
    }),
    {
      firstName: 'María José',
      lastName: 'Pérez-Gómez',
      documentNumber: '39112804',
    },
  );
});
