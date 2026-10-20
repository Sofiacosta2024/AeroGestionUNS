import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPasajePdf, type PasajeInput } from '../../src/lib/pasaje-pdf';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function sampleInput(overrides: Partial<PasajeInput> = {}): PasajeInput {
  return {
    bookingCode: 'AG-7F3K9Q',
    status: 'CONFIRMED',
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    passengersCount: 1,
    totalAmount: 64200,
    currency: 'ARS',
    createdAt: '2026-01-10T12:00:00Z',
    flights: [
      {
        flightCode: 'AG-1420',
        origin: { iataCode: 'BHI', city: 'Bahía Blanca', name: 'Bahía Blanca' },
        destination: { iataCode: 'AEP', city: 'Buenos Aires', name: 'Aeroparque' },
        departureAt: '2026-02-01T09:45:00Z',
        arrivalAt: '2026-02-01T10:55:00Z',
        status: 'SCHEDULED',
        isReturn: false,
        price: 64200,
        fare: { name: 'Economy Light', cabinClass: 'ECONOMY' },
      },
    ],
    passengers: [
      {
        firstName: 'Ana',
        lastName: 'García',
        documentType: 'DNI',
        documentNumber: '*****678',
        seatNumber: '12A',
        checkInStatus: 'NOT_STARTED',
      },
    ],
    ...overrides,
  };
}

function toLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

// ---------------------------------------------------------------------------
// Estructura del PDF
// ---------------------------------------------------------------------------

test('el PDF comienza con cabecera 1.4 y comentario binario', () => {
  const bytes = buildPasajePdf(sampleInput());
  const header = Buffer.from(bytes.slice(0, 10)).toString('latin1');
  assert.ok(header.startsWith('%PDF-1.4\n'), `cabecera inesperada: ${JSON.stringify(header)}`);
  // "%PDF-1.4\n" ocupa 9 bytes; el comentario binario sigue en el byte 9.
  assert.equal(bytes[9], 0x25); // '%'
  assert.equal(bytes[10], 0xe2);
  assert.equal(bytes[11], 0xe3);
  assert.equal(bytes[12], 0xcf);
  assert.equal(bytes[13], 0xd3);
});

test('el PDF termina con %%EOF despues del startxref', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.match(text, /startxref\n\d+\n%%EOF\n$/);
});

test('contiene catalogo, paginas, pagina con MediaBox y fuentes WinAnsi', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  assert.match(text, /<< \/Type \/Catalog \/Pages 2 0 R >>/);
  assert.match(text, /<< \/Type \/Pages \/Kids \[3 0 R\] \/Count 1 >>/);
  assert.match(text, /\/Type \/Page \/Parent 2 0 R \/MediaBox \[0 0 595 842\]/);
  assert.match(text, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  assert.match(text, /\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
});

test('la tabla xref apunta a cada objeto por su offset en bytes', () => {
  const bytes = buildPasajePdf(sampleInput());
  const text = toLatin1(bytes);

  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  assert.ok(Number.isInteger(startxref) && startxref > 0, 'startxref invalido');
  assert.equal(text.slice(startxref, startxref + 4), 'xref');

  const xrefSection = text.slice(startxref);
  const lines = xrefSection.split('\n');
  assert.equal(lines[0], 'xref');
  const [start, count] = (lines[1] ?? '').split(' ').map(Number);
  assert.equal(start, 0);
  assert.equal(count, Number(text.match(/\/Size (\d+)/)?.[1]));

  // Entradas de 20 bytes: offset (10) + espacio + generacion (5) + " n \n".
  for (let n = 1; n < count; n++) {
    const entry = lines[2 + n] ?? '';
    assert.equal(entry.length, 19, `entrada xref #${n} con largo ${entry.length}`);
    assert.match(entry, /^\d{10} \d{5} n $/);
    const offset = Number(entry.slice(0, 10));
    assert.equal(
      text.slice(offset, offset + `${n} 0 obj`.length),
      `${n} 0 obj`,
      `el offset de ${n} no apunta a su objeto`,
    );
  }
});

test('cada stream declara /Length exacto en bytes', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
  assert.ok(streams.length >= 1);
  for (const match of streams) {
    const declared = Number(match[1]);
    const bodyStart = match.index! + match[0].length;
    // El dato incluye el \n final; endstream sigue directamente.
    const bodyEnd = text.indexOf('endstream', bodyStart);
    assert.ok(bodyEnd > bodyStart);
    assert.equal(declared, bodyEnd - bodyStart, 'el /Length no coincide con el stream');
  }
});

