import { gunzip, type ZlibOptions } from 'node:zlib';
import { NextResponse } from 'next/server';
import { z, type ZodSchema } from 'zod';
import { ApiError } from '@/lib/api';
import { isSerializationConflict } from './retry';

/** Limites acordados para la API movil (US-10A). */
export const MAX_COMPRESSED_BODY_BYTES = 1_000_000;
export const MAX_UNCOMPRESSED_BODY_BYTES = 5_000_000;

function payloadTooLarge(message: string) {
  return new ApiError(413, message, 'PAYLOAD_TOO_LARGE');
}

function isBufferTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
  );
}

function gunzipAsync(input: Buffer, options: ZlibOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(input, options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Lee el cuerpo por chunks y corta la lectura apenas supera `limit`.
 * Evita que un request sin `Content-Length` acumule un cuerpo arbitrario en memoria.
 */
export async function readBodyWithLimit(
  req: Request,
  limit: number,
  message = 'El cuerpo supera el limite permitido',
): Promise<Buffer> {
  if (!req.body) return Buffer.alloc(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > limit) {
        await reader.cancel(message).catch(() => undefined);
        throw payloadTooLarge(message);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // El stream ya puede estar cerrado o cancelado.
    }
  }

  return Buffer.concat(chunks, total);
}

/**
 * Parseo del body JSON movil con soporte opcional de `Content-Encoding: gzip`.
 *
 * Se valida el tamano comprimido (1 MB) durante la lectura y el descomprimido
 * (5 MB) con `maxOutputLength`; la descompresion es asincrona para no bloquear
 * el event loop. El exceso de tamano siempre responde 413.
 */
export async function parseMobileBody<S extends ZodSchema>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const encoding = (req.headers.get('content-encoding') ?? 'identity').trim().toLowerCase();
  if (encoding !== 'identity' && encoding !== 'gzip') {
    throw new ApiError(
      415,
      'Codificacion no soportada. Use gzip o envie el JSON sin comprimir',
      'UNSUPPORTED_ENCODING',
    );
  }

  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (encoding === 'gzip' && declaredLength > MAX_COMPRESSED_BODY_BYTES) {
    throw payloadTooLarge('El cuerpo comprimido supera el limite de 1 MB');
  }
  if (encoding === 'identity' && declaredLength > MAX_UNCOMPRESSED_BODY_BYTES) {
    throw payloadTooLarge('El cuerpo supera el limite de 5 MB');
  }

  let raw: Buffer;
  if (encoding === 'gzip') {
    const compressed = await readBodyWithLimit(
      req,
      MAX_COMPRESSED_BODY_BYTES,
      'El cuerpo comprimido supera el limite de 1 MB',
    );
    try {
      raw = await gunzipAsync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BODY_BYTES });
    } catch (err) {
      if (isBufferTooLarge(err)) {
        throw payloadTooLarge('El cuerpo descomprimido supera el limite de 5 MB');
      }
      throw ApiError.badRequest('El cuerpo gzip no es valido');
    }
  } else {
    raw = await readBodyWithLimit(
      req,
      MAX_UNCOMPRESSED_BODY_BYTES,
      'El cuerpo supera el limite de 5 MB',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw ApiError.badRequest('El cuerpo de la peticion debe ser JSON valido');
  }

  return schema.parse(parsed);
}

/**
 * Detecta conflictos de disponibilidad real (asiento tomado o cupo agotado).
 * El resto de los 409 conserva el mensaje y codigo originales.
 */
export function isSeatUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return (
    err.message.includes('Asiento no disponible') ||
    err.message.includes('Se agotaron los asientos')
  );
}

/** Respuesta exacta acordada para la app movil cuando falta disponibilidad. */
export function seatUnavailableResponse() {
  return NextResponse.json(
    {
      code: 'SEAT_UNAVAILABLE',
      message: 'El asiento seleccionado ya no está disponible.',
      status: 409,
    },
    { status: 409 },
  );
}

/** Respuesta reintentable cuando se agotan los reintentos de serializacion. */
export function serializationConflictResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'SERIALIZATION_CONFLICT',
        message: 'No pudimos confirmar la operación por concurrencia. Reintentá en unos segundos.',
        details: { retryable: true },
      },
    },
    { status: 503, headers: { 'retry-after': '1' } },
  );
}

/**
 * Traduce errores de las rutas moviles sin cambiar el contrato exacto de
 * disponibilidad ni devolver un 500 generico ante conflictos de serializacion.
 */
export function mobileErrorResponse(err: unknown): NextResponse | null {
  if (isSeatUnavailable(err)) return seatUnavailableResponse();
  if (isSerializationConflict(err)) return serializationConflictResponse();
  return null;
}
