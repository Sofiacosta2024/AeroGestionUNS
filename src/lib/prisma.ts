import { PrismaClient } from '@prisma/client';

/**
 * Instancia unica de Prisma Client.
 *
 * En desarrollo Next.js recarga los modulos en cada cambio de archivo (HMR), y
 * sin este cache se abriria un pool de conexiones nuevo por recarga hasta agotar
 * los slots de PostgreSQL. Guardamos el cliente en `globalThis` para reutilizarlo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
