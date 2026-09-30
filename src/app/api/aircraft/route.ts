import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { aircraftSchema, paginationQuery } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuery = paginationQuery.extend({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'RETIRED']).optional(),
  baseAirportId: z.string().trim().length(3).toUpperCase().optional(),
});

/** GET /api/aircraft?status=ACTIVE */
export const GET = handler(async (req: Request) => {
  const q = parseQuery(req, listQuery);
  const { page, pageSize, status, baseAirportId } = q;

  const where = {
    ...(status ? { status } : {}),
    ...(baseAirportId ? { baseAirportId } : {}),
  };

  const [total, data] = await Promise.all([
    prisma.aircraft.count({ where }),
    prisma.aircraft.findMany({
      where,
      include: { baseAirport: true, _count: { select: { seats: true, flights: true } } },
      orderBy: { registration: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.ADMIN);
  const body = await parseBody(req, aircraftSchema);

  const aircraft = await prisma.aircraft.create({
    data: { ...body, imageUrl: body.imageUrl || null },
    include: { baseAirport: true },
  });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Aircraft', entityId: aircraft.id });
  return created(aircraft);
});
