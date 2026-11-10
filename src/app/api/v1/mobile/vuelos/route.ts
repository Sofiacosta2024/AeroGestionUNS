import { handler, ok, parseQuery } from '@/lib/api';
import { searchFlights } from '@/lib/flights-search';
import { flightSearchQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/mobile/vuelos
 *
 * Busqueda publica para la app movil. Comparte filtros, reglas y contrato con
 * `GET /api/flights`; la unica diferencia es el prefijo versionado.
 */
export const GET = handler(async (req: Request) => {
  const result = await searchFlights(parseQuery(req, flightSearchQuery));
  return ok(result);
});
