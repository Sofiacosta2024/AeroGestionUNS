import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { hashPassword, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { paginationQuery, userBase } from '@/lib/validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuery = paginationQuery.extend({
  role: z.enum(['PASAJERO', 'MOSTRADOR', 'ADMIN']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().trim().max(120).optional(),
});

const createUserSchema = userBase.extend({
  email: z.string().trim().toLowerCase().email('Correo invalido'),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(['PASAJERO', 'MOSTRADOR', 'ADMIN']).default('PASAJERO'),
});

/** GET /api/users — solo ADMIN. Nunca se devuelve passwordHash. */
export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);
  const { page, pageSize, role, isActive, search } = parseQuery(req, listQuery);

  const where = {
    ...(role ? { role } : {}),
    ...(isActive === undefined ? {} : { isActive }),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { legajo: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        legajo: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { bookings: true, sessions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

/** POST /api/users — alta de personal (mostrador/admin). */
export const POST = handler(async (req: Request) => {
  const admin = await requireRole(UserRole.ADMIN);
  const body = await parseBody(req, createUserSchema);

  const { password, ...rest } = body;
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { ...rest, passwordHash },
    select: { id: true, email: true, role: true, legajo: true, firstName: true, lastName: true },
  });

  await audit({
    userId: admin.id,
    action: 'CREATE',
    entity: 'User',
    entityId: user.id,
    metadata: { role: user.role },
  });

  return created(user);
});
