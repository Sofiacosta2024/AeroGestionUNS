import assert from 'node:assert/strict';
import test from 'node:test';
import { flightSearchQuery, flightScheduleSchema, singleFlightSchema } from '../src/lib/validation';
import { localTimeUtc } from '../src/lib/dates';
import { expandOperatingDates, localDateTimeToUtc } from '../src/lib/scheduling/calendar';
import { validateClassOffers } from '../src/lib/scheduling/capacity';
import { findAircraftOverlaps } from '../src/lib/scheduling/conflicts';
import { lastSchedulableDate } from '../src/lib/scheduling/config';
import { assertSchedulableRange } from '../src/lib/scheduling/service';

const id = 'c1234567890123456789012345';
const flight = {
  routeId: id, aircraftId: id, date: '2026-10-07', departureTime: '06:45',
  fares: [{ fareId: id, price: 64000, seats: 10 }],
};

test('el buscador conserva pasajeros, disponibilidad y franja horaria junto al alta RF-01', () => {
  const query = flightSearchQuery.parse({ passengers: '3', available: 'true', timeFrom: '06:45', timeTo: '23:59' });
  assert.equal(query.passengers, 3);
  assert.equal(query.available, true);
  assert.equal(query.timeFrom, '06:45');
  assert.equal(singleFlightSchema.safeParse(flight).success, true);
  assert.equal(flightSearchQuery.safeParse({ timeFrom: '24:00' }).success, false);
  assert.equal(singleFlightSchema.safeParse({ ...flight, date: '2026-02-31' }).success, false);
  assert.equal(singleFlightSchema.safeParse({ ...flight, fares: [] }).success, false);
});

test('cronogramas validan vigencia y ambos modulos usan la misma hora argentina', () => {
  const schedule = { ...flight, validFrom: flight.date, validTo: '2026-10-14', weekdays: [3, 3] };
  assert.deepEqual(flightScheduleSchema.parse(schedule).weekdays, [3]);
  assert.equal(flightScheduleSchema.safeParse({ ...schedule, validTo: '2026-10-06' }).success, false);
  // El schema valida forma/orden; el horizonte relativo al reloj lo aplica el servicio.
  assert.equal(lastSchedulableDate('2026-10-07'), '2027-10-07');
  assert.equal(lastSchedulableDate('2024-02-29'), '2025-02-28');
  assert.throws(() => assertSchedulableRange({ validFrom: '2026-10-07', validTo: '2027-10-08' }, new Date('2026-10-07T12:00:00Z')));
  assert.doesNotThrow(() => assertSchedulableRange({ validFrom: '2026-10-07', validTo: '2027-10-07' }, new Date('2026-10-07T12:00:00Z')));
  assert.deepEqual(expandOperatingDates(schedule.validFrom, schedule.validTo, [3]), ['2026-10-07', '2026-10-14']);
  assert.equal(localDateTimeToUtc(flight.date, flight.departureTime).toISOString(), '2026-10-07T09:45:00.000Z');
  assert.equal(localTimeUtc(flight.date, flight.departureTime).getTime(), localDateTimeToUtc(flight.date, flight.departureTime).getTime());
});

test('Economy y Premium comparten capacidad; la rotacion respeta el limite exacto', () => {
  const classes = [
    { id: 'basic', name: 'Economy', cabinClass: 'ECONOMY' as const },
    { id: 'flex', name: 'Premium', cabinClass: 'ECONOMY' as const },
  ];
  const offers = [{ fareId: 'basic', price: 10, seats: 30 }, { fareId: 'flex', price: 20, seats: 70 }];
  assert.deepEqual(validateClassOffers(offers, classes, { ECONOMY: 100 }), []);
  assert.equal(validateClassOffers(offers, classes, { ECONOMY: 99 }).length, 1);
  const existing = [{ code: 'AG-1001', departureAt: new Date('2026-10-07T09:00Z'), arrivalAt: new Date('2026-10-07T10:00Z') }];
  const planned = [{ date: flight.date, departureAt: new Date('2026-10-07T12:00Z'), arrivalAt: new Date('2026-10-07T13:00Z') }];
  assert.deepEqual(findAircraftOverlaps(planned, existing, 120), []);
  assert.equal(findAircraftOverlaps(planned, existing, 121).length, 1);
});
