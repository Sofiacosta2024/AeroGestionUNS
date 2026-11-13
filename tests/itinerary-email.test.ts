import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { itinerarySnapshotSchema, type ItinerarySnapshot } from '../src/lib/email/itinerary-snapshot';
import { itineraryRows, renderItineraryChangeEmail } from '../src/lib/email/itinerary-template';
import { processReceiptDispatch } from '../src/lib/email/processor';
import { sendBookingCancellationEmail, sendCancellationEmail, sendItineraryEmail } from '../src/lib/email/provider';
import { renderFlightCancellationEmail } from '../src/lib/email/cancellation-template';
import type { CancellationSnapshot } from '../src/lib/email/cancellation-snapshot';

// US-06A: aviso de reprogramacion de itinerario (WF-06A). Sin base de datos ni envios reales.

function sampleItinerary(): ItinerarySnapshot {
  const leg = {
    flightCode: 'AG-1420',
    origin: { code: 'BHI', city: 'Bahía Blanca' },
    destination: { code: 'AEP', city: 'Buenos Aires' },
    aircraft: 'Boeing 737-800 · LV-CKU',
  };
  return {
    version: 1,
    recipient: 'mariano@example.com',
    greetingName: 'Mariano',
    displayCode: 'XK9P2L',
    bookingUrl: 'https://aerogestion.example/reserva',
    // 18/11 06:45 -> 07:55 ART pasa a 19/11 08:30 -> 09:40 ART (los datos del WF-06A).
    before: { ...leg, departureAt: '2025-11-18T09:45:00.000Z', arrivalAt: '2025-11-18T10:55:00.000Z' },
    after: { ...leg, departureAt: '2025-11-19T11:30:00.000Z', arrivalAt: '2025-11-19T12:40:00.000Z' },
  };
}

test('WF-06A: banner, saludo, código, tabla Anterior/Nuevo en ART y botón a la reserva', () => {
  const { subject, html, text } = renderItineraryChangeEmail(sampleItinerary());
  assert.equal(subject, 'Reserva XK9P2L — Tu vuelo fue reprogramado');
  for (const value of ['Tu vuelo fue reprogramado', 'Hola, Mariano:', 'XK9P2L', 'Anterior', 'Nuevo', 'Ver Mi Reserva',
    'href="https://aerogestion.example/reserva"', 'Mensaje automático, no respondas a esta casilla.']) {
    assert.ok(html.includes(value), value);
  }
  assert.deepEqual(itineraryRows(sampleItinerary().before, sampleItinerary().after), [
    { label: 'Fecha', before: '18/11/2025', after: '19/11/2025' },
    { label: 'Salida', before: '06:45', after: '08:30' },
    { label: 'Llegada', before: '07:55', after: '09:40' },
  ]);
  assert.ok(html.includes('line-through;color:#b4234a">06:45'));
  assert.ok(html.includes('color:#15803d;font-weight:bold">08:30'));
  assert.ok(text.includes('Salida: 06:45 → 08:30'));
});

test('lo que no cambia no se tacha y Vuelo, Ruta y Aeronave aparecen solo si cambian', () => {
  const s = sampleItinerary();
  s.after = { ...s.before, departureAt: '2025-11-18T12:45:00.000Z', arrivalAt: '2025-11-18T13:55:00.000Z' };
  const rows = itineraryRows(s.before, s.after);
  assert.deepEqual(rows.map((r) => r.label), ['Fecha', 'Salida', 'Llegada']);
  assert.ok(renderItineraryChangeEmail(s).html.includes('color:#1d1640">18/11/2025'));
  assert.ok(renderItineraryChangeEmail(s).text.includes('Fecha: 18/11/2025\n'));

  // US-12B: otro vuelo y otro avion.
  s.after = { ...s.after, flightCode: 'AG-1428', aircraft: 'Embraer E190 · LV-FPS' };
  assert.deepEqual(itineraryRows(s.before, s.after).map((r) => r.label), ['Vuelo', 'Fecha', 'Salida', 'Llegada', 'Aeronave']);
});

