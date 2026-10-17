import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReservaDetalle } from '../../src/app/reserva/consulta-client';
import type { PublicBookingView } from '../../src/lib/public-booking-view';

/**
 * Pruebas de la vista de detalle (US-14A). Renderizan el componente real a
 * marcado HTML estatico y verifican que:
 * - muestra unicamente los datos reales que le pasa el backend,
 * - tolera campos opcionales ausentes sin romper,
 * - incluye los botones de descarga como elementos de interfaz (sin simular).
 */

function sampleBooking(overrides: Partial<PublicBookingView> = {}): PublicBookingView {
  return {
    bookingCode: 'AG-7F3K9Q',
    status: 'CONFIRMED',
    tripType: 'ROUND_TRIP',
    cabinClass: 'ECONOMY',
    passengersCount: 2,
    totalAmount: 128400,
    currency: 'ARS',
    createdAt: '2025-11-01T12:00:00.000Z',
    flights: [
      {
        flightCode: 'AG-1420',
        origin: { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Aeropuerto Espora' },
        destination: { iataCode: 'AEP', city: 'Buenos Aires', name: 'Aeroparque' },
        departureAt: '2025-11-18T09:45:00.000Z',
        arrivalAt: '2025-11-18T10:55:00.000Z',
        status: 'SCHEDULED',
        isReturn: false,
        price: 64200,
        fare: { name: 'Economy Premium', cabinClass: 'ECONOMY' },
      },
    ],
    passengers: [
      {
        firstName: 'Mariano',
        lastName: 'Rodríguez',
        documentType: 'DNI',
        documentNumber: '*****190',
        seatNumber: '12A',
        checkInStatus: 'OPEN',
      },
      {
        firstName: 'Lucía',
        lastName: 'Gómez',
        documentType: 'DNI',
        documentNumber: '*****804',
        seatNumber: '12B',
        checkInStatus: 'OPEN',
      },
    ],
    ...overrides,
  };
}

const render = (booking: PublicBookingView) => renderToStaticMarkup(ReservaDetalle({ booking }));

test('detalle: muestra codigo, estado, vuelo, ruta y horarios reales', () => {
  const html = render(sampleBooking());
  assert.match(html, /Reserva AG-7F3K9Q/);
  assert.match(html, /Compra confirmada/);
  assert.match(html, /AG-1420 · BHI → AEP/);
  assert.match(html, /06:45 → 07:55/);
  assert.match(html, /18/);
});

test('detalle: tabla de pasajeros con nombre, documento enmascarado, asiento y clase', () => {
  const html = render(sampleBooking());
  assert.match(html, /Mariano Rodríguez/);
  assert.match(html, /DNI \*\*\*\*\*190/);
  assert.match(html, /Lucía Gómez/);
  assert.match(html, /12A/);
  assert.match(html, /12B/);
  assert.match(html, /Economy/);
  assert.match(html, /2 pasajeros/);
});

test('detalle: no filtra datos internos que el backend no envia', () => {
  const html = render(sampleBooking());
  assert.doesNotMatch(html, /ana@example\.com/);
  assert.doesNotMatch(html, /contactPhone/);
  assert.doesNotMatch(html, /\b\d{8}\b/);
});

test('detalle: botones de descarga presentes pero no simulan descargas', () => {
  const html = render(sampleBooking());
  assert.match(html, /Descargar Pasaje PDF/);
  assert.match(html, /Descargar Factura PDF/);
  const disabled = html.match(/disabled=""/g) ?? [];
  assert.equal(disabled.length, 2, 'los dos botones de descarga deben estar deshabilitados');
});

test('detalle: campos opcionales ausentes no rompen la vista', () => {
  const booking = sampleBooking({
    flights: [
      {
        flightCode: 'AG-9999',
        origin: null,
        destination: null,
        departureAt: null,
        arrivalAt: null,
        status: '',
        isReturn: false,
        price: 0,
        fare: null,
      },
    ],
    passengers: [
      {
        firstName: 'Solo',
        lastName: 'Apellido',
        documentType: null,
        documentNumber: null,
        seatNumber: null,
        checkInStatus: null,
      },
    ],
    cabinClass: '',
    passengersCount: 1,
  });

  const html = render(booking);
  assert.match(html, /Fecha a confirmar/);
  assert.match(html, /Horario a confirmar/);
  assert.match(html, /A asignar/);
  assert.match(html, /AG-9999 · — → —/);
  assert.match(html, /Solo Apellido/);
  assert.match(html, /Total/);
});

test('detalle: estado desconocido se muestra como texto de respaldo', () => {
  const html = render(sampleBooking({ status: 'WEIRD_STATE' }));
  assert.match(html, /WEIRD_STATE/);
});

test('detalle: reserva de ida y vuelta con varios vuelos', () => {
  const booking = sampleBooking();
  booking.flights.push({
    flightCode: 'AG-1421',
    origin: { iataCode: 'AEP', city: 'Buenos Aires', name: 'Aeroparque' },
    destination: { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Espora' },
    departureAt: '2025-11-25T18:30:00.000Z',
    arrivalAt: '2025-11-25T19:40:00.000Z',
    status: 'SCHEDULED',
    isReturn: true,
    price: 64200,
    fare: { name: 'Economy Premium', cabinClass: 'ECONOMY' },
  });
  const html = render(booking);
  assert.match(html, /AG-1420/);
  assert.match(html, /AG-1421/);
  assert.match(html, /Regreso/);
  assert.match(html, /AEP → BHI/);
});
