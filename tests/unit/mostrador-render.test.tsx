import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlightResults } from '../../src/components/mostrador/flight-results';
import CounterSaleClient from '../../src/app/mostrador/venta-client';
import { PassengerFields } from '../../src/components/mostrador/passenger-fields';
test('terminal presenta datos, cobro presencial y emisión inicialmente deshabilitada', () => {
  const html = renderToStaticMarkup(createElement(CounterSaleClient));
  for (const label of ['Nombre', 'Apellido', 'DNI', 'Email', 'Teléfono', 'Efectivo', 'Tarjeta de crédito', 'Tarjeta de débito', 'Emitir Pasaje en Mostrador']) assert.ok(html.includes(label));
  assert.match(html, /disabled=""[^>]*>Emitir Pasaje en Mostrador/);
});
test('grilla separa Premium de Economy aunque compartan cabina física y muestra agotado', () => {
  const html = renderToStaticMarkup(createElement(FlightResults, { passengersCount: 1, selected: null, disabled: false, onSelect: () => {},
    flights: [{ id: 'f', code: 'AG-1420', departureAt: '2027-01-01T10:00Z', arrivalAt: '2027-01-01T11:00Z', prices: [
      { id: 'e', code: 'ECON-BASIC', name: 'Economy', cabinClass: 'ECONOMY', price: 100, availableSeats: 0, currency: 'ARS', seatSelectionFee: 20 },
      { id: 'p', code: 'ECON-FLEX', name: 'Economy Premium', cabinClass: 'ECONOMY', price: 150, availableSeats: 2, currency: 'ARS', seatSelectionFee: 0 },
    ] }] }));
  assert.match(html, /Agotado/); assert.match(html, /2 libres/); assert.match(html, /title="Economy Premium"/);
});

test('cada error se renderiza debajo de su campo y se asocia para lectores de pantalla', () => {
  const html = renderToStaticMarkup(createElement(PassengerFields, { disabled: false, onChange: () => {},
    passengers: [{ firstName: 'Ana', lastName: 'Pérez', documentNumber: '12345678' }, { firstName: '', lastName: 'Gómez', documentNumber: '123' }],
    errors: { 'passengers.1.firstName': 'Ingresá el nombre.', 'passengers.1.documentNumber': 'El DNI debe tener 7 u 8 dígitos.' },
  }));
  assert.match(html, /id="counter-passenger-1-firstName"[^>]*aria-invalid="true"[^>]*aria-describedby="counter-passenger-1-firstName-error"[^>]*\/><p id="counter-passenger-1-firstName-error"[^>]*>Ingresá el nombre\./);
  assert.match(html, /id="counter-passenger-1-documentNumber"[^>]*aria-describedby="counter-passenger-1-documentNumber-error"[^>]*\/><p id="counter-passenger-1-documentNumber-error"/);
  assert.doesNotMatch(html, /counter-passenger-0-firstName-error/);
});
