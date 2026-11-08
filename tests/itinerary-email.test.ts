import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { itinerarySnapshotSchema, type ItinerarySnapshot } from '../src/lib/email/itinerary-snapshot';
import { itineraryRows, renderItineraryChangeEmail } from '../src/lib/email/itinerary-template';
import { processReceiptDispatch } from '../src/lib/email/processor';
import { sendItineraryEmail } from '../src/lib/email/provider';

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

function dispatchFixture(kind: 'ITINERARY_CHANGE' | 'RECEIPT', snapshot: unknown) {
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
