import { UserRole } from '@prisma/client';
import { ApiError, created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { paginationQuery, passengerSchema } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuery = paginationQuery.extend({
  search: z.string().trim().max(120).optional(),
  documentNumber: z.string().trim().max(32).optional(),
});

/**
 * GET /api/passengers
 * MOSTRADOR/ADMIN ven todos; un pasajero solo ve los suyos.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireRole(UserRole.PASAJERO);
  const { page, pageSize, search, documentNumber } = parseQuery(req, listQuery);

  const where = {
    ...(user.role === UserRole.PASAJERO ? { userId: user.id } : {}),
    ...(documentNumber ? { documentNumber } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { documentNumber: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.passenger.count({ where }),
    prisma.passenger.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { bookingPassengers: true } } },
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

/** POST /api/passengers */
export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.PASAJERO);
  const body = await parseBody(req, passengerSchema);

  const passenger = await prisma.passenger
    .create({
      data: {
        ...body,
        email: body.email || null,
        // Si es un pasajero, el registro queda vinculado a su cuenta.
        userId: user.role === UserRole.PASAJERO ? user.id : null,
      },
    })
    .catch(() => {
      throw ApiError.conflict('Ya existe un pasajero con ese tipo y numero de documento');
    });

  await audit({ userId: user.id, action: 'CREATE', entity: 'Passenger', entityId: passenger.id });
  return created(passenger);
});
