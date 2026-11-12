import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  MY_BOOKINGS_EMPTY_MESSAGE,
  PAST_BOOKING_STATUSES,
  UPCOMING_BOOKING_STATUSES,
  classifyBookingStatus,
  partitionMyBookings,
  type MyBookingView,
} from '../../src/lib/my-bookings-view';
import {
  executeMyBookingsList,
  findMyBookings,
  toMyBookingView,
  type MyBookingRecord,
} from '../../src/lib/my-bookings';

// ---------------------------------------------------------------------------
// US-15 v2.0: clasificacion, proyeccion y consulta de "Mis Reservas"
// ---------------------------------------------------------------------------

function airport(iataCode: string) {
  return { iataCode, name: iataCode, city: iataCode };
}

function flight(
  code: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `fl_${code}`,
    code,
    departureAt: new Date('2026-02-01T09:45:00Z'),
    arrivalAt: new Date('2026-02-01T10:55:00Z'),
    status: 'SCHEDULED',
    route: { originAirport: airport('BHI'), destinationAirport: airport('AEP') },
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}): MyBookingRecord {
  return {
    id: 'bk_1',
    bookingCode: 'AG-7F3K9Q',
    userId: 'user_1',
    status: 'CONFIRMED',
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    passengersCount: 1,
    totalAmount: 64200,
    currency: 'ARS',
    createdAt: new Date('2026-01-10T12:00:00Z'),
    propuestaMotivo: null,
    respuestaPasajero: 'PENDIENTE',
    flights: [
      {
        id: 'bf_1',
        isReturn: false,
        fare: { name: 'Economy Light', cabinClass: 'ECONOMY' },
        flight: flight('AG-1420'),
      },
    ],
    vueloPropuesto: null,
    ...overrides,
  } as unknown as MyBookingRecord;
}

function makeDb(records: MyBookingRecord[]) {
  let captured: unknown;
  const db = {
    booking: {
      findMany: async (args: unknown) => {
        captured = args;
        return records;
      },
    },
  } as unknown as PrismaClient;
  return { db, captured: () => captured as { where?: Record<string, unknown> } };
}

// ---------------------------------------------------------------------------
// 1) Clasificacion por pestana
// ---------------------------------------------------------------------------

test('US-15: las reservas confirmadas y reprogramadas van a "Proximos Vuelos"', () => {
  for (const status of ['CONFIRMED', 'PAID', 'REPROGRAMADA', 'REASIGNADO', 'PENDING']) {
    assert.equal(classifyBookingStatus(status), 'upcoming', status);
  }
});

test('US-15 v2.0: los tres estados de contingencia van a "Proximos Vuelos"', () => {
  for (const status of [
    'REPROGRAMACION_PENDIENTE',
    'REASIGNACION_PROPUESTA',
    'SIN_ALTERNATIVA',
  ]) {
    assert.equal(classifyBookingStatus(status), 'upcoming', status);
  }
});

test('US-15: canceladas y finalizadas van al historial', () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'BOARDED', 'NO_SHOW']) {
    assert.equal(classifyBookingStatus(status), 'past', status);
  }
});

test('US-15: tolera mayusculas/minusculas y espacios exteriores', () => {
  assert.equal(classifyBookingStatus(' confirmed '), 'upcoming');
  assert.equal(classifyBookingStatus('  ReprogrAMADA  '), 'upcoming');
  assert.equal(classifyBookingStatus('sin_alternativa'), 'upcoming');
  assert.equal(classifyBookingStatus('  cancelado  '), 'past');
});

test('US-15: un estado desconocido cae al historial (bucket de solo lectura)', () => {
  assert.equal(classifyBookingStatus('NO_EXISTE'), 'past');
  assert.equal(classifyBookingStatus(null), 'past');
  assert.equal(classifyBookingStatus(undefined), 'past');
  assert.equal(classifyBookingStatus(''), 'past');
});

test('US-15: los conjuntos de estados no se solapan', () => {
  for (const status of UPCOMING_BOOKING_STATUSES) {
    assert.equal(PAST_BOOKING_STATUSES.includes(status), false, status);
  }
});

test('US-15: el mensaje de estado vacio es el literal pedido por la historia (WF-15-E)', () => {
  assert.equal(
    MY_BOOKINGS_EMPTY_MESSAGE,
    'Aún no posees reservas asociadas a tu cuenta. Podés realizar una búsqueda de vuelos desde el inicio.',
  );
});

