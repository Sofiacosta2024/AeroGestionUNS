import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SeatFeesForm from '../../src/app/admin/tarifas/seat-fees-form';

test('admin muestra un campo y guardado por tarifa, incluidos cero y centavos', () => {
  const html = renderToStaticMarkup(createElement(SeatFeesForm, { fares: [
    { id: 'e', code: 'ECON', name: 'Economy', cabinClass: 'ECONOMY', isActive: true, seatSelectionFee: 3500.5 },
    { id: 'e0', code: 'ECON-ZERO', name: 'Economy sin cargo', cabinClass: 'ECONOMY', isActive: true, seatSelectionFee: 0 },
    { id: 'p', code: 'ECON-FLEX', name: 'Economy Premium', cabinClass: 'ECONOMY', isActive: false, seatSelectionFee: 0 },
  ] }));
  assert.match(html, /for="seat-fee-e"/); assert.match(html, /value="3.500,5"/);
  assert.match(html, /id="seat-fee-e0"[^>]*value="0"/); assert.match(html, /Inactiva/);
  assert.doesNotMatch(html, /id="seat-fee-p"/); assert.match(html, /Elección de asiento incluida, sin adicional/);
  assert.equal((html.match(/>Guardar<\/button>/g) ?? []).length, 2);
});
