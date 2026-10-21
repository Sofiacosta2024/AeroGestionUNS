import type { BookingForDocuments } from './bookings';
import { commercialCabin } from './cabin';

/**
 * Documentos de viaje que se descargan desde /confirmación/[code]:
 * el pasaje individual de cada pasajero y la factura simulada del comprador.
 *
 * Es lógica pura: recibe la reserva con sus relaciones y devuelve datos
 * serializables (sin Decimal ni Date) listos para el cliente.
 */

/** Única clase de comprobante que emite el sistema demo (consumidor final). */
export const VOUCHER_TYPE: 'B' | 'C' = 'B';

/** IVA incluido en los precios mostrados. */
const IVA_RATE = 0.21;

/** Etiquetas de clase que exige el pasaje. */
const CABIN_LABELS: Record<string, string> = {
  ECONOMY: 'Economy',
  PREMIUM: 'Economy Premium',
  // El modelo no distingue Business: se informa dentro de la clase alta.
  BUSINESS: 'Primera Clase',
  FIRST: 'Primera Clase',
};

export type AirportRef = { code: string; city: string };

export type TravelPass = {
  bookingCode: string;
  passengerName: string;
  documentType: string;
  documentNumber: string;
  seat: string;
  cabinClass: string;
  flightCode: string;
  origin: AirportRef;
  destination: AirportRef;
  departureAt: string;
  arrivalAt: string;
};

export type InvoiceLine = { label: string; amount: number };

export type InvoiceDocument = {
  buyerName: string;
  buyerDocumentType: string;
  buyerDocumentNumber: string;
  voucherType: 'B' | 'C';
  reference: string;
  currency: string;
  lines: InvoiceLine[];
  total: number;
};

export type TravelDocuments = {
  bookingCode: string;
  currency: string;
  passes: TravelPass[];
  invoice: InvoiceDocument;
};

export function toTravelDocuments(booking: BookingForDocuments): TravelDocuments {
  const currency = booking.currency;
  const flights = [...booking.flights].sort(
    (a, b) => +a.departureAt - +b.departureAt,
  );

  const passes: TravelPass[] = flights.flatMap(({ flight, fare }) =>
    booking.passengers.map((p) => ({
      bookingCode: booking.bookingCode,
      passengerName: `${p.firstName} ${p.lastName}`.trim(),
      documentType: p.documentType,
      documentNumber: p.documentNumber,
      seat: p.seat ? `${p.seat.rowNumber}${p.seat.columnLetter}` : 'Sin asignar',
      cabinClass: cabinLabel(fare?.cabinClass ? commercialCabin(fare) : (p.seat?.cabinClass ?? booking.cabinClass)),
      flightCode: flight.code,
      origin: {
        code: flight.route.originAirport.iataCode,
        city: flight.route.originAirport.city,
      },
      destination: {
        code: flight.route.destinationAirport.iataCode,
        city: flight.route.destinationAirport.city,
      },
      departureAt: flight.departureAt.toISOString(),
      arrivalAt: flight.arrivalAt.toISOString(),
    })),
  );

  const total = Number(booking.totalAmount);
  const taxes = Math.round((total * IVA_RATE) / (1 + IVA_RATE));
  const seatSelectionGross = booking.flights.reduce((sum, f) => sum + Number(f.seatSelectionAmount ?? 0), 0);
  const seatSelectionNet = Math.round((seatSelectionGross / (1 + IVA_RATE)) * 100) / 100;
  const base = Math.round((total - taxes - seatSelectionNet) * 100) / 100;
  const payment = booking.payments.find((p) => p.status === 'APPROVED');
  const buyer = booking.passengers[0];
  const lines: InvoiceLine[] = [{ label: 'Tarifa base', amount: base }];
  if (seatSelectionGross > 0)
    lines.push({ label: 'Cargo por elección de asiento (Economy)', amount: seatSelectionNet });
  lines.push({ label: 'Impuestos (IVA 21%)', amount: taxes });

  const invoice: InvoiceDocument = {
    buyerName: buyer ? `${buyer.firstName} ${buyer.lastName}`.trim() : 'Consumidor final',
    buyerDocumentType: buyer?.documentType ?? 'DNI',
    buyerDocumentNumber: buyer?.documentNumber ?? '-',
    voucherType: VOUCHER_TYPE,
    reference: payment?.transactionRef ?? payment?.id ?? booking.bookingCode,
    currency,
    lines,
    total,
  };

  return { bookingCode: booking.bookingCode, currency, passes, invoice };
}

function cabinLabel(cabinClass: string): string {
  return CABIN_LABELS[cabinClass] ?? 'Economy';
}
