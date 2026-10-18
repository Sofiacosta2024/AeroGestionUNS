import { formatArs, formatFullDate } from './format';
import { bookingStatusPresentation, cabinClassLabel } from './public-booking-view';
import { assemblePdfLines, type Line } from './pasaje-pdf';

/**
 * Generador de la factura (comprobante de pago) en PDF (US-14A).
 *
 * Reutiliza el motor de PDF del pasaje (`assemblePdfLines`): la unica fuente
 * de verdad del documento es el pago APPROVED real de la reserva. El sistema
 * no tiene un numero de comprobante fiscal, por lo que el documento nunca
 * inventa uno ni afirma emision tributaria: refleja el pago aprobado y lo
 * aclara en el pie. Los datos salen de la vista publica (sin PII completa)
 * y de los campos no sensibles del pago (sin tarjetas; la referencia del
 * gateway se muestra enmascarada).
 */

/** Fechas: strings ISO (cliente) o Date (servidor). */
type DateLike = Date | string | null | undefined;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Tarjeta de credito',
  DEBIT_CARD: 'Tarjeta de debito',
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  WALLET: 'Billetera virtual',
};

function paymentMethodLabel(value: string): string {
  return PAYMENT_METHOD_LABELS[value] ?? value;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Pago aprobado',
};

function paymentStatusLabel(value: string): string {
  return PAYMENT_STATUS_LABELS[value] ?? value;
}

function toIso(value: DateLike): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

/**
 * Enmascara la referencia del gateway dejando visibles solo los ultimos 4
 * caracteres (mismo criterio prudente que el documento del pasaje).
 */
export function maskedTransactionRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.length <= 4) return '****';
  return `****${ref.slice(-4)}`;
}

export type FacturaInput = {
  bookingCode: string;
  status: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  payment: {
    method: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: DateLike;
    installments: number | null;
    transactionRef: string | null;
  };
};

function buildFacturaLines(input: FacturaInput): Line[] {
  const lines: Line[] = [];

  lines.push({ text: 'Factura de la reserva', bold: true, size: 18 });
  lines.push({
    text: 'AeroGestionUNS - Comprobante de pago aprobado',
    size: 9,
    gray: true,
    gapBefore: 2,
  });

  lines.push({ text: 'Reserva', bold: true, size: 12, gapBefore: 16 });
  lines.push({ text: `Codigo: ${input.bookingCode}`, gapBefore: 4 });
  lines.push({ text: `Estado: ${bookingStatusPresentation(input.status).label}` });
  lines.push({ text: `Clase: ${cabinClassLabel(input.cabinClass)}` });
  lines.push({ text: `Pasajeros: ${input.passengersCount}` });
  lines.push({ text: `Total de la reserva: ${formatArs(input.totalAmount)} ${input.currency}` });

  lines.push({ text: 'Pago', bold: true, size: 12, gapBefore: 16 });
  lines.push({ text: `Estado del pago: ${paymentStatusLabel(input.payment.status)}`, gapBefore: 4 });
  lines.push({ text: `Metodo: ${paymentMethodLabel(input.payment.method)}` });
  lines.push({ text: `Importe pagado: ${formatArs(input.payment.amount)} ${input.payment.currency}` });
  const paidAt = toIso(input.payment.paidAt);
  if (paidAt) {
    lines.push({ text: `Fecha de pago: ${formatFullDate(paidAt)}` });
  }
  if (typeof input.payment.installments === 'number' && input.payment.installments > 1) {
    lines.push({ text: `Cuotas: ${input.payment.installments}` });
  }
  const transactionRef = maskedTransactionRef(input.payment.transactionRef);
  if (transactionRef) {
    lines.push({ text: `Referencia: ${transactionRef}` });
  }

  lines.push({
    text: 'Documento informativo generado desde la consulta publica de reservas.',
    size: 8,
    gray: true,
    gapBefore: 20,
  });
  lines.push({
    text: 'Refleja el pago aprobado de la reserva; no reemplaza el comprobante fiscal.',
    size: 8,
    gray: true,
  });

  return lines;
}

export function buildFacturaPdf(input: FacturaInput): Uint8Array {
  return assemblePdfLines(buildFacturaLines(input));
}
