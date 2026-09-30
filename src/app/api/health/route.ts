import { handler, ok } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Sonda de estado: verifica que la base responde. No expone datos sensibles.
 */
export const GET = handler(async () => {
  const startedAt = Date.now();

  let database: { status: string; latencyMs: number | null } = {
    status: 'down',
    latencyMs: null,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: 'up', latencyMs: Date.now() - startedAt };
  } catch {
    database = { status: 'down', latencyMs: null };
  }

  const healthy = database.status === 'up';

  return ok(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'aerogestion-uns',
      version: process.env.npm_package_version ?? '2.4.0',
      database,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});
