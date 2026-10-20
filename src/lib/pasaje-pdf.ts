import { formatArs, formatFullDate } from './format';
import {
  bookingStatusPresentation,
  cabinClassLabel,
  flightRouteLabel,
  flightSchedule,
  passengerDocumentLabel,
  passengerName,
  passengerSeatLabel,
} from './public-booking-view';

/**
 * Generador de PDF del pasaje (US-14A, Paso 2).
 *
 * Produce un PDF 1.4 real y valido (catalogo, paginas, streams con /Length,
 * fuentes Helvetica con /WinAnsiEncoding, tabla xref con offsets en bytes y
 * trailer con startxref) sin ninguna dependencia externa. No es HTML con
 * extension .pdf.
 *
 * El contenido se arma unicamente a partir de la vista publica de la reserva:
 * no hay datos personales completos (el documento llega enmascarado), ni
 * contactos, ni identificadores internos. El texto se codifica en WinAnsi y
 * todo el archivo queda en ASCII puro.
 */

const PAGE_W = 595; // A4 en puntos
const PAGE_H = 842;
const MARGIN_X = 50;
const TOP_Y = 792;
const BOTTOM_Y = 60;

const F_REGULAR = 'F1';
const F_BOLD = 'F2';
const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

/** Fechas de la vista publica: strings ISO (cliente) o Date (servidor). */
type DateLike = Date | string | null | undefined;

export type PasajeInput = {
  bookingCode: string;
  status: string;
  tripType: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  createdAt: DateLike;
  flights: Array<{
    flightCode: string;
    origin: { iataCode: string; city: string; name: string } | null;
    destination: { iataCode: string; city: string; name: string } | null;
    departureAt: DateLike;
    arrivalAt: DateLike;
    status: string;
    isReturn: boolean;
    price: number;
    fare: { name: string; cabinClass: string } | null;
  }>;
  passengers: Array<{
    firstName: string;
    lastName: string;
    documentType: string | null;
    documentNumber: string | null;
    seatNumber: string | null;
    checkInStatus: string | null;
  }>;
};

export type Line = {
  text: string;
  bold?: boolean;
  size?: number;
  indent?: number;
  gray?: boolean;
  gapBefore?: number;
};

type PlacedLine = Line & { x: number; y: number };

/**
 * Tabla WinAnsi: codigos Unicode fuera de ASCII/Latin-1 que existen en el
 * subset Windows-1252. La flecha (U+2192) no esta en WinAnsi y se reemplaza
 * por '>' para conservar la lectura de los horarios y rutas.
 */
const WINANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
  0x2192: 0x3e, // → > (fuera de WinAnsi)
};

/** Mapea un code point a su byte WinAnsi; lo no representable cae a '?'. */
function winAnsiByte(codePoint: number): number {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
  const mapped = WINANSI_EXTRA[codePoint];
  return mapped !== undefined ? mapped : 0x3f; // '?'
}

function toWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    bytes.push(winAnsiByte(ch.codePointAt(0) ?? 0x3f));
  }
  return bytes;
}

/** Escapa bytes para un string literal de PDF, con octal de 3 digitos. */
function escapePdfString(bytes: number[]): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x28) out += '\\(';
    else if (b === 0x29) out += '\\)';
    else if (b === 0x5c) out += '\\\\';
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return out;
}

/** Ancho aproximado en puntos (media anchura promedio de Helvetica). */
function measureWidth(text: string, size: number): number {
  return text.length * size * 0.5;
}

