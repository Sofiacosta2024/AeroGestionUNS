import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AuthUser } from '@/lib/auth';

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

/**
 * Registra una accion en `audit_logs`.
 * Nunca debe romper la operacion principal: si falla el log, la peticion sigue.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    let ipAddress: string | null = null;
    try {
      const hdrs = await headers();
      ipAddress =
        hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        hdrs.get('x-real-ip') ??
        null;
      if (ipAddress) ipAddress = ipAddress.slice(0, 64);
    } catch {
      // fuera de un request (ej. scripts): se deja null
    }

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
        ipAddress,
      },
    });
  } catch (err) {
    console.error('[audit] no se pudo registrar la accion:', err);
  }
}

export function auditFrom(user: AuthUser | null): Pick<AuditInput, 'userId'> {
  return { userId: user?.id ?? null };
}
