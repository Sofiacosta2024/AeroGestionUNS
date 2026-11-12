import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../src/lib/api';
import {
  isSerializationConflict,
  isSerializationFailure,
  withSerializationRetry,
} from '../../src/lib/mobile/retry';

function prismaError(code: string, message = 'Error de Prisma') {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '6.19.3',
  });
}

const fast = { baseDelayMs: 0, jitterMs: 0 };

test('US-10A: withSerializationRetry reintenta solo P2034 hasta lograrlo', async () => {
  let attempts = 0;
  const result = await withSerializationRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw prismaError('P2034');
      return 'ok';
    },
    { ...fast, attempts: 3 },
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('US-10A: withSerializationRetry agota los intentos y propaga P2034', async () => {
  let attempts = 0;
  await assert.rejects(
    withSerializationRetry(
      async () => {
        attempts++;
        throw prismaError('P2034');
      },
      { ...fast, attempts: 3 },
    ),
    (err: unknown) => isSerializationFailure(err),
  );
  assert.equal(attempts, 3);
});

test('US-10A: withSerializationRetry no reintenta errores ajenos a P2034', async () => {
  const errors = [
    ApiError.conflict('Asiento no disponible'),
    prismaError('P2002', 'Unique constraint failed'),
    prismaError('P2028', 'Transaction already closed'),
    new Error('boom'),
  ];

  for (const error of errors) {
    let attempts = 0;
    await assert.rejects(
      withSerializationRetry(
        async () => {
          attempts++;
          throw error;
        },
        { ...fast, attempts: 3 },
      ),
      (err: unknown) => err === error,
    );
    assert.equal(attempts, 1);
  }
});

test('US-10A: isSerializationConflict reconoce P2034 y mensajes genericos, no P2002', () => {
  assert.equal(isSerializationFailure(prismaError('P2034')), true);
  assert.equal(isSerializationConflict(prismaError('P2034')), true);
  assert.equal(
    isSerializationConflict(new Error('could not serialize access due to concurrent update')),
    true,
  );
  assert.equal(isSerializationConflict(new Error('Deadlock detected')), true);
  assert.equal(isSerializationConflict(prismaError('P2002')), false);
  assert.equal(isSerializationConflict(ApiError.conflict('Asiento no disponible')), false);
});
