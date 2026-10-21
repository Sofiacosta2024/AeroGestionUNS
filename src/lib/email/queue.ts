import { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
export const RECEIPT_QUEUE = 'receipt-emails';
export function redisConnection() {
  if (!process.env.REDIS_URL) throw new Error('Configure REDIS_URL para ejecutar el worker de comprobantes');
  const url = new URL(process.env.REDIS_URL);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') throw new Error('REDIS_URL debe usar redis:// o rediss://');
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined, db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null };
}
/** Re-publicar pendientes es seguro; la BD reclama cada despacho con un lease. */
export async function publishPendingDispatches(queue: Pick<Queue, 'add'>, db: PrismaClient = prisma, recipient?: string) {
  const now = new Date();
  const rows = await db.emailDispatch.findMany({ where: { status: 'PENDIENTE', ...(recipient ? { recipient } : {}), nextAttemptAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { queuedAt: 'asc' }, take: 100, select: { id: true, attempts: true } });
  for (const row of rows) await queue.add('receipt', { dispatchId: row.id }, {
    jobId: `${row.id}-${row.attempts}`, removeOnComplete: true, removeOnFail: true,
  });
  return rows.length;
}
