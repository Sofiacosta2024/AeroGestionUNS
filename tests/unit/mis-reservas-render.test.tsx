import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MisReservasClient, {
  BookingCard,
} from '../../src/app/mis-reservas/mis-reservas-client';
import { MY_BOOKINGS_EMPTY_MESSAGE, type MyBookingView } from '../../src/lib/my-bookings-view';

/**
 * US-15 v2.0: render del panel "Mis Reservas" (WF-15 y WF-15-E).
 * Sin tooling de DOM se renderiza a string estatico (mismo criterio que el
 * resto de las pruebas de vista del proyecto).
 */

function booking(overrides: Partial<MyBookingView> = {}): MyBookingView {
  return {
    bookingCode: 'AG-7F3K9Q',
    status: 'CONFIRMED',
    category: 'upcoming',
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    passengersCount: 1,
    totalAmount: 64200,
    currency: 'ARS',
    createdAt: '2026-01-10T12:00:00.000Z',
    flights: [
      {
        flightCode: 'AG-1420',
        origin: { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Bahía Blanca' },
        destination: { iataCode: 'AEP', city: 'Buenos Aires', name: 'Aeroparque' },
        departureAt: '2026-02-01T09:45:00.000Z',
        arrivalAt: '2026-02-01T10:55:00.000Z',
        status: 'SCHEDULED',
        isReturn: false,
        fareName: 'Economy Light',
        cabinClass: 'ECONOMY',
      },
    ],
    tickets: [],
    proposedFlight: null,
    proposalReason: null,
    passengerResponse: 'PENDIENTE',
    ...overrides,
  };
}

test('WF-15-E: cuenta sin reservas muestra el mensaje literal y el acceso a buscar vuelos', () => {
  const html = renderToStaticMarkup(
    createElement(MisReservasClient, {
      upcoming: [],
      past: [],
      userEmail: 'nuevo@example.com',
      userName: 'Cuenta Nueva',
    }),
  );
  assert.ok(html.includes(MY_BOOKINGS_EMPTY_MESSAGE));
  assert.match(html, /href="\/vuelos"/);
  assert.match(html, /Buscar vuelos/);
  assert.doesNotMatch(html, /Gestionar Reserva/);
});

test('WF-15: el encabezado de perfil y las dos pestanas estan presentes', () => {
  const html = renderToStaticMarkup(
    createElement(MisReservasClient, {
      upcoming: [booking()],
      past: [],
      userEmail: 'm.rodriguez@gmail.com',
      userName: 'Mariano Rodríguez',
    }),
  );
  assert.match(html, /Mariano Rodríguez/);
  assert.match(html, /m\.rodriguez@gmail\.com · Pasajero registrado/);
  assert.match(html, /Próximos Vuelos/);
  assert.match(html, /Historial \/ Pasados/);
});

test('US-15: cada tarjeta incluye el boton unificado "Gestionar Reserva" con el codigo precargado', () => {
  const html = renderToStaticMarkup(createElement(BookingCard, { booking: booking() }));
  assert.match(html, /AG-7F3K9Q/);
  assert.match(html, /BHI → AEP/);
  assert.match(html, /AG-1420/);
  assert.match(html, /Gestionar Reserva/);
  assert.match(html, /href="\/reserva\?code=AG-7F3K9Q"/);
});

test('US-15 v2.0: una reserva en contingencia muestra su estado y el vuelo propuesto', () => {
  const html = renderToStaticMarkup(
    createElement(BookingCard, {
      booking: booking({
        bookingCode: 'AG-CCCCCC',
        status: 'REASIGNACION_PROPUESTA',
        proposedFlight: {
          flightCode: 'AG-1436',
          origin: { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Bahía Blanca' },
          destination: { iataCode: 'AEP', city: 'Buenos Aires', name: 'Aeroparque' },
          departureAt: '2026-02-02T18:00:00.000Z',
          arrivalAt: '2026-02-02T19:10:00.000Z',
          status: 'SCHEDULED',
          isReturn: false,
          fareName: null,
          cabinClass: 'ECONOMY',
        },
      }),
    }),
  );
  assert.match(html, /gestión por contingencia/);
  assert.match(html, /Vuelo propuesto/);
  assert.match(html, /AG-1436/);
});
