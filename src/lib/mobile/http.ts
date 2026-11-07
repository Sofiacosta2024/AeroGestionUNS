import { gunzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { z, type ZodSchema } from 'zod';
import { ApiError } from '@/lib/api';

/** Limites acordados para la API movil (US-10A). */
export const MAX_COMPRESSED_BODY_BYTES = 1_000_000;
export const MAX_UNCOMPRESSED_BODY_BYTES = 5_000_000;

function payloadTooLarge(message: string) {
  return new ApiError(413, message, 'PAYLOAD_TOO_LARGE');
}

/**
 * Parseo del body JSON movil con soporte opcional de `Content-Encoding: gzip`.
 *
 * Se valida el tamano comprimido (1 MB) antes de descomprimir y el
 * descomprimido (5 MB) antes de pasarlo a Zod. `maxOutputLength` evita que un
 * gzip malicioso consuma memoria sin limite.
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

  const compressed = Buffer.from(await req.arrayBuffer());
  if (encoding === 'gzip' && compressed.byteLength > MAX_COMPRESSED_BODY_BYTES) {
    throw payloadTooLarge('El cuerpo comprimido supera el limite de 1 MB');
  }
  if (encoding === 'identity' && compressed.byteLength > MAX_UNCOMPRESSED_BODY_BYTES) {
    throw payloadTooLarge('El cuerpo supera el limite de 5 MB');
  }

  let raw = compressed;
  if (encoding === 'gzip') {
    try {
      raw = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BODY_BYTES });
    } catch {
      // Incluye gzip invalido y cuerpos que superan el limite al descomprimir.
      throw ApiError.badRequest('El cuerpo gzip no es valido o supera el limite de 5 MB');
    }
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
