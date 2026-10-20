import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../src/lib/api';
import { executePassengerIdentUpdate } from '../../src/lib/admin-reservas';

/**
 * US-14C: edicion de datos de identificacion de un pasajero desde la consola
 * admin/mostrador. Logica pura con la conexion inyectada (mismo patron que
 * executePasajeDownload en tests/unit/pasaje-endpoint.test.ts).
 */

type Row = Record<string, unknown>;

function bookingRecord(overrides: Row = {}): Row {
  return { id: 'bk_1', bookingCode: 'AG-7F3K9Q', ...overrides };
}

function passengerRecord(overrides: Row = {}): Row {
  return {
    id: 'bp_1',
    bookingId: 'bk_1',
    passengerId: null,
    firstName: 'Ana',
    lastName: 'Rodríguez',
    documentType: 'DNI',
    documentNumber: '38452190',
    birthDate: new Date('1998-04-12T00:00:00.000Z'),
    seatId: null,
    checkInCode: null,
    checkInStatus: 'NOT_STARTED',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

type FakeDb = PrismaClient & { calls: { findUnique: Row[]; findFirst: Row[]; update: Row[] } };

function fakeDb(options: {
  booking?: Row | null;
  passenger?: Row | null;
}): FakeDb {
  const calls = { findUnique: [] as Row[], findFirst: [] as Row[], update: [] as Row[] };

  const db = {
    booking: {
      findUnique: async (args: Row) => {
        calls.findUnique.push(args);
        return options.booking ?? null;
      },
    },
    bookingPassenger: {
      findFirst: async (args: Row) => {
        calls.findFirst.push(args);
        return options.passenger ?? null;
      },
      update: async (args: Row) => {
        calls.update.push(args);
        const current = options.passenger ?? {};
        const data = (args.data ?? {}) as Row;
        return { ...current, ...data };
      },
    },
    calls,
  };

  return db as unknown as FakeDb;
}

function expectApiError(status: number) {
  return (err: unknown) => {
    assert.ok(err instanceof ApiError, 'lanza ApiError');
    assert.equal(err.status, status);
    return true;
  };
}

test('actualiza la identificacion completa y devuelve antes/después', async () => {
  const db = fakeDb({ booking: bookingRecord(), passenger: passengerRecord() });

  const result = await executePassengerIdentUpdate(db, {
    bookingCode: ' ag-7f3k9q ',
    bookingPassengerId: 'bp_1',
    data: {
      firstName: 'Ana María',
      lastName: 'Rodriguez Perez',
      documentType: 'PASAPORTE',
      documentNumber: 'AB123456',
      birthDate: new Date('1997-09-30T00:00:00.000Z'),
    },
  });

  assert.equal(result.bookingId, 'bk_1');
  assert.equal(result.bookingCode, 'AG-7F3K9Q');
  assert.equal(result.passengerId, 'bp_1');

  assert.equal(result.before.firstName, 'Ana');
  assert.equal(result.before.documentType, 'DNI');
  assert.equal(result.before.birthDate, '1998-04-12T00:00:00.000Z');

  assert.equal(result.after.firstName, 'Ana María');
  assert.equal(result.after.lastName, 'Rodriguez Perez');
  assert.equal(result.after.documentType, 'PASAPORTE');
  assert.equal(result.after.documentNumber, 'AB123456');
  assert.equal(result.after.birthDate, '1997-09-30T00:00:00.000Z');
  assert.equal(result.after.id, 'bp_1');

  // La reserva se busca por codigo normalizado (trim + mayusculas).
  const lookup = db.calls.findUnique[0] as { where: { bookingCode: string } };
  assert.equal(lookup.where.bookingCode, 'AG-7F3K9Q');
});

test('una actualizacion parcial solo toca los campos enviados', async () => {
  const db = fakeDb({ booking: bookingRecord(), passenger: passengerRecord() });

  const result = await executePassengerIdentUpdate(db, {
    bookingCode: 'AG-7F3K9Q',
    bookingPassengerId: 'bp_1',
    data: { documentNumber: '44556677' },
  });

  assert.equal(result.after.documentNumber, '44556677');
  assert.equal(result.after.firstName, 'Ana');

  const update = db.calls.update[0] as { data: Row };
  assert.deepEqual(Object.keys(update.data), ['documentNumber']);
});

test('birthDate null borra la fecha de nacimiento', async () => {
  const db = fakeDb({ booking: bookingRecord(), passenger: passengerRecord() });

  const result = await executePassengerIdentUpdate(db, {
    bookingCode: 'AG-7F3K9Q',
    bookingPassengerId: 'bp_1',
    data: { birthDate: null },
  });

  assert.equal(result.after.birthDate, null);
  const update = db.calls.update[0] as { data: Row };
  assert.equal(update.data.birthDate, null);
});

test('reserva inexistente: 404 sin tocar la base', async () => {
  const db = fakeDb({ booking: null, passenger: null });

  await assert.rejects(
    () =>
      executePassengerIdentUpdate(db, {
        bookingCode: 'AG-000000',
        bookingPassengerId: 'bp_1',
        data: { firstName: 'Otra' },
      }),
    expectApiError(404),
  );
  assert.equal(db.calls.update.length, 0);
});

test('pasajero que no pertenece a la reserva: 404', async () => {
  const db = fakeDb({ booking: bookingRecord(), passenger: null });

  await assert.rejects(
    () =>
      executePassengerIdentUpdate(db, {
        bookingCode: 'AG-7F3K9Q',
        bookingPassengerId: 'bp_de_otra_reserva',
        data: { firstName: 'Otra' },
      }),
    expectApiError(404),
  );
  assert.equal(db.calls.update.length, 0);
});

test('sin campos enviados: 400 y no ejecuta el update', async () => {
  const db = fakeDb({ booking: bookingRecord(), passenger: passengerRecord() });

  await assert.rejects(
    () =>
      executePassengerIdentUpdate(db, {
        bookingCode: 'AG-7F3K9Q',
        bookingPassengerId: 'bp_1',
        data: {},
      }),
    expectApiError(400),
  );
  assert.equal(db.calls.update.length, 0);
});
