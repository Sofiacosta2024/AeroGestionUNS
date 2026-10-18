import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingPublicLookupSchema,
  normalizeBookingCode,
  normalizeLastName,
} from '../../src/lib/validation';

function parse(input: unknown) {
  return bookingPublicLookupSchema.safeParse(input);
}

function expectValid(input: unknown) {
  const result = parse(input);
  assert.equal(
    result.success,
    true,
    `se esperaba valido pero fallo: ${JSON.stringify(input)} -> ${
      result.success ? '' : JSON.stringify(result.error.issues)
    }`,
  );
  return result.success ? result.data : never();
}

function expectInvalid(input: unknown) {
  const result = parse(input);
  assert.equal(
    result.success,
    false,
    `se esperaba invalido pero fue valido: ${JSON.stringify(input)}`,
  );
  return result.success ? never() : result.error;
}

function never(): never {
  throw new Error('estado inalcanzable');
}

// ---------------------------------------------------------------------------
// Normalizacion
// ---------------------------------------------------------------------------

test('normalizeBookingCode: pasa a mayusculas y antepone AG-', () => {
  assert.equal(normalizeBookingCode('ag-7f3k9q'), 'AG-7F3K9Q');
});

test('normalizeBookingCode: recorta espacios exteriores', () => {
  assert.equal(normalizeBookingCode('  ag-7f3k9q  '), 'AG-7F3K9Q');
});

test('normalizeBookingCode: acepta codigo sin prefijo', () => {
  assert.equal(normalizeBookingCode('7f3k9q'), 'AG-7F3K9Q');
});

test('normalizeLastName: recorta espacios exteriores', () => {
  assert.equal(normalizeLastName('  Garcia  '), 'Garcia');
});

test('normalizeLastName: compone diacriticos NFD a NFC (apellido pegado desde macOS)', () => {
  const nfd = 'García'.normalize('NFD');
  assert.notEqual(nfd, 'García', 'el fixture debe estar en descomposicion');
  assert.equal(normalizeLastName(nfd), 'García');
});

test('valido: apellido en descomposicion NFD se compone y valida', () => {
  const data = expectValid({ code: 'ag-7f3k9q', lastName: 'García'.normalize('NFD') });
  assert.equal(data.lastName, 'García');
});

// ---------------------------------------------------------------------------
// Casos validos
// ---------------------------------------------------------------------------

test('valido: codigo en minusculas + apellido simple', () => {
  const data = expectValid({ code: 'ag-7f3k9q', lastName: 'Garcia' });
  assert.equal(data.code, 'AG-7F3K9Q');
  assert.equal(data.lastName, 'Garcia');
});

test('valido: codigo en mayusculas y apellido con tilde', () => {
  const data = expectValid({ code: 'AG-7F3K9Q', lastName: 'García' });
  assert.equal(data.code, 'AG-7F3K9Q');
  assert.equal(data.lastName, 'García');
});

test('valido: apellido con enie', () => {
  const data = expectValid({ code: 'ag-7f3k9q', lastName: 'Muñoz' });
  assert.equal(data.lastName, 'Muñoz');
});

test('valido: apellido compuesto con espacio', () => {
  const data = expectValid({ code: 'ag-7f3k9q', lastName: 'de la Cruz' });
  assert.equal(data.lastName, 'de la Cruz');
});

test('valido: apellido compuesto con guion', () => {
  const data = expectValid({ code: 'ag-7f3k9q', lastName: 'García-López' });
  assert.equal(data.lastName, 'García-López');
});

test('valido: apellido y codigo con espacios exteriores se recortan', () => {
  const data = expectValid({ code: '  ag-7f3k9q  ', lastName: '  Pérez  ' });
  assert.equal(data.code, 'AG-7F3K9Q');
  assert.equal(data.lastName, 'Pérez');
});

test('valido: codigo sin prefijo', () => {
  const data = expectValid({ code: '7f3k9q', lastName: 'Aguirre' });
  assert.equal(data.code, 'AG-7F3K9Q');
});

// ---------------------------------------------------------------------------
// Casos invalidos
// ---------------------------------------------------------------------------

test('invalido: sin codigo', () => {
  expectInvalid({ lastName: 'Garcia' });
});

test('invalido: codigo vacio o solo espacios', () => {
  expectInvalid({ code: '   ', lastName: 'Garcia' });
});

test('invalido: codigo demasiado corto', () => {
  expectInvalid({ code: 'ag-7f3k9', lastName: 'Garcia' });
});

test('invalido: codigo demasiado largo', () => {
  expectInvalid({ code: 'ag-7f3k9qq', lastName: 'Garcia' });
});

test('invalido: codigo con caracteres no alfanumericos', () => {
  expectInvalid({ code: 'AG-7F3K@Q', lastName: 'Garcia' });
});

test('invalido: codigo con guion extra', () => {
  expectInvalid({ code: 'AG-7F-3K', lastName: 'Garcia' });
});

test('invalido: sin apellido', () => {
  expectInvalid({ code: 'ag-7f3k9q' });
});

test('invalido: apellido de una sola letra', () => {
  expectInvalid({ code: 'ag-7f3k9q', lastName: 'A' });
});

test('invalido: apellido con numeros', () => {
  expectInvalid({ code: 'ag-7f3k9q', lastName: 'G4rc1a' });
});

test('invalido: apellido con simbolos', () => {
  expectInvalid({ code: 'ag-7f3k9q', lastName: 'Garcia@' });
});

test('invalido: apellido con guion al inicio', () => {
  expectInvalid({ code: 'ag-7f3k9q', lastName: '-Garcia' });
});

test('invalido: tipos inesperados (numeros)', () => {
  expectInvalid({ code: 123456, lastName: 789 });
});

test('invalido: tipos inesperados (objeto en apellido)', () => {
  expectInvalid({ code: 'ag-7f3k9q', lastName: { first: 'Garcia' } });
});

test('invalido: entrada nula', () => {
  expectInvalid(null);
});
