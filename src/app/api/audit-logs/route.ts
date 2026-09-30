import { UserRole } from '@prisma/client';
import { handler, ok, parseQuery } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/audit-logs — solo ADMIN. Auditoría RBAC del panel. */
export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);
  const { page, pageSize, userId, entity, action, from, to } = parseQuery(req, auditQuery);

  // `from` y `to` son dias completos e inclusivos: el limite superior es la
  // medianoche del dia SIGUIENTE, no la del propio `to`.
  const endOfTo = to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) : null;

  const where = {
    ...(userId ? { userId } : {}),
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(endOfTo ? { lt: endOfTo } : {}),
          },
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, email: true, role: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return ok({
    // `id` es BigInt: se serializa como string para no romper JSON.
    data: data.map((l) => ({ ...l, id: l.id.toString() })),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  });
});
