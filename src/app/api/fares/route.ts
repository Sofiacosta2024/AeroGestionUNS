import { UserRole } from '@prisma/client';
import { created, handler, ok, parseBody, parseQuery } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fareSchema, paginationQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/fares?page=&pageSize= */
export const GET = handler(async (req: Request) => {
  const { page, pageSize } = parseQuery(req, paginationQuery);

  const [total, data] = await Promise.all([
    prisma.fare.count(),
    prisma.fare.findMany({
      orderBy: { basePrice: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});

export const POST = handler(async (req: Request) => {
  const user = await requireRole(UserRole.ADMIN);
  const body = await parseBody(req, fareSchema);

  const fare = await prisma.fare.create({ data: body });
  await audit({ userId: user.id, action: 'CREATE', entity: 'Fare', entityId: fare.id });
  return created(fare);
});
