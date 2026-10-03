import { UserRole } from '@prisma/client';
import { clerkClient } from '@clerk/nextjs/server';
import { ApiError, handler, noContent, ok, parseBody } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireRole, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateUserSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/users/:id — el propio usuario o un ADMIN. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  if (me.role !== UserRole.ADMIN && me.id !== id) {
    throw ApiError.forbidden('No tiene permisos para ver este usuario');
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      legajo: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      passenger: true,
    },
  });

  if (!user) throw ApiError.notFound('Usuario no encontrado');
  return ok(user);
});

/** PATCH /api/users/:id */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const me = await requireUser();
  const body = await parseBody(req, updateUserSchema);

  const isSelf = me.id === id;
  const isAdmin = me.role === UserRole.ADMIN;

  if (!isSelf && !isAdmin) throw ApiError.forbidden('No tiene permisos para modificar este usuario');
  // Un usuario no puede cambiar su propio rol ni su estado.
  if (isSelf && !isAdmin && (body.role !== undefined || body.isActive !== undefined)) {
    throw ApiError.forbidden('No puede modificar su propio rol ni estado');
  }

   const target = await prisma.user.findUnique({ where: { id }, select: { clerkId: true } });
  if (!target) throw ApiError.notFound('Usuario no encontrado');

  const { password, ...rest } = body;
  const needsClerk = password || rest.role !== undefined || rest.isActive !== undefined;
  if (needsClerk && !target.clerkId) {
    throw ApiError.badRequest('El usuario todavia no inicio sesion con Clerk');
  }

  if (target.clerkId && needsClerk) {
    const client = await clerkClient();
    if (password) await client.users.updateUser(target.clerkId, { password });
    if (rest.role !== undefined) {
      await client.users.updateUserMetadata(target.clerkId, {
        publicMetadata: { role: rest.role },
      });
    }
    if (rest.isActive === false) await client.users.banUser(target.clerkId);
    if (rest.isActive === true) await client.users.unbanUser(target.clerkId);
  }

  const user = await prisma.user.update({
    where: { id },
    data: rest,
    select: { id: true, email: true, role: true, legajo: true, firstName: true, lastName: true, isActive: true },
  });

  await audit({
    userId: me.id,
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    metadata: { fields: Object.keys(rest), passwordChanged: Boolean(password) },
  });

  return ok(user);
});

/** DELETE /api/users/:id — solo ADMIN. Elimina el acceso sin borrar el historial. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await requireRole(UserRole.ADMIN);

  if (admin.id === id) throw ApiError.badRequest('No puede eliminar su propio usuario');

  const target = await prisma.user.findUnique({ where: { id }, select: { clerkId: true } });
  if (!target) throw ApiError.notFound('Usuario no encontrado');

  await prisma.user.update({ where: { id }, data: { isActive: false } });
  if (target.clerkId) {
    const client = await clerkClient();
    await client.users.banUser(target.clerkId);
  }

  await audit({ userId: admin.id, action: 'DEACTIVATE', entity: 'User', entityId: id });
  return noContent();
});
