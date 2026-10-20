import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { PUBLIC_LOOKUP_MESSAGES } from '../../src/lib/public-booking';
import { PASAJE_CANCELLED_MESSAGE, executePasajeDownload } from '../../src/lib/pasaje';

// ---------------------------------------------------------------------------
// Fixtures (mismas formas que public-booking-endpoint.test.ts)
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
  return new Request('http://localhost/api/v1/reservas/consulta/pasaje', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Descarga exitosa
// ---------------------------------------------------------------------------

test('descarga exitosa: 200 con PDF y headers de adjunto sin cache', async () => {
  const res = await executePasajeDownload(
    post({ code: 'ag-7f3k9q', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(
    res.headers.get('content-disposition'),
    'attachment; filename="pasaje-AG-7F3K9Q.pdf"',
  );
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4'));
  assert.ok(bytes.subarray(bytes.length - 6).toString('latin1') === '%%EOF\n');
});

test('descarga exitosa: el PDF contiene codigo, vuelo y pasajero', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: '  garcía  ' }),
    makeDb([sampleBooking()]),
  );
  const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
  assert.ok(text.includes('AG-7F3K9Q'));
  assert.ok(text.includes('AG-1420'));
  assert.ok(text.includes('BHI'));
  assert.ok(text.includes('Ana Garc'));
  assert.ok(text.includes('Compra confirmada'));
});

test('descarga exitosa: PENDING tambien genera pasaje (solo CANCELLED no)', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([sampleBooking({ status: 'PENDING' })]),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

// ---------------------------------------------------------------------------
// Reserva cancelada
// ---------------------------------------------------------------------------

test('reserva cancelada: 409 con el mensaje exacto y sin PDF', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([sampleBooking({ status: 'CANCELLED' })]),
  );
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'CONFLICT');
  assert.equal(json.error.message, PASAJE_CANCELLED_MESSAGE);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
});

// ---------------------------------------------------------------------------
// No encontrada / apellido incorrecto (misma respuesta)
// ---------------------------------------------------------------------------

test('codigo inexistente: 404 con el mensaje exacto de la consulta', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-000000', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.notFound);
});

test('apellido incorrecto: misma respuesta que codigo inexistente', async () => {
  const db = makeDb([sampleBooking()]);
  const missing = await executePasajeDownload(post({ code: 'AG-000000', lastName: 'García' }), db);
  const wrongSurname = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'Fernández' }),
    db,
  );
  assert.equal(wrongSurname.status, missing.status);
  const a = await missing.json();
  const b = await wrongSurname.json();
  assert.deepEqual(b, a);
  assert.equal(b.error.message, PUBLIC_LOOKUP_MESSAGES.notFound);
});

test('apellido presente en otra reserva no habilita la descarga', async () => {
  const other = sampleBooking({
    id: 'bk_2',
    bookingCode: 'AG-AAAAAA',
    passengers: [bookingPassenger({ lastName: 'Fernández' })],
  });
  const res = await executePasajeDownload(
    post({ code: 'AG-AAAAAA', lastName: 'García' }),
    makeDb([sampleBooking(), other]),
  );
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Entradas invalidas
// ---------------------------------------------------------------------------

test('campos vacios: 400 con el mensaje exacto de la consulta', async () => {
  const res = await executePasajeDownload(post({ code: '', lastName: '' }), makeDb([sampleBooking()]));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.empty);
});

test('campos ausentes: 400 con el mensaje exacto de la consulta', async () => {
  const res = await executePasajeDownload(post({}), makeDb([sampleBooking()]));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.message, PUBLIC_LOOKUP_MESSAGES.empty);
});

test('codigo malformado: 422 de validacion', async () => {
  const res = await executePasajeDownload(
    post({ code: 'ABC', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 422);
  const json = await res.json();
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

test('apellido invalido (una letra): 422 de validacion', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'G' }),
    makeDb([sampleBooking()]),
  );
  assert.equal(res.status, 422);
});

test('cuerpo no JSON: 400', async () => {
  const res = await executePasajeDownload(post('no-es-json'), makeDb([sampleBooking()]));
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Privacidad
// ---------------------------------------------------------------------------

test('privacidad: el PDF no expone DNI completo, contacto ni notas', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
  assert.ok(text.includes('*****678'), 'el documento enmascarado debe estar');
  assert.equal(text.includes('12345678'), false);
  assert.equal(text.includes('ana@example.com'), false);
  assert.equal(text.includes('2915555555'), false);
  assert.equal(text.includes('reservado por telefono'), false);
  assert.equal(text.includes('ABC12345'), false);
});

test('privacidad: el PDF no expone identificadores internos', async () => {
  const res = await executePasajeDownload(
    post({ code: 'AG-7F3K9Q', lastName: 'García' }),
    makeDb([sampleBooking()]),
  );
  const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
  for (const internal of ['bk_1', 'bf_1', 'bp_1', 'fl_1', 'fare_1', 'seat_1']) {
    assert.equal(text.includes(internal), false, `se filtro ${internal}`);
  }
});
