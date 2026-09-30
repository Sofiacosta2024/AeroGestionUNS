import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { airportSchema, paginationQuery } from '@/lib/validation';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET /api/airports?page=&pageSize= — lectura publica (la UI muestra origen/destino). */
export const GET = handler(async (req: Request) => {
  const { page, pageSize } = parseQuery(req, paginationQuery);

  const [total, data] = await Promise.all([
    prisma.airport.count(),
    prisma.airport.findMany({
      orderBy: { iataCode: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.MOSTRADOR);
  const body = await parseBody(req, airportSchema);

  const airport = await prisma.airport
    .create({ data: body })
    .catch(() => {
      throw ApiError.conflict('Ya existe un aeropuerto con ese codigo IATA');
    });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Airport', entityId: airport.iataCode });
  return created(airport);
});
