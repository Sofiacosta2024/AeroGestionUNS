import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTravelDocuments } from '../src/lib/travel-documents';
import type { BookingWithRelations } from '../src/lib/bookings';

type SeatInput = { rowNumber: number; columnLetter: string; cabinClass: string } | null;
type PassengerInput = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  seat: SeatInput;
};

/** Reserva mínima con lo que consumen los documentos de viaje. */
function makeBooking(options: {
  totalAmount?: number;
  cabinClass?: 'ECONOMY' | 'PREMIUM' | 'BUSINESS' | 'FIRST';
  seatSelection?: boolean;
  passengers?: PassengerInput[];
} = {}) {
  const departure = new Date('2026-11-18T09:30:00.000Z');
  const arrival = new Date('2026-11-18T11:10:00.000Z');
  return {
    bookingCode: 'AG-7F3K9Q',
    currency: 'ARS',
    cabinClass: options.cabinClass ?? 'ECONOMY',
    totalAmount: options.totalAmount ?? 165400,
    flights: [
      {
        price: 82700,
        departureAt: departure,
        fare: { seatSelection: options.seatSelection ?? false },
        flight: {
          code: 'AG-1420',
          departureAt: departure,
          arrivalAt: arrival,
          route: {
            originAirport: { iataCode: 'BHI', city: 'Bahía Blanca' },
            destinationAirport: { iataCode: 'AEP', city: 'Buenos Aires' },
          },
        },
      },
    ],
    passengers: options.passengers ?? [
      {
        firstName: 'Manuel',
        lastName: 'Tina',
        documentType: 'DNI',
        documentNumber: '30111222',
        seat: { rowNumber: 12, columnLetter: 'A', cabinClass: 'ECONOMY' },
      },
      {
        firstName: 'Catalina',
        lastName: 'Dumrauf',
        documentType: 'DNI',
        documentNumber: '33444555',
        seat: { rowNumber: 12, columnLetter: 'B', cabinClass: 'ECONOMY' },
      },
    ],
    payments: [
      { id: 'pay_1', status: 'APPROVED', amount: 165400, transactionRef: 'MOCK-777' },
    ],
  } as unknown as BookingWithRelations;
}

test('mapea la clase de cabina a las etiquetas del pasaje', () => {
  const labels: Record<string, string> = {
    ECONOMY: 'Economy',
    PREMIUM: 'Economy Premium',
    FIRST: 'Primera Clase',
    BUSINESS: 'Primera Clase',
  };
  for (const [cabin, label] of Object.entries(labels)) {
    const booking = makeBooking({
      passengers: [
        {
          firstName: 'Test',
          lastName: 'Pasajero',
          documentType: 'DNI',
          documentNumber: '30000000',
          seat: { rowNumber: 3, columnLetter: 'C', cabinClass: cabin },
        },
      ],
    });
    assert.equal(toTravelDocuments(booking).passes[0]?.cabinClass, label);
  }
});

test('genera un pasaje por pasajero con documento, asiento y vuelo', () => {
  const { passes } = toTravelDocuments(makeBooking());
  assert.equal(passes.length, 2);
  const first = passes[0]!;
  assert.equal(first.bookingCode, 'AG-7F3K9Q');
  assert.equal(first.passengerName, 'Manuel Tina');
  assert.equal(first.documentNumber, '30111222');
  assert.equal(first.seat, '12A');
  assert.equal(first.flightCode, 'AG-1420');
  assert.equal(first.origin, 'BHI · Bahía Blanca');
  assert.equal(first.destination, 'AEP · Buenos Aires');
  assert.equal(first.departureAt, '2026-11-18T09:30:00.000Z');
});

test('el desglose de la factura suma exactamente el total abonado', () => {
  const { invoice } = toTravelDocuments(makeBooking({ totalAmount: 165400 }));
  const sum = invoice.lines.reduce((acc, line) => acc + line.amount, 0);
  assert.equal(sum, invoice.total);
  assert.equal(invoice.total, 165400);
  const taxes = invoice.lines.find((l) => l.label.startsWith('Impuestos'))!;
  assert.equal(taxes.amount, Math.round((165400 * 21) / 121));
  const base = invoice.lines.find((l) => l.label === 'Tarifa base')!;
  assert.equal(base.amount, 165400 - taxes.amount);
});

test('la factura toma el DNI del primer pasajero y emite comprobante B', () => {
  const { invoice } = toTravelDocuments(makeBooking());
  assert.equal(invoice.buyerDocumentType, 'DNI');
  assert.equal(invoice.buyerDocumentNumber, '30111222');
  assert.equal(invoice.voucherType, 'B');
  assert.equal(invoice.reference, 'MOCK-777');
});

test('incluye el cargo por elección de asiento Economy solo si hay asiento Economy', () => {
  const withEconomy = toTravelDocuments(makeBooking()).invoice;
  assert.ok(
    withEconomy.lines.some((l) => l.label.includes('asiento')),
    'esperaba la línea de cargo de asiento',
  );

  const withoutSeat = toTravelDocuments(
    makeBooking({
      passengers: [
        {
          firstName: 'Sin',
          lastName: 'Asiento',
          documentType: 'DNI',
          documentNumber: '31111111',
          seat: null,
        },
      ],
    }),
  ).invoice;
  assert.ok(
    !withoutSeat.lines.some((l) => l.label.includes('asiento')),
    'no esperaba cargo de asiento sin asiento asignado',
  );
});
