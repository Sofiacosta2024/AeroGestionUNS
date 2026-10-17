import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingStatusPresentation,
  cabinClassLabel,
  flightRouteLabel,
  flightSchedule,
  passengerDocumentLabel,
  passengerName,
  passengerSeatAria,
  passengerSeatLabel,
} from '../../src/lib/public-booking-view';

// ---------------------------------------------------------------------------
// Estado de compra
// ---------------------------------------------------------------------------

test('estado conocido: etiqueta y tono de la historia', () => {
  assert.deepEqual(bookingStatusPresentation('CONFIRMED'), {
    label: 'Compra confirmada',
    tone: 'ok',
  });
  assert.equal(bookingStatusPresentation('CANCELLED').tone, 'bad');
  assert.equal(bookingStatusPresentation('PENDING').tone, 'warn');
});

test('estado conocido: ignora mayusculas y espacios', () => {
  assert.equal(bookingStatusPresentation('  confirmed ').label, 'Compra confirmada');
});

test('estado desconocido: muestra el valor crudo sin romper', () => {
  assert.deepEqual(bookingStatusPresentation('WEIRD_STATE'), {
    label: 'WEIRD_STATE',
    tone: 'info',
  });
});

test('estado ausente o vacio: etiqueta neutra', () => {
  assert.deepEqual(bookingStatusPresentation(null), { label: 'Estado no disponible', tone: 'info' });
  assert.deepEqual(bookingStatusPresentation(undefined), {
    label: 'Estado no disponible',
    tone: 'info',
  });
  assert.deepEqual(bookingStatusPresentation('   '), {
    label: 'Estado no disponible',
    tone: 'info',
  });
});

// ---------------------------------------------------------------------------
// Clase de cabina
// ---------------------------------------------------------------------------

test('clase de cabina conocida y desconocida', () => {
  assert.equal(cabinClassLabel('ECONOMY'), 'Economy');
  assert.equal(cabinClassLabel('business'), 'Business');
  assert.equal(cabinClassLabel('PREMIUM_ECONOMY'), 'PREMIUM_ECONOMY');
});

test('clase de cabina ausente: guion', () => {
  assert.equal(cabinClassLabel(null), '—');
  assert.equal(cabinClassLabel(undefined), '—');
  assert.equal(cabinClassLabel('  '), '—');
});

// ---------------------------------------------------------------------------
// Asiento
// ---------------------------------------------------------------------------

test('asiento asignado: etiqueta y aria', () => {
  assert.equal(passengerSeatLabel('12A'), '12A');
  assert.equal(passengerSeatLabel(' 12A '), '12A');
  assert.equal(passengerSeatAria('12A'), 'Asiento 12A');
});

test('asiento ausente: se indica que se asigna luego', () => {
  assert.equal(passengerSeatLabel(null), 'A asignar');
  assert.equal(passengerSeatLabel(undefined), 'A asignar');
  assert.equal(passengerSeatLabel(''), 'A asignar');
  assert.equal(passengerSeatAria(null), 'Asiento sin asignar');
});

// ---------------------------------------------------------------------------
// Documento (enmascarado por el backend)
// ---------------------------------------------------------------------------

test('documento enmascarado: tipo + numero', () => {
  assert.equal(passengerDocumentLabel('DNI', '*****678'), 'DNI *****678');
});

test('documento sin tipo: solo el numero', () => {
  assert.equal(passengerDocumentLabel(null, '*****678'), '*****678');
  assert.equal(passengerDocumentLabel('', '*****678'), '*****678');
});

test('documento ausente: null (la celda se omite, no se inventa)', () => {
  assert.equal(passengerDocumentLabel('DNI', null), null);
  assert.equal(passengerDocumentLabel('DNI', undefined), null);
  assert.equal(passengerDocumentLabel('DNI', '   '), null);
});

// ---------------------------------------------------------------------------
// Horarios (campos opcionales)
// ---------------------------------------------------------------------------

test('horario completo: fecha y rango de horas', () => {
  const schedule = flightSchedule('2025-11-18T09:45:00.000Z', '2025-11-18T10:55:00.000Z');
  assert.equal(schedule.time, '06:45 → 07:55');
  assert.match(schedule.date, /18/);
  assert.match(schedule.date, /nov/i);
  assert.equal(schedule.complete, true);
});

test('solo salida: muestra la partida y marca incompleto', () => {
  const schedule = flightSchedule('2025-11-18T09:45:00.000Z', null);
  assert.equal(schedule.time, '06:45');
  assert.equal(schedule.complete, false);
});

test('solo llegada: muestra la llegada y marca incompleto', () => {
  const schedule = flightSchedule(null, '2025-11-18T10:55:00.000Z');
  assert.equal(schedule.time, 'Llegada 07:55');
  assert.equal(schedule.complete, false);
});

test('sin horarios: no lanza y avisa que falta confirmar', () => {
  const schedule = flightSchedule(null, undefined);
  assert.equal(schedule.date, 'Fecha a confirmar');
  assert.equal(schedule.time, 'Horario a confirmar');
  assert.equal(schedule.complete, false);
});

test('fechas invalidas: se tratan como ausentes (no lanza RangeError)', () => {
  const schedule = flightSchedule('no-es-fecha', '');
  assert.equal(schedule.date, 'Fecha a confirmar');
  assert.equal(schedule.time, 'Horario a confirmar');
  assert.equal(schedule.complete, false);
});

test('una fecha valida y otra invalida: usa la valida', () => {
  const schedule = flightSchedule('2025-11-18T09:45:00.000Z', 'invalida');
  assert.equal(schedule.time, '06:45');
  assert.equal(schedule.complete, false);
});

// ---------------------------------------------------------------------------
// Ruta del vuelo
// ---------------------------------------------------------------------------

test('ruta completa: codigo y aeropuertos', () => {
  const label = flightRouteLabel({
    flightCode: 'AG-1420',
    origin: { iataCode: 'BHI' },
    destination: { iataCode: 'AEP' },
  });
  assert.equal(label, 'AG-1420 · BHI → AEP');
});

test('ruta con campos faltantes: no lanza', () => {
  assert.equal(flightRouteLabel({}), 'Vuelo · — → —');
  assert.equal(
    flightRouteLabel({ flightCode: 'AG-1', origin: null, destination: { iataCode: '' } }),
    'AG-1 · — → —',
  );
});

// ---------------------------------------------------------------------------
// Nombre del pasajero
// ---------------------------------------------------------------------------

test('nombre completo del pasajero', () => {
  assert.equal(passengerName('Lucía', 'Gómez'), 'Lucía Gómez');
  assert.equal(passengerName('Lucía', null), 'Lucía');
  assert.equal(passengerName(null, 'Gómez'), 'Gómez');
  assert.equal(passengerName('  ', '  '), '');
});
