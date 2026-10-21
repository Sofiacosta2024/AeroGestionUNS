import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });
import { Queue, Worker } from 'bullmq';
import { prisma } from '../src/lib/prisma';
import { RECEIPT_QUEUE, publishPendingDispatches, redisConnection } from '../src/lib/email/queue';
import { processReceiptDispatch } from '../src/lib/email/processor';

async function main() {
  const connection = redisConnection();
  const recipient = process.env.RECEIPTS_TEST_RECIPIENT?.trim().toLowerCase();
  const queue = new Queue(RECEIPT_QUEUE, { connection });
  const worker = new Worker(RECEIPT_QUEUE, async job => {
    if (typeof job.data.dispatchId !== 'string') throw new Error('Despacho inválido');
    await processReceiptDispatch(job.data.dispatchId, { recipient });
  }, { connection, concurrency: 4 });
  queue.on('error', () => console.error('[receipts] Redis no disponible; los despachos siguen en la outbox'));
  worker.on('error', () => console.error('[receipts] Error del worker; revisar conectividad y outbox'));
  worker.on('failed', () => console.error('[receipts] Trabajo interrumpido; se recuperará desde la outbox'));
  let closing = false;
  const relay = async () => {
    try { await publishPendingDispatches(queue, prisma, recipient); }
    catch { console.error('[receipts] No se pudo publicar la outbox; se reintentará'); }
  };
  const shutdown = async () => { closing = true; await worker.close(); await queue.close(); await prisma.$disconnect(); };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  console.log('[receipts] Worker activo; sondeo cada 5 segundos');
  if (recipient) console.log('[receipts] Modo de prueba: envío limitado al destinatario configurado');
  while (!closing) { await relay(); if (!closing) await new Promise(resolve => setTimeout(resolve, 5000)); }
}
main().catch(() => { console.error('[receipts] No se pudo iniciar. Verifique configuración y migraciones.'); process.exitCode = 1; });