test('escapa el nombre del pasajero', () => {
  const s = sampleItinerary();
  s.greetingName = '<img src=x onerror=alert(1)>';
  const { html } = renderItineraryChangeEmail(s);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('proveedor recibe destinatario, asunto y clave estable, sin adjuntos', async () => {
  const result = await sendItineraryEmail(sampleItinerary(), 'itinerary-test', { apiKey: 'fake', from: 'ops@example.com',
    fetch: (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.to, ['mariano@example.com']);
      assert.equal(body.subject, 'Reserva XK9P2L — Tu vuelo fue reprogramado');
      assert.equal(body.attachments, undefined);
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'itinerary-test');
      return Response.json({ id: 'provider-itinerary' });
    }) as typeof fetch });
  assert.equal(result.providerMessageId, 'provider-itinerary');
});

function dispatchFixture(kind: 'ITINERARY_CHANGE' | 'RECEIPT' | 'FLIGHT_CANCELLED' | 'BOOKING_CANCELLED', snapshot: unknown) {
  const row = { id: 'dispatch', kind, recipient: 'mariano@example.com', attempts: 0, status: 'PENDIENTE', snapshot,
    nextAttemptAt: new Date('2026-11-08T00:00:00Z'), leaseUntil: null as Date | null, leaseToken: null as string | null,
    lastError: null as string | null, providerMessageId: null as string | null };
  const db = { $queryRaw: async () => [],
    emailDispatch: {
      findUnique: async () => ({ ...row }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data, { attempts: typeof data.attempts === 'object' ? row.attempts + 1 : row.attempts }); return { ...row };
      },
      updateMany: async ({ where, data }: { where: { leaseToken: string }; data: Record<string, unknown> }) => {
        if (row.leaseToken !== where.leaseToken) return { count: 0 }; Object.assign(row, data); return { count: 1 };
      },
    },
    emailDispatchAttempt: { create: async () => ({}), update: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  } as unknown as PrismaClient;
  return { row, db, now: () => new Date('2026-11-08T00:00:00Z') };
}

test('el worker manda el aviso con su plantilla y nunca por el camino del comprobante', async () => {
  const f = dispatchFixture('ITINERARY_CHANGE', sampleItinerary());
  const keys: string[] = [];
  await processReceiptDispatch('dispatch', { db: f.db, now: f.now,
    send: async () => { throw new Error('no debe usarse el envio de comprobantes'); },
    sendItinerary: async (snapshot, key) => { keys.push(key); assert.equal(snapshot.displayCode, 'XK9P2L'); return { providerMessageId: 'msg-1' }; } });
  assert.deepEqual(keys, ['itinerary-dispatch']);
  assert.equal(f.row.status, 'ENVIADO');
  assert.equal(f.row.providerMessageId, 'msg-1');
});

test('un aviso con datos inválidos falla sin reintentos', async () => {
  const f = dispatchFixture('ITINERARY_CHANGE', { version: 1 });
  let calls = 0;
  await processReceiptDispatch('dispatch', { db: f.db, now: f.now, sendItinerary: async () => { calls++; return { providerMessageId: 'x' }; } });
  assert.equal(calls, 0);
  assert.equal(f.row.status, 'FALLIDO');
  assert.equal(f.row.attempts, 1);
});

test('el snapshot de ejemplo cumple el esquema', () => {
  assert.ok(itinerarySnapshotSchema.safeParse(sampleItinerary()).success);
});

const cancellation: CancellationSnapshot = {
  version: 1,
  recipient: 'mariano@example.com',
  greetingName: 'Mariano <script>',
  displayCode: 'XK9P2L',
  bookingUrl: 'https://aerogestion.example/reserva',
  reason: 'Clima',
  status: 'REASIGNACION_PROPUESTA',
  cancelled: { flightCode: 'AG-1420', departureAt: '2025-11-18T09:45:00.000Z', arrivalAt: '2025-11-18T10:55:00.000Z' },
  proposed: { flightCode: 'AG-1428', departureAt: '2025-11-18T16:20:00.000Z', arrivalAt: '2025-11-18T17:30:00.000Z' },
};

