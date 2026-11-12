import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPassengerErrors,
  normalizePassenger,
  sanitizeDocumentInput,
  validatePassenger,
  validatePassengers,
  type PassengerFormData,
} from '../src/lib/passenger-form';

// Cambio US-16: el pasajero suma tipo de documento (DNI o Pasaporte) y fecha de nacimiento.
const TODAY = '2026-11-12';
const ana = (overrides: Partial<PassengerFormData> = {}): PassengerFormData => ({
  firstName: 'Ana',
  lastName: 'Gómez',
  documentType: 'DNI',
  documentNumber: '39112804',
  birthDate: '1995-11-22',
  ...overrides,
});

test('valida los campos obligatorios de cada pasajero', () => {
  const errors = validatePassenger(
    ana({ firstName: '', lastName: '', documentNumber: '', birthDate: '' }),
    TODAY,
  );

  assert.equal(errors.firstName, 'Ingresá el nombre.');
  assert.equal(errors.lastName, 'Ingresá el apellido.');
  assert.equal(errors.documentNumber, 'Ingresá el DNI.');
  assert.equal(errors.birthDate, 'Ingresá la fecha de nacimiento.');
});

test('rechaza nombres con números o símbolos inválidos', () => {
  const errors = validatePassenger(ana({ firstName: 'Ana123' }), TODAY);

  assert.equal(errors.firstName, 'Ingresá sólo letras y espacios.');
  assert.equal(errors.lastName, undefined);
  assert.equal(errors.documentNumber, undefined);
});

test('acepta nombres y apellidos con tildes, espacios, apóstrofes y guiones', () => {
  const errors = validatePassenger(ana({ firstName: 'María José', lastName: "O'Connor Pérez-Gómez" }), TODAY);

  assert.deepEqual(errors, {});
});

test('rechaza un DNI fuera del rango esperado', () => {
  assert.equal(validatePassenger(ana({ documentNumber: '123' }), TODAY).documentNumber, 'Ingresá un DNI de 6 a 9 dígitos.');
  assert.equal(
    validatePassenger(ana({ documentNumber: '1234567890' }), TODAY).documentNumber,
    'Ingresá un DNI de 6 a 9 dígitos.',
  );
});

test('US-16: acepta pasaportes alfanuméricos y rechaza los inválidos', () => {
  assert.deepEqual(validatePassenger(ana({ documentType: 'PASAPORTE', documentNumber: 'AAE123456' }), TODAY), {});
  assert.deepEqual(validatePassenger(ana({ documentType: 'PASAPORTE', documentNumber: 'aae-123 456' }), TODAY), {});
  assert.equal(
    validatePassenger(ana({ documentType: 'PASAPORTE', documentNumber: '' }), TODAY).documentNumber,
    'Ingresá el número de pasaporte.',
  );
  assert.equal(
    validatePassenger(ana({ documentType: 'PASAPORTE', documentNumber: 'AB12' }), TODAY).documentNumber,
    'Ingresá un pasaporte de 6 a 15 letras o números.',
  );
});

test('US-16: la fecha de nacimiento es obligatoria, real y no futura', () => {
  assert.equal(validatePassenger(ana({ birthDate: TODAY }), TODAY).birthDate, undefined);
  assert.equal(
    validatePassenger(ana({ birthDate: '2026-11-13' }), TODAY).birthDate,
    'La fecha de nacimiento no puede ser futura.',
  );
  assert.equal(
    validatePassenger(ana({ birthDate: '2001-02-30' }), TODAY).birthDate,
    'Ingresá una fecha de nacimiento válida.',
  );
  assert.equal(
    validatePassenger(ana({ birthDate: '1899-12-31' }), TODAY).birthDate,
    'Ingresá una fecha de nacimiento válida.',
  );
});

test('detecta el mismo DNI repetido entre pasajeros', () => {
  const errors = validatePassengers([ana(), ana({ firstName: 'Luis', lastName: 'Pérez' })], TODAY);

  assert.equal(errors[0]?.documentNumber, 'Este DNI se repite en otro pasajero.');
  assert.equal(errors[1]?.documentNumber, 'Este DNI se repite en otro pasajero.');
  assert.equal(hasPassengerErrors(errors), true);
});

test('US-16: el mismo número con otro tipo de documento no es un repetido', () => {
  const errors = validatePassengers(
    [ana({ documentNumber: '39112804' }), ana({ firstName: 'Luis', documentType: 'PASAPORTE', documentNumber: '39112804' })],
    TODAY,
  );

  assert.equal(hasPassengerErrors(errors), false);
});

test('normaliza espacios y deja el DNI sólo con dígitos', () => {
  assert.deepEqual(
    normalizePassenger(ana({ firstName: '  María   José ', lastName: ' Pérez-Gómez ', documentNumber: '39.112.804' })),
    ana({ firstName: 'María José', lastName: 'Pérez-Gómez', documentNumber: '39112804' }),
  );
});

test('US-16: normaliza el pasaporte en mayúsculas y sin separadores', () => {
  assert.equal(
    normalizePassenger(ana({ documentType: 'PASAPORTE', documentNumber: 'aae-123 456' })).documentNumber,
    'AAE123456',
  );
  assert.equal(sanitizeDocumentInput('DNI', '39.112.804x'), '39112804');
  assert.equal(sanitizeDocumentInput('PASAPORTE', 'aae-12'), 'AAE12');
});