function truncateToFit(text: string, size: number, available: number): string {
  if (measureWidth(text, size) <= available) return text;
  let cut = text;
  while (cut.length > 1 && measureWidth(`${cut}...`, size) > available) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

const TRIP_TYPE_LABELS: Record<string, string> = {
  ONE_WAY: 'Solo ida',
  ROUND_TRIP: 'Ida y vuelta',
};

function tripTypeLabel(value: string): string {
  return TRIP_TYPE_LABELS[value] ?? value;
}

function toIso(value: DateLike): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function buildLines(input: PasajeInput): Line[] {
  const lines: Line[] = [];

  lines.push({ text: 'Pasaje de viaje', bold: true, size: 18 });
  lines.push({
    text: 'AeroGestionUNS - Consulta publica de reserva',
    size: 9,
    gray: true,
    gapBefore: 2,
  });

  lines.push({ text: 'Reserva', bold: true, size: 12, gapBefore: 16 });
  lines.push({ text: `Codigo: ${input.bookingCode}`, gapBefore: 4 });
  lines.push({ text: `Estado: ${bookingStatusPresentation(input.status).label}` });
  lines.push({ text: `Tipo de viaje: ${tripTypeLabel(input.tripType)}` });
  lines.push({ text: `Clase: ${cabinClassLabel(input.cabinClass)}` });
  const createdAt = toIso(input.createdAt);
  if (createdAt) {
    lines.push({ text: `Emitida: ${formatFullDate(createdAt)}` });
  }
  lines.push({ text: `Total: ${formatArs(input.totalAmount)} ${input.currency}` });

  lines.push({ text: 'Itinerario', bold: true, size: 12, gapBefore: 16 });
  if (input.flights.length === 0) {
    lines.push({ text: 'La reserva no tiene vuelos registrados.', gapBefore: 4 });
  }
  input.flights.forEach((flight, i) => {
    const schedule = flightSchedule(toIso(flight.departureAt), toIso(flight.arrivalAt));
    const fareText = flight.fare
      ? `${flight.fare.name} (${cabinClassLabel(flight.fare.cabinClass)})`
      : 'Tarifa a confirmar';
    const leg = flight.isReturn ? ' - Regreso' : '';
    lines.push({ text: `${flightRouteLabel(flight)}${leg}`, bold: true, gapBefore: i === 0 ? 4 : 10 });
    lines.push({ text: `Salida: ${schedule.date}  ${schedule.time}`, indent: 14 });
    lines.push({ text: `Tarifa: ${fareText}`, indent: 14 });
    lines.push({ text: `Estado del vuelo: ${flight.status}`, indent: 14 });
  });

  lines.push({ text: 'Pasajeros', bold: true, size: 12, gapBefore: 16 });
  if (input.passengers.length === 0) {
    lines.push({ text: 'La reserva no tiene pasajeros registrados.', gapBefore: 4 });
  }
  input.passengers.forEach((passenger, i) => {
    lines.push({
      text: `${i + 1}. ${passengerName(passenger.firstName, passenger.lastName) || 'Pasajero'}`,
      bold: true,
      gapBefore: i === 0 ? 4 : 10,
    });
    const document = passengerDocumentLabel(passenger.documentType, passenger.documentNumber);
    lines.push({ text: `Documento: ${document ?? 'No informado'}`, indent: 14 });
    lines.push({ text: `Asiento: ${passengerSeatLabel(passenger.seatNumber)}`, indent: 14 });
  });

  lines.push({
    text: 'Documento informativo generado desde la consulta publica de reservas. No reemplaza el comprobante de pago.',
    size: 8,
    gray: true,
    gapBefore: 20,
  });

  return lines;
}

/** Coloca las lineas en paginas A4, respetando margenes y saltos. */
function paginate(lines: Line[]): PlacedLine[][] {
  const pages: PlacedLine[][] = [];
  let current: PlacedLine[] = [];
  let y = TOP_Y;

  for (const line of lines) {
    const size = line.size ?? 10;
    const gap = line.gapBefore ?? 0;
    const advance = gap + size * 1.35;
    if (y - advance < BOTTOM_Y && current.length > 0) {
      pages.push(current);
      current = [];
      y = TOP_Y;
    }
    y -= gap;
    y -= size * 1.35;
    current.push({ ...line, x: MARGIN_X + (line.indent ?? 0), y });
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

function renderPage(placed: PlacedLine[]): string {
  let ops = '';
  for (const line of placed) {
    const size = line.size ?? 10;
    const available = PAGE_W - MARGIN_X - line.x;
    const text = truncateToFit(line.text, size, available);
    const font = line.bold ? F_BOLD : F_REGULAR;
    const x = Math.round(line.x);
    const y = Math.round(line.y);
    if (line.gray) ops += '0.5 g\n';
    ops += `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(toWinAnsi(text))}) Tj ET\n`;
    if (line.gray) ops += '0 g\n';
  }
  return ops;
}

/**
 * Ensambla el PDF byte a byte: header, catalogo, paginas, streams, fuentes,
 * tabla xref con offsets reales y trailer.
 */
export function buildPasajePdf(input: PasajeInput): Uint8Array {
  return assemblePdfLines(buildLines(input));
}

/**
 * Ensambla lineas de texto (con su tipografia) en un PDF 1.4 completo.
 * Motor compartido del pasaje y la factura (US-14A): no se duplica la
 * estructura de objetos, fuentes WinAnsi ni la tabla xref.
 */
export function assemblePdfLines(lines: Line[]): Uint8Array {
  const pages = paginate(lines);
  const pageCount = pages.length;

  // Numeracion de objetos: catalogo (1), paginas (2), paginas (3..2+n),
  // streams (3+2n..2+2n), fuentes (3+2n y 4+2n).
  const firstStream = 3 + pageCount;
  const fontRegular = 3 + 2 * pageCount;
  const fontBold = fontRegular + 1;
  const objectCount = fontBold; // el ultimo objeto numerado

  const kids = pages
    .map((_, i) => `${3 + i} 0 R`)
    .join(' ');

  const bodies = new Map<number, string>();
  bodies.set(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  bodies.set(
    2,
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
  );
  pages.forEach((_, i) => {
    bodies.set(
      3 + i,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /${F_REGULAR} ${fontRegular} 0 R /${F_BOLD} ${fontBold} 0 R >> >> ` +
        `/Contents ${firstStream + i} 0 R >>`,
    );
    const stream = renderPage(pages[i] ?? []);
    bodies.set(
      firstStream + i,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
    );
  });
  bodies.set(
    fontRegular,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_REGULAR} /Encoding /WinAnsiEncoding >>`,
  );
  bodies.set(
    fontBold,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_BOLD} /Encoding /WinAnsiEncoding >>`,
  );

  const parts: Buffer[] = [];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let length = 0;
  const push = (text: string) => {
    const buf = Buffer.from(text, 'ascii');
    parts.push(buf);
    length += buf.length;
  };

  push('%PDF-1.4\n');
  // Comentario binario: marca el archivo como binario (bytes > 127).
  parts.push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  length += 6;

  for (let n = 1; n <= objectCount; n++) {
    offsets[n] = length;
    push(`${n} 0 obj\n${bodies.get(n)}\nendobj\n`);
  }

  const xrefOffset = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objectCount; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Uint8Array(Buffer.concat(parts));
}
