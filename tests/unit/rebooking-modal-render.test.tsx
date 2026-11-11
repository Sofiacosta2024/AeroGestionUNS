import { createElement } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RebookingModal } from '../../src/app/reserva/consulta-client';

/**
 * US-14B v2.0: el modal debe seguir el WF-14B / WF-14B-E.
 */

const passengers = [
  {
    firstName: 'Lucía',
    lastName: 'Gómez',
    documentType: 'DNI',
    documentNumber: '*****804',
    seatNumber: '12A',
    checkInStatus: 'OPEN',
  },
];

const flights = [
  {
    id: 'flight-1',
    code: 'AG-1436',
    departureAt: '2026-11-20T19:15:00.000Z',
    arrivalAt: '2026-11-20T20:25:00.000Z',
    origin: { iataCode: 'BHI', city: 'Bahía Blanca' },
    destination: { iataCode: 'AEP', city: 'Buenos Aires' },
    fares: [
      { id: 'fare-1', name: 'Economy', cabinClass: 'ECONOMY', price: 100, seatsAvailable: 52 },
    ],
    availableSeats: [
      { id: 'seat-23a', label: '23A' },
      { id: 'seat-10k', label: '10K' },
    ],
  },
];

const baseProps = {
  cabin: 'Economy',
  date: '2026-11-20',
  error: null,
  flights,
  loading: false,
  onCancel: () => undefined,
  onConfirm: () => undefined,
  onDateChange: () => undefined,
  onSearch: () => undefined,
  onSelect: () => undefined,
  onSeatChange: () => undefined,
  passengers,
  passengerCount: 1,
  preservedSeat: false,
  selected: 'flight-1:fare-1',
  selectedSeatIds: [],
  route: 'BHI → AEP',
};

const render = (overrides: Partial<Parameters<typeof RebookingModal>[0]> = {}) =>
  renderToStaticMarkup(createElement(RebookingModal, { ...baseProps, ...overrides }));

test('WF-14B: muestra fecha, clase contratada fija y columnas de la grilla', () => {
  const html = render();

  assert.match(html, /Solo se muestran vuelos con cupo en tu clase contratada/);
  assert.match(html, /Nueva fecha/);
  assert.match(html, /Clase contratada \(fija\)/);
  assert.match(html, /Vuelo/);
  assert.match(html, /Salida/);
  assert.match(html, /Llegada/);
  assert.match(html, /Economy libres/);
  assert.match(html, /AG-1436/);
  assert.match(html, /52/);
});

test('WF-14B: con adicional abonado muestra el aviso y los asientos disponibles', () => {
  const html = render({ preservedSeat: true, selectedSeatIds: ['seat-23a'] });

  assert.match(html, /Adicional de asiento ya abonado/);
  assert.match(html, /sin costo extra/);
  assert.match(html, /23A/);
  assert.match(html, /10K/);
});

test('WF-14B: sin adicional abonado no muestra el bloque de asientos', () => {
  const html = render({ preservedSeat: false });

  assert.doesNotMatch(html, /Adicional de asiento ya abonado/);
});

test('WF-14B: el boton de confirmacion usa el texto del wireframe', () => {
  assert.match(render(), /Confirmar Cambio de Vuelo/);
});

test('WF-14B-E: el error se muestra como alerta antes del pie del modal', () => {
  const message =
    'El vuelo seleccionado acaba de agotar sus ubicaciones disponibles. Por favor elija otra alternativa.';
  const html = render({ error: message });

  assert.match(html, /role="alert"/);
  assert.ok(html.includes(message));
  assert.ok(
    html.indexOf(message) < html.indexOf('Confirmar Cambio de Vuelo'),
    'la alerta debe aparecer antes del boton de confirmacion',
  );
});
