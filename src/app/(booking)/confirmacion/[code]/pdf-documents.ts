import { jsPDF } from 'jspdf';
import { formatArs, formatFullDate, formatTime } from '@/lib/format';
import type {
  InvoiceDocument,
  TravelDocuments,
  TravelPass,
} from '@/lib/travel-documents';

/**
 * Armado de los PDF de la confirmación con jsPDF (texto vectorial).
 * Se importa de forma dinámica desde el botón para no cargarlo en el bundle inicial.
 */

const MARGIN = 18;
const PAGE_WIDTH = 210;
const RIGHT = PAGE_WIDTH - MARGIN;
const BRAND: [number, number, number] = [23, 0, 64];
const ACCENT: [number, number, number] = [255, 81, 121];
const MUTED: [number, number, number] = [110, 110, 130];

function newDoc(): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

function drawHeader(doc: jsPDF, subtitle: string): number {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_WIDTH, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('AeroGestión UNS', MARGIN, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, RIGHT, 14, { align: 'right' });
  doc.setTextColor(...BRAND);
  return 34;
}

/** Fila etiqueta / valor; devuelve la Y siguiente. */
function drawField(doc: jsPDF, label: string, value: string, y: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), MARGIN, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND);
  doc.text(value, MARGIN, y + 6);
  return y + 14;
}

function drawDisclaimer(doc: jsPDF, y: number): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    'Documento de un proyecto universitario. No es una factura fiscal válida ni una tarjeta de embarque.',
    MARGIN,
    y,
    { maxWidth: PAGE_WIDTH - MARGIN * 2 },
  );
}

function drawPass(doc: jsPDF, pass: TravelPass): void {
  let y = drawHeader(doc, 'PASAJE · DEMO');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND);
  doc.text('Pase de viaje', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(`Reserva ${pass.bookingCode}`, MARGIN, y + 6);
  y += 20;

  y = drawField(doc, 'Pasajero', pass.passengerName, y);
  y = drawField(
    doc,
    'Documento',
    `${pass.documentType} ${pass.documentNumber}`,
    y,
  );
  y = drawField(doc, 'Vuelo', pass.flightCode, y);
  y = drawField(doc, 'Ruta', `${pass.origin}  →  ${pass.destination}`, y);
  y = drawField(
    doc,
    'Fecha y hora',
    `${formatFullDate(pass.departureAt)} · ${formatTime(pass.departureAt)} ART`,
    y,
  );
  y = drawField(doc, 'Asiento', pass.seat, y);
  y = drawField(doc, 'Clase', pass.cabinClass, y);

  drawDisclaimer(doc, y + 6);
}

function drawInvoice(
  doc: jsPDF,
  invoice: InvoiceDocument,
  bookingCode: string,
): void {
  let y = drawHeader(doc, 'COMPROBANTE · DEMO');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND);
  doc.text(`Factura ${invoice.voucherType}`, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(`Reserva ${bookingCode} · Comprobante ${invoice.reference}`, MARGIN, y + 6);
  y += 20;

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('COMPRADOR', MARGIN, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND);
  doc.text(invoice.buyerName, MARGIN, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(
    `${invoice.buyerDocumentType} ${invoice.buyerDocumentNumber}`,
    MARGIN,
    y + 12,
  );
  y += 24;

  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, RIGHT, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const line of invoice.lines) {
    doc.setTextColor(...BRAND);
    doc.text(line.label, MARGIN, y);
    doc.text(formatArs(line.amount), RIGHT, y, { align: 'right' });
    y += 8;
  }

  doc.line(MARGIN, y - 2, RIGHT, y - 2);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BRAND);
  doc.text('Total abonado', MARGIN, y);
  doc.text(formatArs(invoice.total), RIGHT, y, { align: 'right' });
  y += 14;

  drawDisclaimer(doc, y);
}

export function buildPassPdf(documents: TravelDocuments): jsPDF {
  const doc = newDoc();
  documents.passes.forEach((pass, index) => {
    if (index > 0) doc.addPage();
    drawPass(doc, pass);
  });
  return doc;
}

export function buildInvoicePdf(documents: TravelDocuments): jsPDF {
  const doc = newDoc();
  drawInvoice(doc, documents.invoice, documents.bookingCode);
  return doc;
}