test('no es HTML renombrado', () => {
  const text = toLatin1(buildPasajePdf(sampleInput())).toLowerCase();
  assert.equal(text.includes('<html'), false);
  assert.equal(text.includes('<!doctype'), false);
  assert.equal(text.includes('<body'), false);
  assert.equal(text.includes('text/html'), false);
});

// ---------------------------------------------------------------------------
// Contenido y codificacion
// ---------------------------------------------------------------------------

test('incluye codigo de reserva, vuelo, ruta y datos del pasajero', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  assert.ok(text.includes('AG-7F3K9Q'));
  assert.ok(text.includes('AG-1420'));
  assert.ok(text.includes('BHI'));
  assert.ok(text.includes('AEP'));
  assert.ok(text.includes('Ana Garc'));
  assert.ok(text.includes('Economy Light'));
  assert.ok(text.includes('12A'));
  assert.ok(text.includes('Compra confirmada'));
  assert.ok(text.includes('Solo ida'));
});

test('acentos y separadores se codifican en WinAnsi (no UTF-8)', () => {
  const bytes = buildPasajePdf(sampleInput());
  const text = toLatin1(bytes);

  // "·" (U+00B7 → WinAnsi 0xB7 = octal 267) e "í" de "García"/"Bahía"
  // (0xED = 355) quedan como escapes octal dentro de los strings.
  assert.ok(text.includes('\\267'), 'el separador middle dot no esta codificado');
  assert.ok(text.includes('\\355'), 'la í no esta codificada');

  // El cuerpo (despues del comentario binario) debe ser ASCII puro:
  // los bytes > 127 solo existen en ese comentario inicial.
  const body = Buffer.from(bytes.slice(5)).toString('latin1');
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    if (code > 0x7e) {
      // 0xE2-0xE3-0xCF-0xD3 del comentario binario al inicio del body.
      assert.ok(
        i < 10 && [0xe2, 0xe3, 0xcf, 0xd3, 0x0a].includes(code),
        `byte no-ASCII inesperado ${code} en posicion ${i}`,
      );
    }
  }
});

test('la flecha Unicode se translitera a > (fuera de WinAnsi)', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  // flightRouteLabel arma "AG-1420 · BHI → AEP"; la flecha no existe en WinAnsi.
  assert.equal(text.includes('\u2192'), false);
  assert.match(text, /BHI > AEP/);
});

test('parentesis y backslashes del contenido se escapan', () => {
  const input = sampleInput();
  input.passengers[0]!.lastName = 'Pérez (hijo) \\ Jr';
  const text = toLatin1(buildPasajePdf(input));
  assert.ok(text.includes('P\\xE9rez \\(hijo\\) \\\\ Jr') || text.includes('\\(hijo\\)'));
  // Ningun parentesis sin escapar dentro del string de la linea del pasajero.
  const line = text
    .split('\n')
    .find((l) => l.includes('hijo'));
  assert.ok(line);
  const stringBody = line.slice(line.indexOf('(') + 1, line.lastIndexOf(') Tj'));
  let depth = 0;
  for (let i = 0; i < stringBody.length; i++) {
    if (stringBody[i] === '\\') {
      i++;
      continue;
    }
    if (stringBody[i] === '(') depth++;
    if (stringBody[i] === ')') depth--;
    assert.ok(depth >= 0, 'parentesis sin cerrar');
  }
  assert.equal(depth, 0, 'parentesis desbalanceados en el string PDF');
});

