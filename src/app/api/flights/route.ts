import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { flightInclude, serializeFlight } from '@/lib/flights';
import { searchFlights } from '@/lib/flights-search';
import { prisma } from '@/lib/prisma';
import { publishSingleFlight } from '@/lib/scheduling/service';
import { flightSearchQuery, singleFlightSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flights
 *
 * Busqueda del motor de vuelos: reemplaza los datos hardcodeados de vuelos.html.
 *
 *   /api/flights?origin=BHI&destination=AEP&date=2025-11-18
 *   /api/flights?routeId=<id>&from=2025-11-18&to=2025-11-24&sort=price&order=asc
 */
export const GET = handler(async (req: Request) => {
  const result = await searchFlights(parseQuery(req, flightSearchQuery));
  return ok(result);
});

/**
 * POST /api/flights
 *
 * Alta de un vuelo puntual con las mismas reglas que el panel de RF-01: el codigo
 * AG-#### y la llegada los calcula el sistema, se exigen asientos y precio por clase,
 * y se rechazan fechas pasadas y choques de horario. Por dentro es un cronograma de un
 * solo dia publicado en el acto.
 *
 * Cambio RF-01: antes recibia `code` y `arrivalAt` y creaba el vuelo sin validar
 * superposiciones, sin precios ni asientos (quedaba visible en el buscador vacio).
 * Ahora recibe `{ routeId, aircraftId, date, departureTime, fares[] }` y pasa por el
 * mismo servicio que el panel para que no haya un camino que saltee las reglas.
 * Mantiene el acceso de MOSTRADOR por decision del subgrupo de RF-01; si eso cambia,
 * solo hay que ajustar el `requireRole`.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, singleFlightSchema);

  const schedule = await publishSingleFlight(body, user.id);
  const flight = await prisma.flight.findFirstOrThrow({
    where: { scheduleId: schedule.id },
    include: flightInclude,
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Flight', entityId: flight.id });
  return created(serializeFlight(flight));
});
