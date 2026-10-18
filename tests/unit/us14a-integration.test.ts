import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import {
  PUBLIC_LOOKUP_MESSAGES,
  executePublicBookingLookup,
} from '../../src/lib/public-booking';
import { PASAJE_CANCELLED_MESSAGE, executePasajeDownload } from '../../src/lib/pasaje';
import {
  FACTURA_PENDING_MESSAGE,
  FACTURA_UNAVAILABLE_MESSAGE,
  executeFacturaDownload,
} from '../../src/lib/factura';
import ConsultaClient from '../../src/app/reserva/consulta-client';

/**
 * Integracion y seguridad de US-14A: los tres endpoints publicos (consulta,
 * pasaje, factura) con las mismas credenciales, mensajes byte a byte
 * identicos, aislamiento entre reservas, entradas manipuladas/inyeccion y
 * fallos de servidor sin filtrar internals.
 */

// ---------------------------------------------------------------------------
// Fixtures (mismas formas que los tests de endpoint individuales)
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

function fare(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function bookingFlight(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_1',
    bookingId: 'bk_1',
    method: 'CREDIT_CARD',
    amount: 64200,
    currency: 'ARS',
    status: 'APPROVED',
    transactionRef: 'txn_9a2f7c1d',
    installments: 3,
    paidAt: new Date('2026-01-12T15:00:00Z'),
    createdAt: new Date('2026-01-12T14:55:00Z'),
    updatedAt: new Date('2026-01-12T15:00:00Z'),
    ...overrides,
  };
}

type DbOptions = {
  /** Si es true, findUnique lanza (simula caida de la base). */
  failBookingLookup?: boolean;
  /** Si es true, payment.findMany lanza (simula caida solo de pagos). */
  failPayments?: boolean;
};

function makeDb(
  bookings: Array<Record<string, unknown>>,
  payments: Array<Record<string, unknown>> = [],
  options: DbOptions = {},
): { db: PrismaClient; bookingLookups: string[] } {
  const bookingLookups: string[] = [];
  const db = {
    booking: {
      findUnique: async ({ where }: { where: { bookingCode: string } }) => {
        if (options.failBookingLookup) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        }
        bookingLookups.push(where.bookingCode);
        return bookings.find((b) => b.bookingCode === where.bookingCode) ?? null;
      },
    },
    payment: {
      findMany: async ({ where }: { where: { bookingId: string } }) => {
        if (options.failPayments) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        }
        return payments.filter((p) => p.bookingId === where.bookingId);
      },
    },
  } as unknown as PrismaClient;
  return { db, bookingLookups };
}

const ENDPOINTS = {
  consulta: {
    path: '/api/v1/reservas/consulta',
    run: executePublicBookingLookup,
  },
  pasaje: {
    path: '/api/v1/reservas/consulta/pasaje',
    run: executePasajeDownload,
  },
  factura: {
    path: '/api/v1/reservas/consulta/factura',
    run: executeFacturaDownload,
  },
} as const;

type EndpointName = keyof typeof ENDPOINTS;

