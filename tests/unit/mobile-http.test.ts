import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { ApiError } from '../../src/lib/api';
import {
  MAX_COMPRESSED_BODY_BYTES,
  MAX_UNCOMPRESSED_BODY_BYTES,
  parseMobileBody,
  isSeatUnavailable,
  seatUnavailableResponse,
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

test('US-10A: un gzip que descomprime por encima de 5 MB se rechaza', async () => {
  const bomb = gzipSync(Buffer.alloc(MAX_UNCOMPRESSED_BODY_BYTES + 1, 0x20));
  const req = new Request('http://localhost/api/v1/mobile/test', {
    method: 'POST',
    headers: { 'content-encoding': 'gzip' },
    body: bomb,
  });

  await assert.rejects(parseMobileBody(req, schema), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
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
