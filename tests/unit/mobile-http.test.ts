import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError, toErrorResponse } from '../../src/lib/api';
import {
  MAX_COMPRESSED_BODY_BYTES,
  MAX_UNCOMPRESSED_BODY_BYTES,
  parseMobileBody,
  readBodyWithLimit,
  isSeatUnavailable,
  seatUnavailableResponse,
  mobileErrorResponse,
  serializationConflictResponse,
} from '../../src/lib/mobile/http';
import { mobilePaymentSchema, mobileReservationSchema } from '../../src/lib/validation';

const schema = z.object({ ok: z.literal(true) });

function jsonRequest(body: unknown, encoding?: 'gzip', headers: Record<string, string> = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const payload = encoding === 'gzip' ? gzipSync(raw) : raw;
  return new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(encoding ? { 'content-encoding': encoding } : {}),
      ...headers,
    },
    body: payload,
  });
}

function streamRequest(
  chunks: Uint8Array[],
  options: { headers?: Record<string, string>; close?: boolean; onCancel?: () => void } = {},
) {
  const { headers = {}, close = true, onCancel } = options;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (close) controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function p2034() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    { code: 'P2034', clientVersion: '6.19.3' },
  );
}

test('US-10A: parseMobileBody acepta JSON plano y gzip', async () => {
  assert.deepEqual(await parseMobileBody(jsonRequest({ ok: true }), schema), { ok: true });
  assert.deepEqual(
    await parseMobileBody(jsonRequest({ ok: true }, 'gzip'), schema),
    { ok: true },
  );
});

test('US-10A: parseMobileBody valida codificacion y limites de tamano', async () => {
  const unsupported = new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-encoding': 'br' },
    body: '{}',
  });
  await assert.rejects(parseMobileBody(unsupported, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 415);
    return true;
  });

  await assert.rejects(
    parseMobileBody(
      jsonRequest({ ok: true }, 'gzip', { 'content-length': String(MAX_COMPRESSED_BODY_BYTES + 1) }),
      schema,
    ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 413);
      return true;
    },
  );

  await assert.rejects(
    parseMobileBody(
      jsonRequest({ ok: true }, undefined, { 'content-length': String(MAX_UNCOMPRESSED_BODY_BYTES + 1) }),
      schema,
    ),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 413);
      return true;
    },
  );
});

test('US-10A: un gzip que descomprime por encima de 5 MB se rechaza con 413', async () => {
  const bomb = gzipSync(Buffer.alloc(MAX_UNCOMPRESSED_BODY_BYTES + 1, 0x20));
  const req = new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-encoding': 'gzip' },
    body: bomb,
  });

  await assert.rejects(parseMobileBody(req, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 413);
    return true;
  });
});

test('US-10A: gzip invalido y JSON invalido se rechazan con 400', async () => {
  const invalidGzip = new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-encoding': 'gzip' },
    body: Buffer.from('esto no es gzip'),
  });
  await assert.rejects(parseMobileBody(invalidGzip, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    return true;
  });

  const invalidJson = new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{no-es-json',
  });
  await assert.rejects(parseMobileBody(invalidJson, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    return true;
  });
});

test('US-10A: readBodyWithLimit acepta el limite exacto y corta un byte mas', async () => {
  const exact = await readBodyWithLimit(
    streamRequest([new Uint8Array(4)], { close: true }),
    4,
  );
  assert.equal(exact.length, 4);

  await assert.rejects(
    readBodyWithLimit(streamRequest([new Uint8Array(5)], { close: true }), 4),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 413);
      return true;
    },
  );
});

test('US-10A: readBodyWithLimit cancela el stream al exceder el limite', async () => {
  let cancelled = false;
  const req = streamRequest([new Uint8Array(3), new Uint8Array(3)], {
    close: false,
    onCancel: () => {
      cancelled = true;
    },
  });

  await assert.rejects(readBodyWithLimit(req, 4), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 413);
    return true;
  });
  assert.equal(cancelled, true);
});

test('US-10A: los limites por chunk funcionan sin Content-Length', async () => {
  const identity = streamRequest([new Uint8Array(MAX_UNCOMPRESSED_BODY_BYTES + 1)], {
    close: false,
  });
  await assert.rejects(parseMobileBody(identity, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 413);
    return true;
  });

  const compressed = streamRequest([new Uint8Array(MAX_COMPRESSED_BODY_BYTES + 1)], {
    headers: { 'content-encoding': 'gzip' },
    close: false,
  });
  await assert.rejects(parseMobileBody(compressed, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 413);
    return true;
  });
});

test('US-10A: acepta exactamente 5 MB sin comprimir y 1 MB comprimido', async () => {
  const exactJson = Buffer.from(' '.repeat(MAX_UNCOMPRESSED_BODY_BYTES - 1) + '0');
  assert.equal(exactJson.length, MAX_UNCOMPRESSED_BODY_BYTES);
  assert.equal(await parseMobileBody(streamRequest([exactJson]), z.number()), 0);

  const exactCompressed = await readBodyWithLimit(
    streamRequest([new Uint8Array(MAX_COMPRESSED_BODY_BYTES)]),
    MAX_COMPRESSED_BODY_BYTES,
  );
  assert.equal(exactCompressed.length, MAX_COMPRESSED_BODY_BYTES);
});

