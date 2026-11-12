import { Prisma } from '@prisma/client';

/** P2034 es el unico error de Prisma que reintentamos automaticamente. */
export function isSerializationFailure(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
}

/**
 * Reconoce tambien mensajes genericos de serializacion/deadlock que Prisma
 * puede devolver segun el driver. Se usa para mapear a 503, no para reintentar.
 */
export function isSerializationConflict(err: unknown): boolean {
  if (isSerializationFailure(err)) return true;
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return message.includes('could not serialize access') || message.includes('deadlock');
}

export type SerializationRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta exclusivamente errores P2034 con backoff exponencial acotado y jitter.
 * Cualquier otro error se propaga inmediatamente.
 */
export async function withSerializationRetry<T>(
  fn: () => Promise<T>,
  options: SerializationRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 100;
  const jitterMs = options.jitterMs ?? 25;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isSerializationFailure(err)) throw err;

      lastError = err;
      if (attempt === attempts - 1) break;

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(backoff + Math.random() * jitterMs);
    }
  }

  throw lastError;
}
