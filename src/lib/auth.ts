import { auth, currentUser } from '@clerk/nextjs/server';
import { UserRole, type User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/api';

export type AuthUser = Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'legajo'>;

function toAuthUser(u: User): AuthUser {
  const { id, email, role, firstName, lastName, legajo } = u;
  return { id, email, role, firstName, lastName, legajo };
}

function parseRole(value: unknown): UserRole {
  return value === 'ADMIN' || value === 'MOSTRADOR' ? (value as UserRole) : UserRole.PASAJERO;
}

/** Usuario actual (Clerk como fuente de identidad y rol, Prisma como perfil), o null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const role = parseRole(sessionClaims?.metadata?.role);

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) {
    if (!existing.isActive) return null;
    if (existing.role !== role) {
      const updated = await prisma.user.update({ where: { id: existing.id }, data: { role } });
      return toAuthUser(updated);
    }
    return toAuthUser(existing);
  }

  // Primer ingreso: sincronizacion perezosa con Clerk
  const cu = await currentUser();
  const primary = cu?.primaryEmailAddress;
  if (!cu || !primary || primary.verification?.status !== 'verified') return null;
  const email = primary.emailAddress.toLowerCase();

  // Si ya existia un usuario con ese mail (ej. cargado por el seed), se vincula
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && !byEmail.clerkId) {
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkId: userId, role },
    });
    return linked.isActive ? toAuthUser(linked) : null;
  }

  try {
    const fallbackName = email.split('@')[0] ?? 'Usuario';

        const created = await prisma.user.create({
          data: {
            clerkId: userId,
            email,
            role,
            firstName: cu.firstName?.slice(0, 80) || fallbackName,
            lastName: cu.lastName?.slice(0, 80) || '-',
          },
        });
    return toAuthUser(created);
  } catch {
    // Dos requests simultaneas en el primer ingreso: el otro ya lo creo
    const again = await prisma.user.findUnique({ where: { clerkId: userId } });
    return again?.isActive ? toAuthUser(again) : null;
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

/** Guard por rol: ADMIN > MOSTRADOR > PASAJERO */
const RANK: Record<UserRole, number> = {
  [UserRole.PASAJERO]: 1,
  [UserRole.MOSTRADOR]: 2,
  [UserRole.ADMIN]: 3,
};

export async function requireRole(min: UserRole): Promise<AuthUser> {
  const user = await requireUser();
  if (RANK[user.role] < RANK[min]) {
    throw ApiError.forbidden(`Requiere permisos de ${min} o superiores`);
  }
  return user;
}

export function canManage(user: AuthUser | null): boolean {
  return !!user && RANK[user.role] >= RANK[UserRole.MOSTRADOR];
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === UserRole.ADMIN;
}