test('US-10A: mobileErrorResponse distingue disponibilidad, serializacion y errores comunes', async () => {
  const seat = mobileErrorResponse(ApiError.conflict('Asiento no disponible'));
  assert.ok(seat);
  assert.equal(seat.status, 409);
  assert.deepEqual(await seat.json(), {
    code: 'SEAT_UNAVAILABLE',
    message: 'El asiento seleccionado ya no está disponible.',
    status: 409,
  });

  const serial = mobileErrorResponse(p2034());
  assert.ok(serial);
  assert.equal(serial.status, 503);
  assert.equal(serial.headers.get('retry-after'), '1');
  assert.deepEqual(await serial.json(), {
    ok: false,
    error: {
      code: 'SERIALIZATION_CONFLICT',
      message: 'No pudimos confirmar la operación por concurrencia. Reintentá en unos segundos.',
      details: { retryable: true },
    },
  });

  assert.equal(mobileErrorResponse(ApiError.conflict('La tarifa cambió')), null);
  assert.equal(mobileErrorResponse(new Error('boom')), null);

  const direct = serializationConflictResponse();
  assert.equal(direct.status, 503);
  assert.equal(direct.headers.get('retry-after'), '1');
});

test('US-10A: los 409 de disponibilidad se traducen al contrato movil exacto', async () => {
  assert.equal(isSeatUnavailable(ApiError.conflict('Asiento no disponible')), true);
  assert.equal(
    isSeatUnavailable(ApiError.conflict('Se agotaron los asientos disponibles del vuelo AG-1')),
    true,
  );
  assert.equal(isSeatUnavailable(ApiError.conflict('La tarifa cambió')), false);

  const res = seatUnavailableResponse();
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    code: 'SEAT_UNAVAILABLE',
    message: 'El asiento seleccionado ya no está disponible.',
    status: 409,
  });
});

test('US-10A: la reserva movil omite contactEmail y exige un pasajero por asiento', () => {
  const base = {
    flightId: 'c1234567890123456789012345',
    fareId: 'c123456789012345678901234a',
    seatIds: ['c123456789012345678901234b'],
  };
  const passenger = { firstName: 'Ana', lastName: 'Perez', documentNumber: '12345678' };

  const withoutEmail = mobileReservationSchema.parse({
    ...base,
    passengers: [passenger],
    contactEmail: 'x@y.com',
  });
  assert.equal('contactEmail' in withoutEmail, false);
  assert.equal(withoutEmail.seatMode, 'MANUAL');
  assert.equal(mobileReservationSchema.safeParse(base).success, false);
  assert.equal(
    mobileReservationSchema.safeParse({
      ...base,
      passengers: [passenger, { ...passenger, firstName: 'Luis' }],
    }).success,
    false,
  );
  assert.equal(
    mobileReservationSchema.safeParse({ ...base, passengers: [passenger] }).success,
    true,
  );
});

test('US-10A: mobileReservationSchema rechaza AUTO con asientos explícitos', () => {
  const base = {
    flightId: 'c1234567890123456789012345',
    fareId: 'c123456789012345678901234a',
    seatIds: ['c123456789012345678901234b'],
    passengers: [{ firstName: 'Ana', lastName: 'Perez', documentNumber: '12345678' }],
  };

  assert.equal(mobileReservationSchema.safeParse({ ...base, seatMode: 'MANUAL' }).success, true);

  const autoWithSeats = mobileReservationSchema.safeParse({ ...base, seatMode: 'AUTO' });
  assert.equal(autoWithSeats.success, false);
  if (!autoWithSeats.success) {
    assert.ok(
      autoWithSeats.error.issues.some(
        (issue) =>
          issue.path.join('.') === 'seatIds' &&
          issue.message === 'La asignación automática no admite asientos elegidos',
      ),
    );
  }
});

test('US-10A: mobileReservationSchema mantiene seatIds obligatorio sin asientos', () => {
  const base = {
    flightId: 'c1234567890123456789012345',
    fareId: 'c123456789012345678901234a',
    passengers: [{ firstName: 'Ana', lastName: 'Perez', documentNumber: '12345678' }],
  };

  for (const seatMode of ['AUTO', 'MANUAL'] as const) {
    const withoutSeats = mobileReservationSchema.safeParse({ ...base, seatMode });
    assert.equal(withoutSeats.success, false);
    if (!withoutSeats.success) {
      assert.ok(withoutSeats.error.issues.some((issue) => issue.path.join('.') === 'seatIds'));
    }
  }
});

test('US-10A: la validación móvil de AUTO con asientos conserva el contrato 422', async () => {
  const request = jsonRequest({
    flightId: 'c1234567890123456789012345',
    fareId: 'c123456789012345678901234a',
    seatIds: ['c123456789012345678901234b'],
    seatMode: 'AUTO',
    passengers: [{ firstName: 'Ana', lastName: 'Perez', documentNumber: '12345678' }],
  });

  let validationError: unknown;
  await assert.rejects(parseMobileBody(request, mobileReservationSchema), (err: unknown) => {
    validationError = err;
    return err instanceof z.ZodError;
  });

  const response = toErrorResponse(validationError);
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.ok(
    body.error.details.some(
      (detail: { campo: string }) => detail.campo === 'seatIds',
    ),
  );
});

test('US-10A: el pago movil normaliza el codigo de reserva', () => {
  const parsed = mobilePaymentSchema.parse({
    bookingCode: '7f3k9q',
    cardNumber: '1234567890123456',
    cardholder: 'Ana Perez',
    expiry: '12/99',
    cvv: '123',
    contactEmail: 'ana@example.com',
    installments: 1,
  });
  assert.equal(parsed.bookingCode, 'AG-7F3K9Q');
});