test('trunca lineas demasiado largas para el ancho de pagina', () => {
  const input = sampleInput();
  input.passengers[0]!.firstName = 'A'.repeat(200);
  input.passengers[0]!.lastName = 'B'.repeat(200);
  const text = toLatin1(buildPasajePdf(input));
  assert.ok(text.includes('A...'));
  // Ninguna operacion de texto excede el ancho util (~495pt a 10pt ≈ 99 chars).
  const textOps = [...text.matchAll(/\((.*)\) Tj/g)];
  for (const op of textOps) {
    assert.ok((op[1] ?? '').length <= 120, `linea muy larga (${(op[1] ?? '').length} chars)`);
  }
});

// ---------------------------------------------------------------------------
// Privacidad
// ---------------------------------------------------------------------------

test('privacidad: no expone DNI completo, contactos ni notas', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  assert.ok(text.includes('*****678'), 'el documento enmascarado debe estar');
  assert.equal(text.includes('12345678'), false);
  assert.equal(text.includes('ana@example.com'), false);
  assert.equal(text.includes('2915555555'), false);
  assert.equal(text.includes('reservado por telefono'), false);
});

test('privacidad: no expone identificadores internos ni asientos de otros', () => {
  const text = toLatin1(buildPasajePdf(sampleInput()));
  for (const internal of ['bk_1', 'bf_1', 'bp_1', 'fl_1', 'fare_1', 'seat_1', 'user_']) {
    assert.equal(text.includes(internal), false, `se filtro ${internal}`);
  }
});

// ---------------------------------------------------------------------------
// Paginacion y datos faltantes
// ---------------------------------------------------------------------------

test('muchos pasajeros generan varias paginas con su propia pagina object', () => {
  const passengers = Array.from({ length: 30 }, (_, i) => ({
    firstName: `Pasajero${i}`,
    lastName: `Apellido${i}`,
    documentType: 'DNI',
    documentNumber: `*****${String(i).padStart(3, '0')}`,
    seatNumber: `${i}A`,
    checkInStatus: 'DONE',
  }));
  const text = toLatin1(buildPasajePdf(sampleInput({ passengers, passengersCount: 30 })));

  const count = Number(text.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)?.[1]);
  assert.ok(count && count >= 2, `esperaba 2+ paginas, hubo ${count}`);
  const pageCount = [...text.matchAll(/\/Type \/Page \/Parent/g)].length;
  assert.equal(pageCount, count, 'la cuenta de Pages no coincide con las paginas');

  // La tabla xref sigue valida aunque haya varias paginas.
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
});

test('datos faltantes: horarios, tarifa, asiento y documento ausentes', () => {
  const input = sampleInput({
    createdAt: null,
    flights: [
      {
        flightCode: 'AG-9999',
        origin: null,
        destination: null,
        departureAt: null,
        arrivalAt: null,
        status: 'DELAYED',
        isReturn: true,
        price: 0,
        fare: null,
      },
    ],
    passengers: [
      {
        firstName: 'Sin',
        lastName: 'Datos',
        documentType: null,
        documentNumber: null,
        seatNumber: null,
        checkInStatus: null,
      },
    ],
  });
  const text = toLatin1(buildPasajePdf(input));
  assert.ok(text.includes('Fecha a confirmar'));
  assert.ok(text.includes('Horario a confirmar'));
  assert.ok(text.includes('Tarifa a confirmar'));
  assert.ok(text.includes('A asignar'));
  assert.ok(text.includes('No informado'));
  assert.ok(text.includes('Regreso'));
});

test('reserva sin vuelos ni pasajeros: genera el PDF con placeholders', () => {
  const text = toLatin1(buildPasajePdf(sampleInput({ flights: [], passengers: [] })));
  assert.ok(text.includes('no tiene vuelos registrados'));
  assert.ok(text.includes('no tiene pasajeros registrados'));
  assert.ok(text.endsWith('%%EOF\n'));
});

test('acepta fechas como Date (forma del servidor) y como string ISO', () => {
  const input = sampleInput();
  input.createdAt = new Date('2026-01-10T12:00:00Z');
  input.flights[0]!.departureAt = new Date('2026-02-01T09:45:00Z');
  input.flights[0]!.arrivalAt = new Date('2026-02-01T10:55:00Z');
  const text = toLatin1(buildPasajePdf(input));
  assert.ok(text.includes('AG-1420'));
  assert.ok(text.endsWith('%%EOF\n'));
});
