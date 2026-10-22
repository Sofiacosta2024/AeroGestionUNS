import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSeatAdditionalPrice, type FareInfo } from '../src/app/vuelos/[id]/asientos/asientos-client';
import { quoteCounterSale } from '../src/lib/mostrador/service';
import type { FlightSeatView } from '../src/lib/seat-locks';
import type { AuthUser } from '../src/lib/auth';
import { fareUpdateSchema, lockSeatsSchema } from '../src/lib/validation';
import { toPublicBookingView, type PublicBookingRecord } from '../src/lib/public-booking';

test('web y mostrador sólo cobran el adicional en Economy, sin diferencias por fila', async () => {
  for (const [cabinClass, code] of [['ECONOMY', 'ECON-BASIC'], ['ECONOMY', 'ECON-FLEX'], ['PREMIUM', 'PREM'], ['FIRST', 'FIRST']] as const) {
    const fare: FareInfo = { id: 'fare', code, name: cabinClass, cabinClass, seatSelectionFee: 3500.5, seatSelection: true, price: 10000, currency: 'ARS' };
    const charged = cabinClass === 'ECONOMY' && code !== 'ECON-FLEX';
    for (const rowNumber of [3, 12, 14]) assert.equal(getSeatAdditionalPrice({ rowNumber, columnLetter: 'A' } as FlightSeatView, fare).price, charged ? 3500.5 : 0);
    const db = { flightFare: { findUnique: async () => ({ price: 10000, currency: 'ARS', availableSeats: 9,
      fare: { ...fare, isActive: true }, flight: { status: 'SCHEDULED', departureAt: new Date(Date.now() + 86400000), aircraftId: 'aircraft' } }) } };
    const quote = await quoteCounterSale({ flightId: 'flight', fareId: 'fare', passengersCount: 2, seatMode: 'MANUAL' }, { role: 'MOSTRADOR' } as AuthUser, db as never);
    assert.equal(quote.seatSelectionAmount, charged ? '7001.00' : '0.00'); assert.equal(quote.totalAmount, charged ? '27001.00' : '20000.00');
    const automatic = await quoteCounterSale({ flightId: 'flight', fareId: 'fare', passengersCount: 2, seatMode: 'AUTO' }, { role: 'MOSTRADOR' } as AuthUser, db as never);
    assert.equal(automatic.totalAmount, '20000.00');
    assert.equal(getSeatAdditionalPrice({ rowNumber: 3 } as FlightSeatView, { ...fare, seatSelectionFee: 0 }).isIncluded, true);
  }
});

test('el administrador puede fijar cero o centavos; rechaza importes inválidos', () => {
  for (const seatSelectionFee of [0, 3500.5, 9999999999.99]) assert.equal(fareUpdateSchema.safeParse({ seatSelectionFee }).success, true);
  for (const seatSelectionFee of [-1, 1.001, Infinity, 'inválido', 10000000000]) assert.equal(fareUpdateSchema.safeParse({ seatSelectionFee }).success, false);
});

test('el canal web no permite que el cliente eluda el adicional con seatMode AUTO', () => {
  const result = lockSeatsSchema.parse({ fareId: 'c123456789012345678901234', seatIds: ['c123456789012345678901235'], contactEmail: 'web@example.com', seatMode: 'AUTO' });
  assert.equal('seatMode' in result, false);
});

test('la consulta conserva el derecho de selección de la compra aunque cambie el catálogo', () => {
  const airport = { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Comandante Espora', country: 'AR' };
  const booking = { bookingCode: 'AG-TEST12', totalAmount: 100, passengers: [], flights: [{ price: 100,
    seatSelectionIncluded: false, fare: { name: 'Premium', cabinClass: 'ECONOMY', seatSelection: true },
    flight: { route: { originAirport: airport, destinationAirport: airport } },
  }] } as unknown as PublicBookingRecord;
  assert.equal(toPublicBookingView(booking).flights[0]!.fare.seatSelection, false);
  booking.flights[0]!.seatSelectionIncluded = true; booking.flights[0]!.fare.seatSelection = false;
  assert.equal(toPublicBookingView(booking).flights[0]!.fare.seatSelection, true);
});
