/**
 * Cliente HTTP de las pantallas de administracion. Desarma el sobre `{ ok, data }` de la
 * API y convierte los errores en `ApiRequestError` con sus detalles.
 */

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string; details?: unknown } };

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
    signal,
  });
  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!json) throw new ApiRequestError(res.status, 'Error de conexion con el servidor');
  if (!json.ok) throw new ApiRequestError(res.status, json.error.message, json.error.details);
  return json.data;
}

/** Mensajes legibles de los `details` de un error (validacion o conflictos). */
export function detailMessages(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((d: { mensaje?: string; message?: string }) => d?.mensaje ?? d?.message)
    .filter((m): m is string => typeof m === 'string');
}
