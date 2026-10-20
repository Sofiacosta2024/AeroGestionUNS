import { createElement } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ReservaDetalle,
  describeFacturaDownloadError,
  describePasajeDownloadError,
  pdfFilenameFromDisposition,
} from '../../src/app/reserva/consulta-client';
import type { PublicBookingView } from '../../src/lib/public-booking-view';

/**
 * Pruebas de la vista de detalle (US-14A). Renderizan el componente real a
 * marcado HTML estatico y verifican que:
 * - muestra unicamente los datos reales que le pasa el backend,
 * - tolera campos opcionales ausentes sin romper,
 * - habilita la descarga del pasaje y de la factura (sin simular el fetch),
 * - los helpers de la descarga (nombre de archivo y mensajes de error)
 *   son seguros y no filtran detalles internos.
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

const render = (booking: PublicBookingView) =>
  renderToStaticMarkup(createElement(ReservaDetalle, { booking }));

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

test('detalle: pasaje y factura habilitados para descargar', () => {
  const html = render(sampleBooking());
  assert.match(html, /Descargar Pasaje PDF/);
  assert.match(html, /Descargar Factura PDF/);
  // Cada boton en su propio segmento: className trae utilidades "disabled:".
  const buttonFor = (label: string) =>
    html
      .split('<button')
      .find((segment) => segment.includes(label))
      ?.split('>')[0] ?? '';
  assert.doesNotMatch(buttonFor('Descargar Pasaje PDF'), /\sdisabled=""/, 'el boton de pasaje debe estar habilitado');
  assert.doesNotMatch(buttonFor('Descargar Factura PDF'), /\sdisabled=""/, 'el boton de factura debe estar habilitado');
});

test('detalle: sin apellido utilizable ambas descargas quedan deshabilitadas', () => {
  const html = render(
    sampleBooking({
      passengers: [
        { firstName: 'Sin', lastName: '', documentType: null, documentNumber: null, seatNumber: null, checkInStatus: null },
      ],
    }),
  );
  const buttonFor = (label: string) =>
    html.split('<button').find((segment) => segment.includes(label))?.split('>')[0] ?? '';
  assert.match(buttonFor('Descargar Pasaje PDF'), /\sdisabled=""/);
  assert.match(buttonFor('Descargar Factura PDF'), /\sdisabled=""/);
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

// ---------------------------------------------------------------------------
// Helpers de la descarga del pasaje (nombre de archivo y mensajes)
// ---------------------------------------------------------------------------

test('pdfFilenameFromDisposition: acepta el nombre simple del endpoint', () => {
  assert.equal(
    pdfFilenameFromDisposition('attachment; filename="pasaje-AG-7F3K9Q.pdf"'),
    'pasaje-AG-7F3K9Q.pdf',
  );
});

test('pdfFilenameFromDisposition: rechaza headers ausentes o inseguros', () => {
  assert.equal(pdfFilenameFromDisposition(null), null);
  assert.equal(pdfFilenameFromDisposition(''), null);
  assert.equal(pdfFilenameFromDisposition('attachment'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename=""'), null);
  // Rutas o separadores: nunca se usan como nombre de archivo local.
  assert.equal(pdfFilenameFromDisposition('attachment; filename="../../etc/passwd.pdf"'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename="C:\\Windows\\x.pdf"'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename="a/b.pdf"'), null);
  // Extension no PDF o caracteres raros.
  assert.equal(pdfFilenameFromDisposition('attachment; filename="pasaje.exe"'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename="pasaje.pdf.txt"'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename="pa saje.pdf"'), null);
  assert.equal(pdfFilenameFromDisposition('attachment; filename=".pdf"'), null);
  // filename* (RFC 5987) no se interpreta: se usa el nombre de respaldo.
  assert.equal(pdfFilenameFromDisposition("attachment; filename*=UTF-8''x.pdf"), null);
});

test('describePasajeDownloadError: 404 usa el mensaje exacto de no encontrado', () => {
  const message = describePasajeDownloadError(404, null);
  assert.equal(
    message,
    'No encontramos ninguna reserva que coincida con el código y apellido ingresados. Por favor verifique sus datos.',
  );
});

test('describePasajeDownloadError: 409 (cancelada) usa el mensaje del servidor', () => {
  assert.equal(
    describePasajeDownloadError(409, 'El pasaje no está disponible para reservas canceladas'),
    'El pasaje no está disponible para reservas canceladas',
  );
  // Sin mensaje del servidor cae al generico.
  assert.equal(
    describePasajeDownloadError(409, null),
    'No pudimos generar el pasaje en PDF. Intente nuevamente en unos instantes.',
  );
});

test('describePasajeDownloadError: demas fallos son genericos, sin filtrar internals', () => {
  const generic = 'No pudimos generar el pasaje en PDF. Intente nuevamente en unos instantes.';
  for (const status of [400, 422, 500]) {
    assert.equal(describePasajeDownloadError(status, null), generic);
    // Aunque el servidor mande un mensaje, no se propaga en estados no esperados.
    assert.equal(describePasajeDownloadError(status, 'detalle interno del servidor'), generic);
  }
  // Ningun mensaje resultante contiene texto tipo stack trace o SQL.
  for (const status of [400, 404, 409, 422, 500]) {
    const message = describePasajeDownloadError(status, status === 409 ? 'El pasaje no está disponible para reservas canceladas' : 'Error: SELECT * FROM bookings');
    assert.doesNotMatch(message, /SELECT|Error:|at \w+\./);
  }
});

// ---------------------------------------------------------------------------
// Helper de la descarga de la factura (mensajes)
// ---------------------------------------------------------------------------

test('describeFacturaDownloadError: 404 usa el mensaje exacto de no encontrado', () => {
  assert.equal(
    describeFacturaDownloadError(404, null),
    'No encontramos ninguna reserva que coincida con el código y apellido ingresados. Por favor verifique sus datos.',
  );
});

test('describeFacturaDownloadError: 409 usa el mensaje honesto del servidor', () => {
  assert.equal(
    describeFacturaDownloadError(409, 'La factura no está disponible hasta que el pago de la reserva sea aprobado'),
    'La factura no está disponible hasta que el pago de la reserva sea aprobado',
  );
  assert.equal(
    describeFacturaDownloadError(409, 'La factura no está disponible para esta reserva'),
    'La factura no está disponible para esta reserva',
  );
  // Sin mensaje del servidor cae al generico.
  assert.equal(
    describeFacturaDownloadError(409, null),
    'No pudimos generar la factura en PDF. Intente nuevamente en unos instantes.',
  );
});

test('describeFacturaDownloadError: demas fallos son genericos, sin filtrar internals', () => {
  const generic = 'No pudimos generar la factura en PDF. Intente nuevamente en unos instantes.';
  for (const status of [400, 422, 500]) {
    assert.equal(describeFacturaDownloadError(status, null), generic);
    assert.equal(describeFacturaDownloadError(status, 'Error: SELECT * FROM payments'), generic);
  }
  for (const status of [400, 404, 409, 422, 500]) {
    const message = describeFacturaDownloadError(
      status,
      status === 409
        ? 'La factura no está disponible para esta reserva'
        : 'Error: SELECT * FROM payments',
    );
    assert.doesNotMatch(message, /SELECT|Error:|at \w+\./);
  }
});
