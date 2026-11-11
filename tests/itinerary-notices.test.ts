import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingLookupUrl, itineraryNotice } from '../src/lib/scheduling/itinerary-notices';

// US-06A: armado del aviso por reserva al reprogramar (US-11B). Sin base de datos.

const leg = {
  flightCode: 'AG-1420',
  origin: { code: 'BHI', city: 'Bahía Blanca' },
  destination: { code: 'AEP', city: 'Buenos Aires' },
  departureAt: '2025-11-18T09:45:00.000Z',
  arrivalAt: '2025-11-18T10:55:00.000Z',
  aircraft: 'Boeing 737-800 · LV-CKU',
};
const after = { ...leg, departureAt: '2025-11-19T11:30:00.000Z', arrivalAt: '2025-11-19T12:40:00.000Z' };
const booking = { id: 'b1', bookingCode: 'AG-XK9P2L', contactEmail: 'mariano@example.com', passengers: [{ firstName: 'Mariano' }] };

test('arma el aviso con el código visible, el primer pasajero y una clave por cambio y reserva', () => {
  const notice = itineraryNotice(booking, leg, after, 'https://app.example/reserva', 'evt');
  assert.ok(notice);
  assert.equal(notice.bookingId, 'b1');
  assert.equal(notice.dedupeKey, 'itinerary-evt-b1');
  assert.equal(notice.snapshot.displayCode, 'XK9P2L');
  assert.equal(notice.snapshot.greetingName, 'Mariano');
  assert.equal(notice.snapshot.recipient, 'mariano@example.com');
  assert.equal(notice.snapshot.bookingUrl, 'https://app.example/reserva');
  assert.equal(itineraryNotice({ ...booking, passengers: [] }, leg, after, 'https://app.example/reserva', 'evt')?.snapshot.greetingName, 'Pasajero');
});

test('omite reservas cuyos datos no sirven para el correo en vez de frenar el cambio', () => {
  assert.equal(itineraryNotice({ ...booking, bookingCode: 'AG-DEMO1' }, leg, after, 'https://app.example/reserva', 'evt'), null);
  assert.equal(itineraryNotice({ ...booking, contactEmail: 'no-es-mail' }, leg, after, 'https://app.example/reserva', 'evt'), null);
});

test('el link «Ver Mi Reserva» usa NEXT_PUBLIC_APP_URL y si no está, el origen del pedido', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(bookingLookupUrl('http://localhost:3000'), 'http://localhost:3000/reserva');
    process.env.NEXT_PUBLIC_APP_URL = 'https://unsaerogestion.vercel.app/';
    assert.equal(bookingLookupUrl('http://localhost:3000'), 'https://unsaerogestion.vercel.app/reserva');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});