function post(endpoint: EndpointName, body: unknown): Request {
  return new Request(`http://localhost${ENDPOINTS[endpoint].path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function callAll(
  body: unknown,
  make: () => { db: PrismaClient; bookingLookups: string[] },
): Promise<Record<EndpointName, Response>> {
  const responses = {} as Record<EndpointName, Response>;
  for (const name of Object.keys(ENDPOINTS) as EndpointName[]) {
    responses[name] = await ENDPOINTS[name].run(post(name, body), make().db);
  }
  return responses;
}

function pdfText(res: Response): Promise<string> {
  return res.arrayBuffer().then((buf) => Buffer.from(buf).toString('latin1'));
}

// ---------------------------------------------------------------------------
// 1) Flujo conjunto: mismas credenciales autorizan consulta + pasaje + factura
// ---------------------------------------------------------------------------

test('integracion: las mismas credenciales autorizan consulta JSON, pasaje y factura', async () => {
  const body = { code: 'ag-7f3k9q', lastName: 'García' };
  const make = () => makeDb([sampleBooking()], [payment()]);

  const consulta = await executePublicBookingLookup(post('consulta', body), make().db);
  assert.equal(consulta.status, 200);
  const json = await consulta.json();
  assert.equal(json.ok, true);
  assert.equal(json.data.bookingCode, 'AG-7F3K9Q');

  const pasaje = await executePasajeDownload(post('pasaje', body), make().db);
  assert.equal(pasaje.status, 200);
  assert.equal(pasaje.headers.get('content-type'), 'application/pdf');

  const factura = await executeFacturaDownload(post('factura', body), make().db);
  assert.equal(factura.status, 200);
  assert.equal(factura.headers.get('content-type'), 'application/pdf');
});

test('integracion: los tres documentos/respuestas usan el mismo codigo canonicizado', async () => {
  const body = { code: '7f3k9q', lastName: 'garcía' };
  const make = () => makeDb([sampleBooking()], [payment()]);

  const pasaje = await executePasajeDownload(post('pasaje', body), make().db);
  assert.equal(
    pasaje.headers.get('content-disposition'),
    'attachment; filename="pasaje-AG-7F3K9Q.pdf"',
  );
  const factura = await executeFacturaDownload(post('factura', body), make().db);
  assert.equal(
    factura.headers.get('content-disposition'),
    'attachment; filename="factura-AG-7F3K9Q.pdf"',
  );
  const consulta = await executePublicBookingLookup(post('consulta', body), make().db);
  const json = await consulta.json();
  assert.equal(json.data.bookingCode, 'AG-7F3K9Q');
});

// ---------------------------------------------------------------------------
// 2) Variants de casing/prefijo en los tres endpoints
// ---------------------------------------------------------------------------

test('variantes de codigo: minusculas, mayusculas, sin prefijo y con espacios en los 3 endpoints', async () => {
  const variants = ['ag-7f3k9q', 'AG-7F3K9Q', 'Ag-7f3K9Q', '7f3k9q', '  ag-7f3k9q  '];
  for (const code of variants) {
    const responses = await callAll({ code, lastName: 'García' }, () =>
      makeDb([sampleBooking()], [payment()]),
    );
    assert.equal(responses.consulta.status, 200, `consulta con code=${code}`);
    assert.equal(responses.pasaje.status, 200, `pasaje con code=${code}`);
    assert.equal(responses.factura.status, 200, `factura con code=${code}`);
  }
});

test('apellido en minusculas con espacios funciona en los 3 endpoints', async () => {
  const responses = await callAll({ code: 'AG-7F3K9Q', lastName: '  garcía  ' }, () =>
    makeDb([sampleBooking()], [payment()]),
  );
  assert.equal(responses.consulta.status, 200);
  assert.equal(responses.pasaje.status, 200);
  assert.equal(responses.factura.status, 200);
});

test('apellido en descomposicion NFD (macOS) funciona en los 3 endpoints', async () => {
  const responses = await callAll(
    { code: 'AG-7F3K9Q', lastName: 'García'.normalize('NFD') },
    () => makeDb([sampleBooking()], [payment()]),
  );
  assert.equal(responses.consulta.status, 200, 'consulta debe aceptar NFD');
  assert.equal(responses.pasaje.status, 200, 'pasaje debe aceptar NFD');
  assert.equal(responses.factura.status, 200, 'factura debe aceptar NFD');
});

// ---------------------------------------------------------------------------
// 3) Mensajes de error identicos byte a byte entre los tres endpoints
// ---------------------------------------------------------------------------

test('errores: campos vacios devuelven el mismo cuerpo byte a byte en los 3 endpoints', async () => {
  const responses = await callAll({ code: '', lastName: '' }, () =>
    makeDb([sampleBooking()], [payment()]),
  );
  const bodies = await Promise.all(
    (Object.keys(responses) as EndpointName[]).map(async (name) => ({
      name,
      status: responses[name].status,
      text: await responses[name].text(),
    })),
  );
  for (const { name, status, text } of bodies) {
    assert.equal(status, 400, name);
    assert.equal(text, bodies[0]?.text, `${name} debe responder identico a consulta`);
  }
  assert.ok(bodies[0]?.text.includes(PUBLIC_LOOKUP_MESSAGES.empty));
});

test('errores: codigo inexistente devuelve el mismo cuerpo byte a byte en los 3 endpoints', async () => {
  const responses = await callAll({ code: 'AG-000000', lastName: 'García' }, () =>
    makeDb([sampleBooking()], [payment()]),
  );
  const bodies = await Promise.all(
    (Object.keys(responses) as EndpointName[]).map(async (name) => ({
      name,
      status: responses[name].status,
      text: await responses[name].text(),
    })),
  );
  for (const { name, status, text } of bodies) {
    assert.equal(status, 404, name);
    assert.equal(text, bodies[0]?.text, `${name} debe responder identico a consulta`);
  }
  assert.ok(bodies[0]?.text.includes(PUBLIC_LOOKUP_MESSAGES.notFound));
});

test('errores: apellido incorrecto idéntico a codigo inexistente en los 3 endpoints', async () => {
  const wrong = { code: 'AG-7F3K9Q', lastName: 'Fernández' };
  const missing = { code: 'AG-000000', lastName: 'García' };
  for (const name of Object.keys(ENDPOINTS) as EndpointName[]) {
    const a = await ENDPOINTS[name].run(post(name, missing), makeDb([sampleBooking()], [payment()]).db);
    const b = await ENDPOINTS[name].run(post(name, wrong), makeDb([sampleBooking()], [payment()]).db);
    assert.equal(b.status, a.status, name);
    assert.equal(await b.text(), await a.text(), name);
  }
});

test('errores: cuerpo no-JSON idéntico en los 3 endpoints', async () => {
  for (const name of Object.keys(ENDPOINTS) as EndpointName[]) {
    const res = await ENDPOINTS[name].run(post(name, 'no-es-json'), makeDb([]).db);
    assert.equal(res.status, 400, name);
    const json = await res.json();
    assert.equal(json.error.message, 'El cuerpo de la peticion debe ser JSON valido', name);
  }
});

// ---------------------------------------------------------------------------
// 4) Multi-pasajeros, apellidos repetidos y aislamiento entre reservas
// ---------------------------------------------------------------------------

test('multi-pasajeros: cualquier apellido habilita y los documentos listan a todos', async () => {
  const booking = sampleBooking({
    passengersCount: 3,
    passengers: [
      bookingPassenger({ id: 'bp_1', firstName: 'Ana', lastName: 'García' }),
      bookingPassenger({
        id: 'bp_2',
        firstName: 'Luis',
        lastName: 'García',
        documentNumber: '87654321',
        seatId: 'seat_2',
        seat: { id: 'seat_2', aircraftId: 'ac_1', rowNumber: 12, columnLetter: 'B', cabinClass: 'ECONOMY', type: 'AISLE', isExitRow: false, createdAt: new Date('2026-01-01T00:00:00Z') },
      }),
      bookingPassenger({
        id: 'bp_3',
        firstName: 'Sofía',
        lastName: 'Ríos',
        documentNumber: '11223344',
        seatId: 'seat_3',
        seat: { id: 'seat_3', aircraftId: 'ac_1', rowNumber: 13, columnLetter: 'C', cabinClass: 'ECONOMY', type: 'WINDOW', isExitRow: false, createdAt: new Date('2026-01-01T00:00:00Z') },
      }),
    ],
  });
  const make = () => makeDb([booking], [payment()]);

  // Cada uno de los tres apellidos autoriza la consulta.
  for (const lastName of ['García', 'Ríos']) {
    const consulta = await executePublicBookingLookup(
      post('consulta', { code: 'AG-7F3K9Q', lastName }),
      make().db,
    );
    assert.equal(consulta.status, 200, `apellido ${lastName}`);
    const json = await consulta.json();
    assert.equal(json.data.passengers.length, 3);
  }

  // Los PDF listan a los tres pasajeros.
  const pasaje = await executePasajeDownload(
    post('pasaje', { code: 'AG-7F3K9Q', lastName: 'Ríos' }),
    make().db,
  );
  const text = await pdfText(pasaje);
  assert.ok(text.includes('Ana Garc'));
  assert.ok(text.includes('Luis Garc'));
  assert.ok(text.includes('Sof'));
});

test('aislamiento: reserva homonima no mezcla datos entre codigos distintos', async () => {
  const reservaA = sampleBooking();
  const reservaB = sampleBooking({
    id: 'bk_2',
    bookingCode: 'AG-B22M8X',
    contactEmail: 'otra@example.com',
    contactPhone: '2914444444',
    notes: 'nota de la reserva B',
    passengers: [
      bookingPassenger({ id: 'bp_9', firstName: 'Bruno', lastName: 'García', documentNumber: '55667788' }),
    ],
    flights: [
      bookingFlight({
        id: 'bf_9',
        flightId: 'fl_9',
        flight: {
          ...bookingFlight().flight,
          id: 'fl_9',
          code: 'AG-9910',
          route: {
            ...bookingFlight().flight.route,
            id: 'rt_9',
            code: 'ROS-AEP',
            originAirportId: 'ROS',
            destinationAirportId: 'AEP',
            originAirport: airport('ROS', 'Rosario', 'Rosario'),
            destinationAirport: airport('AEP', 'Aeroparque', 'Buenos Aires'),
          },
        },
      }),
    ],
  });
  const make = () => makeDb([reservaA, reservaB], [payment()]);

  // Con el codigo de A, el apellido compartido devuelve solo los datos de A.
  const consultaA = await executePublicBookingLookup(
    post('consulta', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  const jsonA = await consultaA.json();
  assert.equal(jsonA.data.bookingCode, 'AG-7F3K9Q');
  assert.equal(jsonA.data.passengers.length, 1);
  assert.equal(jsonA.data.passengers[0].firstName, 'Ana');

  // El pasaje de A nunca contiene datos de B.
  const pasajeA = await executePasajeDownload(
    post('pasaje', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  const textA = await pdfText(pasajeA);
  assert.ok(textA.includes('AG-7F3K9Q'));
  assert.ok(textA.includes('AG-1420'));
  assert.equal(textA.includes('AG-9910'), false, 'el vuelo de B no debe aparecer en el pasaje de A');
  assert.equal(textA.includes('AG-B22M8X'), false, 'el codigo de B no debe aparecer en el pasaje de A');
  assert.equal(textA.includes('Bruno'), false, 'el pasajero de B no debe aparecer en el pasaje de A');
  assert.equal(textA.includes('55667788'), false);

  // La factura de A (con pago) no contiene datos de B.
  const facturaA = await executeFacturaDownload(
    post('factura', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  const facturaTextA = await pdfText(facturaA);
  assert.equal(facturaTextA.includes('AG-B22M8X'), false);
  assert.equal(facturaTextA.includes('Bruno'), false);

  // B sigue accesible con su propio codigo.
  const consultaB = await executePublicBookingLookup(
    post('consulta', { code: 'AG-B22M8X', lastName: 'García' }),
    make().db,
  );
  const jsonB = await consultaB.json();
  assert.equal(jsonB.data.bookingCode, 'AG-B22M8X');
  assert.equal(jsonB.data.passengers[0].firstName, 'Bruno');
});

// ---------------------------------------------------------------------------
// 5) Documentos no disponibles: cancelada vs factura segun pago real
// ---------------------------------------------------------------------------

test('reserva cancelada: pasaje 409, factura 200 si hay pago aprobado real', async () => {
  const cancelada = sampleBooking({ status: 'CANCELLED' });
  const make = () => makeDb([cancelada], [payment()]);

  const pasaje = await executePasajeDownload(
    post('pasaje', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  assert.equal(pasaje.status, 409);
  const pasajeJson = await pasaje.json();
  assert.equal(pasajeJson.error.message, PASAJE_CANCELLED_MESSAGE);

  // Comportamiento documentado: el pago aprobado es real, la factura lo
  // documenta aunque la reserva este cancelada (el reembolso, si ocurrio,
  // cambia el estado del pago a REFUNDED y entonces no hay factura).
  const factura = await executeFacturaDownload(
    post('factura', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  assert.equal(factura.status, 200);
  assert.equal(factura.headers.get('content-type'), 'application/pdf');
});

test('reserva cancelada sin pago aprobado: pasaje 409 y factura 409', async () => {
  const cancelada = sampleBooking({ status: 'CANCELLED' });
  const make = () => makeDb([cancelada], [payment({ status: 'REFUNDED' })]);

  const pasaje = await executePasajeDownload(
    post('pasaje', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  assert.equal(pasaje.status, 409);
  const pasajeJson = await pasaje.json();
  assert.equal(pasajeJson.error.message, PASAJE_CANCELLED_MESSAGE);

  const factura = await executeFacturaDownload(
    post('factura', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  assert.equal(factura.status, 409);
  const facturaJson = await factura.json();
  assert.equal(facturaJson.error.message, FACTURA_UNAVAILABLE_MESSAGE);
});

test('reserva confirmada sin pago aprobado: factura 409 con mensaje honesto', async () => {
  const make = () => makeDb([sampleBooking()], [payment({ status: 'PENDING', paidAt: null })]);
  const factura = await executeFacturaDownload(
    post('factura', { code: 'AG-7F3K9Q', lastName: 'García' }),
    make().db,
  );
  assert.equal(factura.status, 409);
  const json = await factura.json();
  assert.equal(json.error.message, FACTURA_PENDING_MESSAGE);
});

// ---------------------------------------------------------------------------
// 6) Entradas manipuladas e inyeccion: nunca 500, nunca llegar crudas a la DB
// ---------------------------------------------------------------------------

const MALICIOUS_BODIES: Array<{ label: string; body: unknown }> = [
  { label: 'SQL basico en apellido', body: { code: 'AG-7F3K9Q', lastName: "'; DROP TABLE bookings;--" } },
  { label: 'SQL en codigo', body: { code: "AG-7F3K9Q'; DROP TABLE--", lastName: 'García' } },
  { label: 'SQL con comilla simple', body: { code: 'AG-7F3K9Q', lastName: "García' OR '1'='1" } },
  { label: 'SQL UNION', body: { code: 'AG-7F3K9Q', lastName: 'García UNION SELECT * FROM users' } },
  { label: 'path traversal en codigo', body: { code: '../../etc/passwd', lastName: 'García' } },
  { label: 'path traversal en apellido', body: { code: 'AG-7F3K9Q', lastName: '../../etc/passwd' } },
  { label: 'null byte en codigo', body: { code: 'AG-7F3K\x009Q', lastName: 'García' } },
  { label: 'null byte en apellido', body: { code: 'AG-7F3K9Q', lastName: 'Gar\x00cía' } },
  { label: 'HTML/script en apellido', body: { code: 'AG-7F3K9Q', lastName: '<script>alert(1)</script>' } },
  { label: 'XSS con entidades', body: { code: 'AG-7F3K9Q', lastName: 'Garc&iacute;a<img onerror=1>' } },
  { label: 'CRLF en apellido', body: { code: 'AG-7F3K9Q', lastName: 'García\r\nSet-Cookie: a=b' } },
  { label: 'apellido gigante (5000 chars)', body: { code: 'AG-7F3K9Q', lastName: 'A'.repeat(5000) } },
  { label: 'codigo gigante', body: { code: 'AG-' + 'A'.repeat(5000), lastName: 'García' } },
  { label: 'codigo como objeto', body: { code: { $gt: '' }, lastName: 'García' } },
  { label: 'codigo como array', body: { code: ['AG-7F3K9Q'], lastName: ['García'] } },
  { label: 'tipos raros', body: { code: 42, lastName: null } },
];

test('inyeccion/manipulacion: ninguna entrada maliciosa produce 500 ni llega cruda a la DB', async () => {
  for (const { label, body } of MALICIOUS_BODIES) {
    const { db, bookingLookups } = makeDb([sampleBooking()], [payment()]);
    for (const name of Object.keys(ENDPOINTS) as EndpointName[]) {
      const res = await ENDPOINTS[name].run(post(name, body), db);
      assert.ok(
        res.status === 400 || res.status === 404 || res.status === 422,
        `${name} / ${label}: se esperaba 400|404|422 y llego ${res.status}`,
      );
      const text = await res.text();
      assert.equal(text.includes('ECONNREFUSED'), false, `${name} / ${label}: no filtrar internals`);
      assert.equal(/SELECT|DROP TABLE|stack/i.test(text), false, `${name} / ${label}: no filtrar SQL`);
    }
    // Toda consulta que llego a la DB uso un codigo normalizado y con formato.
    for (const code of bookingLookups) {
      assert.match(
        code,
        /^AG-[A-Z0-9]{6}$/,
        `${label}: la DB solo debe ver codigos normalizados, llego ${JSON.stringify(code)}`,
      );
    }
  }
});

test('inyeccion: campos extra en el body se ignoran (no hay privilegios por mass-assignment)', async () => {
  const { db, bookingLookups } = makeDb([sampleBooking()], [payment()]);
  const res = await executePublicBookingLookup(
    post('consulta', {
      code: 'AG-7F3K9Q',
      lastName: 'García',
      userId: 'admin_1',
      status: 'CONFIRMED',
      passengersCount: 999,
    }),
    db,
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  // La vista proyectada no refleja ningun campo inyectado.
  assert.equal(json.data.userId, undefined);
  assert.equal(json.data.passengersCount, 1);
  assert.deepEqual(bookingLookups, ['AG-7F3K9Q']);
});

// ---------------------------------------------------------------------------
// 7) Fallos de servidor: 500 generico, sin internals, en los 3 endpoints
// ---------------------------------------------------------------------------

test('db caida: los 3 endpoints responden 500 generico sin exponer el error', async (t) => {
  const silent = t.mock.method(console, 'error', () => {});
  for (const name of Object.keys(ENDPOINTS) as EndpointName[]) {
    const { db } = makeDb([sampleBooking()], [payment()], { failBookingLookup: true });
    const res = await ENDPOINTS[name].run(
      post(name, { code: 'AG-7F3K9Q', lastName: 'García' }),
      db,
    );
    assert.equal(res.status, 500, name);
    const text = await res.text();
    assert.equal(text.includes('ECONNREFUSED'), false, `${name}: sin internals`);
    assert.equal(text.includes('5432'), false, `${name}: sin internals`);
    assert.equal(/SELECT|at \w+\./.test(text), false, `${name}: sin stack ni SQL`);
    const json = JSON.parse(text);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'INTERNAL_ERROR');
    assert.equal(json.error.message, 'Error interno del servidor');
  }
  assert.ok(silent.mock.callCount() >= 3, 'el error debe quedar logueado en servidor');
});

test('db caida solo de pagos: la factura responde 500 generico', async (t) => {
  const silent = t.mock.method(console, 'error', () => {});
  const { db } = makeDb([sampleBooking()], [payment()], { failPayments: true });
  const res = await executeFacturaDownload(
    post('factura', { code: 'AG-7F3K9Q', lastName: 'García' }),
    db,
  );
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.equal(text.includes('ECONNREFUSED'), false);
  const json = JSON.parse(text);
  assert.equal(json.error.code, 'INTERNAL_ERROR');
  assert.equal(json.error.message, 'Error interno del servidor');
  assert.ok(silent.mock.callCount() >= 1);
});

// ---------------------------------------------------------------------------
// 8) Caso de la historia: el detalle previo se descarta al buscar de nuevo
//    (ver comentario sobre cobertura al final de este archivo)
// ---------------------------------------------------------------------------

test('vista: el estado inicial nunca muestra detalle de reserva ni alertas', () => {
  const html = renderToStaticMarkup(createElement(ConsultaClient));
  assert.doesNotMatch(html, /Reserva AG-/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.doesNotMatch(html, /Descargar Pasaje PDF/);
  assert.match(html, /Buscar Reserva/);
});

test('vista: onSubmit descarta el resultado anterior antes de la nueva busqueda', () => {
  // Sin tooling de DOM (jsdom/testing-library no estan en el proyecto) no se
  // puede simular el submit interactivamente. Se verifica por inspeccion del
  // flujo: setResult(null) es la primera actualizacion de estado de onSubmit,
  // antes del fetch, de modo que una busqueda fallida siempre limpia el
  // detalle previo. Si alguien mueve la limpieza, este test lo detecta.
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'reserva', 'consulta-client.tsx'),
    'utf8',
  );
  const submitStart = source.indexOf('async function onSubmit');
  const clearIndex = source.indexOf('setResult(null)', submitStart);
  const fetchIndex = source.indexOf('await fetch(', submitStart);
  assert.ok(submitStart !== -1, 'onSubmit debe existir');
  assert.ok(clearIndex !== -1, 'onSubmit debe limpiar el resultado anterior');
  assert.ok(fetchIndex !== -1, 'onSubmit debe hacer el fetch');
  assert.ok(
    clearIndex < fetchIndex,
    'setResult(null) debe ejecutarse antes del fetch (limpiar el detalle previo)',
  );
});
