import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
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

  const route = await prisma.route.create({
    data: body,
    include: { originAirport: true, destinationAirport: true },
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Route', entityId: route.id });
  return created(route);
});
