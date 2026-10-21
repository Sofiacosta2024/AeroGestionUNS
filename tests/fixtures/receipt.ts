import type { ReceiptSnapshot } from '../../src/lib/email/types';
export function sampleReceipt(): ReceiptSnapshot {
  return { version: 1, recipient: 'lucia@example.com', greetingName: 'Lucía', displayCode: 'ABC234', purchasedAt: '2026-10-20T23:00:00.000Z',
    documents: { bookingCode: 'AG-ABC234', currency: 'ARS', passes: [{ bookingCode: 'AG-ABC234', passengerName: 'Lucía Gómez', documentType: 'DNI', documentNumber: '39112804',
      seat: '12A', cabinClass: 'Economy', flightCode: 'AG-1420', origin: { code: 'BHI', city: 'Bahía Blanca' }, destination: { code: 'AEP', city: 'Buenos Aires' },
      departureAt: '2027-01-01T09:45:00.000Z', arrivalAt: '2027-01-01T10:55:00.000Z' }],
      invoice: { buyerName: 'Lucía Gómez', buyerDocumentType: 'DNI', buyerDocumentNumber: '39112804', voucherType: 'B', reference: 'COUNTER-test', currency: 'ARS',
        lines: [{ label: 'Tarifa base', amount: 100 }], total: 100 } } };
}