// ---------------------------------------------------------------------------
// 2) Proyeccion a DTO
// ---------------------------------------------------------------------------

test('US-15: la reserva se proyecta con codigo, vuelo, ruta y estado', () => {
  const view = toMyBookingView(record());
  assert.equal(view.bookingCode, 'AG-7F3K9Q');
  assert.equal(view.status, 'CONFIRMED');
  assert.equal(view.category, 'upcoming');
  assert.equal(view.totalAmount, 64200);
  assert.equal(view.flights.length, 1);
  assert.equal(view.flights[0]?.flightCode, 'AG-1420');
  assert.equal(view.flights[0]?.origin?.iataCode, 'BHI');
  assert.equal(view.flights[0]?.destination?.iataCode, 'AEP');
  assert.equal(view.flights[0]?.fareName, 'Economy Light');
  assert.equal(view.proposedFlight, null);
});

test('US-15 v2.0: expone el vuelo propuesto y el motivo cuando la reserva esta en contingencia', () => {
  const view = toMyBookingView(
    record({
      status: 'REASIGNACION_PROPUESTA',
      propuestaMotivo: 'Cancelacion por meteorologia',
      vueloPropuesto: flight('AG-1436', {
        departureAt: new Date('2026-02-02T18:00:00Z'),
        arrivalAt: new Date('2026-02-02T19:10:00Z'),
      }),
    }),
  );
  assert.equal(view.category, 'upcoming');
  assert.equal(view.proposedFlight?.flightCode, 'AG-1436');
  assert.equal(view.proposedFlight?.origin?.iataCode, 'BHI');
  assert.equal(view.proposalReason, 'Cancelacion por meteorologia');
});

// ---------------------------------------------------------------------------
// 3) Consulta relacional (JOIN por user_id y email de contacto)
// ---------------------------------------------------------------------------

test('US-15: la consulta asocia por userId o por email de una reserva de invitado', async () => {
  const { db, captured } = makeDb([record()]);
  const result = await findMyBookings(db, { userId: 'user_1', email: 'ana@example.com' });

  assert.equal(result.length, 1);
  assert.deepEqual(captured().where, {
    OR: [
      { userId: 'user_1' },
      { userId: null, contactEmail: { equals: 'ana@example.com', mode: 'insensitive' } },
    ],
  });
});

test('US-15: sin reservas asociadas devuelve una lista vacia (WF-15-E)', async () => {
  const { db } = makeDb([]);
  const result = await findMyBookings(db, { userId: 'user_1', email: 'nuevo@example.com' });
  assert.deepEqual(result, []);
});

test('US-15: executeMyBookingsList responde { ok: true, data: { upcoming, past } }', async () => {
  const records = [
    record({ id: 'bk_1', bookingCode: 'AG-AAAAAA', status: 'CONFIRMED' }),
    record({ id: 'bk_2', bookingCode: 'AG-BBBBBB', status: 'CANCELLED' }),
    record({ id: 'bk_3', bookingCode: 'AG-CCCCCC', status: 'SIN_ALTERNATIVA' }),
  ];
  const { db } = makeDb(records);
  const res = await executeMyBookingsList(db, { id: 'user_1', email: 'ana@example.com' });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.deepEqual(
    json.data.upcoming.map((b: MyBookingView) => b.bookingCode),
    ['AG-AAAAAA', 'AG-CCCCCC'],
  );
  assert.deepEqual(
    json.data.past.map((b: MyBookingView) => b.bookingCode),
    ['AG-BBBBBB'],
  );
});

test('US-15: partitionMyBookings no altera el orden recibido', () => {
  const view = (bookingCode: string, category: MyBookingView['category']): MyBookingView => ({
    bookingCode,
    status: category === 'upcoming' ? 'CONFIRMED' : 'CANCELLED',
    category,
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    passengersCount: 1,
    totalAmount: 0,
    currency: 'ARS',
    createdAt: null,
    flights: [],
    proposedFlight: null,
    proposalReason: null,
    passengerResponse: null,
  });
  const { upcoming, past } = partitionMyBookings([
    view('A', 'upcoming'),
    view('B', 'past'),
    view('C', 'upcoming'),
  ]);
  assert.deepEqual(upcoming.map((b) => b.bookingCode), ['A', 'C']);
  assert.deepEqual(past.map((b) => b.bookingCode), ['B']);
});
