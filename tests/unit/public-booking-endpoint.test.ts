import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  PUBLIC_LOOKUP_MESSAGES,
  executePublicBookingLookup,
  maskDocument,
} from '../../src/lib/public-booking';

// ---------------------------------------------------------------------------
// Fixtures (formas equivalentes a las que devuelve Prisma para la vista publica)
// ---------------------------------------------------------------------------

function airport(iataCode: string, name: string, city: string) {
  return {
    iataCode,
    name,
    city,
    province: null,
    country: 'Argentina',
    timezone: 'America/Argentina/Buenos_Aires',
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function fare() {
  return {
    id: 'fare_1',
    code: 'ECO-LIGHT',
    name: 'Economy Light',
    cabinClass: 'ECONOMY',
    basePrice: 64200,
    carryOnKg: 8,
    checkedBagKg: 0,
    changeAllowed: false,
    seatSelection: false,
    refundable: false,
    benefits: [],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function bookingFlight() {
  return {
    id: 'bf_1',
    bookingId: 'bk_1',
    flightId: 'fl_1',
    fareId: 'fare_1',
    price: 64200,
    isReturn: false,
    departureAt: new Date('2026-02-01T09:45:00Z'),
    flight: {
      id: 'fl_1',
      code: 'AG-1420',
      routeId: 'rt_1',
      aircraftId: 'ac_1',
      departureAt: new Date('2026-02-01T09:45:00Z'),
      arrivalAt: new Date('2026-02-01T10:55:00Z'),
      status: 'SCHEDULED',
      isDirect: true,
      punctualityPct: 98,
      tags: [],
      notes: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      route: {
        id: 'rt_1',
        code: 'BHI-AEP',
        originAirportId: 'BHI',
        destinationAirportId: 'AEP',
        distanceKm: 560,
        durationMinutes: 70,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        originAirport: airport('BHI', 'Bahía Blanca', 'Bahía Blanca'),
        destinationAirport: airport('AEP', 'Aeroparque', 'Buenos Aires'),
      },
      aircraft: { registration: 'LV-FPS', model: 'Boeing 737-800' },
    },
    fare: fare(),
  };
}

function bookingPassenger(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bp_1',
    bookingId: 'bk_1',
    passengerId: null,
    firstName: 'Ana',
    lastName: 'García',
    documentType: 'DNI',
    documentNumber: '12345678',
    birthDate: null,
    seatId: 'seat_1',
    checkInCode: 'ABC12345',
    checkInStatus: 'NOT_STARTED',
    createdAt: new Date('2026-01-10T12:00:00Z'),
    updatedAt: new Date('2026-01-10T12:00:00Z'),
    seat: {
      id: 'seat_1',
      aircraftId: 'ac_1',
      rowNumber: 12,
      columnLetter: 'A',
      cabinClass: 'ECONOMY',
      type: 'WINDOW',
      isExitRow: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    ...overrides,
  };
}

function sampleBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_1',
    bookingCode: 'AG-7F3K9Q',
    userId: null,
    tripType: 'ONE_WAY',
    status: 'CONFIRMED',
    passengersCount: 1,
    cabinClass: 'ECONOMY',
    totalAmount: 64200,
    currency: 'ARS',
    contactEmail: 'ana@example.com',
    contactPhone: '2915555555',
    notes: 'reservado por telefono',
    createdAt: new Date('2026-01-10T12:00:00Z'),
    updatedAt: new Date('2026-01-10T12:00:00Z'),
    flights: [bookingFlight()],
    passengers: [bookingPassenger()],
    ...overrides,
  };
}

function makeDb(bookings: Array<Record<string, unknown>>): PrismaClient {
  return {
    booking: {
      findUnique: async ({ where }: { where: { bookingCode: string } }) =>
        bookings.find((b) => b.bookingCode === where.bookingCode) ?? null,
    },
  } as unknown as PrismaClient;
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/v1/reservas/consulta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Consulta exitosa
// ---------------------------------------------------------------------------

test('consulta exitosa: 200 con codigo normalizado y reserva encontrada', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'ag-7f3k9q', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.bookingCode, 'AG-7F3K9Q');
  assert.equal(json.data.status, 'CONFIRMED');
  assert.equal(json.data.totalAmount, 64200);
  assert.equal(json.data.flights[0].flightCode, 'AG-1420');
  assert.equal(json.data.flights[0].fare.seatSelection, false);
  assert.equal(json.data.passengers[0].seatNumber, '12A');
});

test('consulta exitosa: apellido con distinta capitalizacion y espacios', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'AG-7F3K9Q', lastName: '  garcía  ' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 200);
});

