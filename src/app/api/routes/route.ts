import { UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { paginationQuery, routeSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuery = paginationQuery.extend({
  origin: z.string().trim().length(3).toUpperCase().optional(),
  destination: z.string().trim().length(3).toUpperCase().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/** GET /api/routes?origin=BHI&destination=AEP */
export const GET = handler(async (req: Request) => {
  const q = parseQuery(req, listQuery);
  const { page, pageSize, origin, destination, isActive } = q;

  const where = {
    ...(origin ? { originAirportId: origin } : {}),
    ...(destination ? { destinationAirportId: destination } : {}),
    ...(isActive === undefined ? {} : { isActive }),
  };

  const [total, data] = await Promise.all([
    prisma.route.count({ where }),
    prisma.route.findMany({
      where,
      include: {
        originAirport: true,
        destinationAirport: true,
        _count: { select: { flights: true } },
      },
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.ADMIN);
  const body = await parseBody(req, routeSchema);

  // Cambio RF-01 (alta de vuelos, US1 criterio 1): un par origen-destino existe una
  // sola vez en el catalogo, porque la llegada de cada vuelo se calcula con la duracion
  // de su ruta y dos rutas iguales con duraciones distintas serian ambiguas.
  // El indice unico (routes: origin + destination) lo garantiza; esta consulta solo da
  // un mensaje claro en lugar del 409 generico de Prisma.
  const existing = await prisma.route.findUnique({
    where: {
      originAirportId_destinationAirportId: {
        originAirportId: body.originAirportId,
        destinationAirportId: body.destinationAirportId,
      },
    },
    select: { code: true },
  });
  if (existing) {
    throw ApiError.conflict(
      `La ruta ${body.originAirportId} → ${body.destinationAirportId} ya existe (${existing.code})`,
    );
  }

  const route = await prisma.route.create({
    data: body,
    include: { originAirport: true, destinationAirport: true },
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Route', entityId: route.id });
  return created(route);
});