test('WF-06B: muestra la alerta, ambos vuelos en ART, el motivo y cómo responder', () => {
  const { subject, html, text } = renderFlightCancellationEmail(cancellation);
  assert.match(subject, /ALERTA URGENTE.*XK9P2L/);
  for (const value of ['Vuelo cancelado', 'Vuelo propuesto', 'AG-1420', 'AG-1428', '18/11/2025', '06:45',
    '13:20 → 14:30', 'REASIGNACIÓN_PROPUESTA', 'Clima', '0800-555-0199', 'Ver Mi Reserva']) {
    assert.ok(html.includes(value), value);
    assert.ok(text.includes(value), value);
  }
  assert.ok(html.includes('text-decoration:line-through'));
  assert.ok(html.includes('href="https://aerogestion.example/reserva"'));
  assert.ok(html.includes('Mariano &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(text.includes('Si el vuelo propuesto te sirve, no hace falta que hagas nada: lo confirmaremos por vos. Si preferís otro vuelo o cancelar la reserva, comunicate con Atención prioritaria: 0800-555-0199.'));
});

test('WF-06B: sin alternativa muestra el estado y dirige al pasajero a Atención prioritaria', () => {
  const { html, text } = renderFlightCancellationEmail({
    ...cancellation, status: 'SIN_ALTERNATIVA', proposed: null,
  });
  for (const content of [html, text]) {
    assert.ok(content.includes('A confirmar por Atención prioritaria'));
    assert.ok(content.includes('SIN_ALTERNATIVA'));
    assert.ok(content.includes('0800-555-0199'));
    assert.ok(!content.includes('lo confirmaremos por vos'));
  }
});

test('el proveedor recibe ambas versiones del aviso para el destinatario de la reserva', async () => {
  const result = await sendCancellationEmail(cancellation, 'cancel-dispatch', {
    apiKey: 'fake',
    from: 'ops@example.com',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.to, [cancellation.recipient]);
      assert.match(body.subject, /Vuelo cancelado/);
      assert.match(body.html, /AG-1428/);
      assert.match(body.text, /AG-1428/);
      assert.equal(body.attachments, undefined);
      assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'cancel-dispatch');
      return Response.json({ id: 'provider-cancellation' });
    },
  });
  assert.equal(result.providerMessageId, 'provider-cancellation');
});

test('el worker procesa el aviso de cancelación con una clave estable y valida el resultado del motor', async () => {
  const valid = dispatchFixture('FLIGHT_CANCELLED', cancellation);
  const invalid = dispatchFixture('FLIGHT_CANCELLED', { ...cancellation, proposed: null });
  const keys: string[] = [];
  const sendCancellation = async (snapshot: CancellationSnapshot, key: string) => {
    assert.deepEqual(snapshot, cancellation);
    keys.push(key);
    return { providerMessageId: 'provider-cancellation' };
  };
  await processReceiptDispatch('dispatch', { db: valid.db, now: valid.now, sendCancellation });
  await processReceiptDispatch('dispatch', { db: invalid.db, now: invalid.now, sendCancellation });
  assert.deepEqual(keys, ['cancel-dispatch']);
  assert.equal(valid.row.status, 'ENVIADO');
  assert.equal(valid.row.providerMessageId, 'provider-cancellation');
  assert.equal(invalid.row.status, 'FALLIDO');
});

test('la cancelación de reserva llega a su contacto con el estado del reembolso', async () => {
  const snapshot = {
    version: 1, recipient: 'reserva@example.com', greetingName: 'Lucía',
    displayCode: 'XK9P2L', bookingUrl: 'https://aerogestion.example/reserva', refundPending: true,
  } as const;
  const f = dispatchFixture('BOOKING_CANCELLED', snapshot);
  let calls = 0;
  await processReceiptDispatch('dispatch', {
    db: f.db,
    now: f.now,
    sendBookingCancellation: (data, key) => sendBookingCancellationEmail(data, key, {
      apiKey: 'fake',
      from: 'ops@example.com',
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(body.to, [snapshot.recipient]);
        assert.match(body.subject, /Tu reserva fue cancelada/);
        assert.match(body.text, /El reembolso quedó pendiente/);
        assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'booking-cancelled-dispatch');
        return Response.json({ id: 'provider-booking-cancelled' });
      },
    }),
  });
  assert.equal(calls, 1);
  assert.equal(f.row.status, 'ENVIADO');
});
