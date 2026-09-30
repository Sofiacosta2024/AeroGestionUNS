import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z, ZodError, type ZodSchema } from 'zod';

/**
 * Error de negocio con status HTTP explicito.
 * Nunca se envia al cliente informacion interna (stack traces, SQL, etc).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, 'BAD_REQUEST', details);
  }
  static unauthorized(msg = 'No autenticado') {
    return new ApiError(401, msg, 'UNAUTHORIZED');
  }
  static forbidden(msg = 'No tiene permisos para esta operacion') {
    return new ApiError(403, msg, 'FORBIDDEN');
  }
  static notFound(msg = 'Recurso no encontrado') {
    return new ApiError(404, msg, 'NOT_FOUND');
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, 'CONFLICT');
  }
  static unprocessable(msg: string, details?: unknown) {
    return new ApiError(422, msg, 'UNPROCESSABLE', details);
  }
}

export function ok<T>(data: T, status = 200, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status, ...init });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/**
 * Wrapper de Route Handlers: normaliza errores, valida el body y aplica cache
 * "no-store" por defecto (datos de negocio no deben quedar cacheados).
 */
export function handler<A extends unknown[]>(
  fn: (req: Request, ...args: A) => Promise<NextResponse>,
) {
  return async (req: Request, ...args: A): Promise<NextResponse> => {
    try {
      const res = await fn(req, ...args);
      if (!res.headers.has('cache-control')) {
        res.headers.set('cache-control', 'no-store');
      }
      return res;
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: err.code ?? 'ERROR', message: err.message, details: err.details } },
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son validos',
          details: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
        },
      },
      { status: 422 },
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Traducimos las violaciones de restriccion a mensajes utiles sin exponer SQL.
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo';
      return NextResponse.json(
        { ok: false, error: { code: 'CONFLICT', message: `Ya existe un registro con ese valor (${target})` } },
        { status: 409 },
      );
    }
    if (err.code === 'P2003') {
      return NextResponse.json(
        { ok: false, error: { code: 'FK_VIOLATION', message: 'La referencia indicada no existe' } },
        { status: 400 },
      );
    }
    if (err.code === 'P2025') {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } },
        { status: 404 },
      );
    }
  }

  // Cualquier otro error: se loguea en servidor pero no se filtra nada al cliente.
  console.error('[api] error no controlado:', err);
  return NextResponse.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
    { status: 500 },
  );
}

/** Parseo + validacion del body JSON contra un schema Zod. */
export async function parseBody<S extends ZodSchema>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw ApiError.badRequest('El cuerpo de la peticion debe ser JSON valido');
  }
  return schema.parse(raw);
}

/** Parseo + validacion de query params. */
export function parseQuery<S extends ZodSchema>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}