test('privacidad: no se expone el DNI ni el contacto completos', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  const json = await res.json();
  assert.equal(json.data.passengers[0].documentNumber, '*****678');
  const serialized = JSON.stringify(json);
  assert.equal(serialized.includes('12345678'), false);
  assert.equal(serialized.includes('ana@example.com'), false);
  assert.equal(serialized.includes('2915555555'), false);
  assert.equal(serialized.includes('reservado por telefono'), false);
});

test('multiples pasajeros: matchea por cualquiera y devuelve todos', async () => {
  const booking = sampleBooking({
    passengersCount: 3,
    passengers: [
      bookingPassenger({ id: 'bp_1', firstName: 'Ana', lastName: 'García' }),
      bookingPassenger({
        id: 'bp_2',
        firstName: 'Luis',
        lastName: 'García',
        seat: { ...bookingPassenger().seat, rowNumber: 12, columnLetter: 'B' },
      }),
      bookingPassenger({
        id: 'bp_3',
        firstName: 'Marta',
        lastName: 'Pérez',
        seat: null,
      }),
    ],
  });
  const res = await executePublicBookingLookup(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([booking]),
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.passengers.length, 3);
  assert.equal(json.data.passengers[1].seatNumber, '12B');
  assert.equal(json.data.passengers[2].seatNumber, null);
});

// ---------------------------------------------------------------------------
// Código inexistente / apellido incorrecto (misma respuesta)
// ---------------------------------------------------------------------------

test('codigo inexistente: 404 con el mensaje exacto', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'AG-000000', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.notFound);
});

test('apellido incorrecto: misma respuesta que codigo inexistente', async () => {
  const db = makeDb([sampleBooking()]);
  const missing = await executePublicBookingLookup(
    post({ code: 'AG-000000', lastName: 'García' }),
    db,
  );
  const wrongSurname = await executePublicBookingLookup(
    post({ code: 'AG-7F3K9Q', lastName: 'Fernández' }),
    db,
  );

  assert.equal(wrongSurname.status, missing.status);
  const a = await missing.json();
  const b = await wrongSurname.json();
  assert.deepEqual(b, a);
  assert.equal(b.error.message, PUBLIC_LOOKUP_MESSAGES.notFound);
});

test('apellido presente en otra reserva no habilita la consulta', async () => {
  const other = sampleBooking({
    id: 'bk_2',
    bookingCode: 'AG-AAAAAA',
    passengers: [bookingPassenger({ lastName: 'Fernández' })],
  });
  const res = await executePublicBookingLookup(
    post({ code: 'AG-AAAAAA', lastName: 'García' }),
    makeDb([sampleBooking(), other]),
  );
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Entradas inválidas
// ---------------------------------------------------------------------------

test('campos vacios: 400 con el mensaje exacto', async () => {
  const res = await executePublicBookingLookup(
    post({ code: '', lastName: '' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.empty);
});

test('campos ausentes: 400 con el mensaje exacto', async () => {
  const res = await executePublicBookingLookup(post({}), makeDb([sampleBooking()]));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.empty);
});

test('codigo malformado: 422 de validacion', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'ABC', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 422);
  const json = await res.json();
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

test('apellido invalido (una letra): 422 de validacion', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 'AG-7F3K9Q', lastName: 'G' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 422);
});

test('tipos inesperados: 422 de validacion', async () => {
  const res = await executePublicBookingLookup(
    post({ code: 123456, lastName: ['García'] }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 422);
});

test('cuerpo no JSON: 400', async () => {
  const res = await executePublicBookingLookup(post('no-es-json'), makeDb([sampleBooking()]));
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

test('maskDocument conserva solo los ultimos 3 caracteres', () => {
  assert.equal(maskDocument('12345678'), '*****678');
  assert.equal(maskDocument('123'), '123');
  assert.equal(maskDocument('12'), '12');
});
