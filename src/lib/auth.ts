import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { UserRole, type User } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/api';

export const SESSION_COOKIE = 'ag_session';
const SHORT_SESSION_DAYS = 1; // sin "recordar sesion"
const LONG_SESSION_DAYS = 30; // con "recordar sesion"

export type AuthUser = Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'legajo'>;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * El token se genera en claro, se envia al cliente dentro de una cookie HttpOnly
 * y en la base solo se guarda su SHA-256: si alguien lee la tabla `sessions`
 * no puede suplantar a un usuario.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const days = remember ? LONG_SESSION_DAYS : SHORT_SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const hdrs = await headers();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: clientIp(hdrs),
      userAgent: hdrs.get('user-agent')?.slice(0, 256) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Devuelve el usuario de la sesion actual, o null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;

  const { id, email, role, firstName, lastName, legajo } = session.user;
  return { id, email, role, firstName, lastName, legajo };
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

function clientIp(hdrs: Headers): string | null {
  const fwd = hdrs.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip');
  return ip ? ip.slice(0, 64) : null;
}
