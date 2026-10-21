import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma, PrismaClient } from '@prisma/client';
import { enqueueReceipt } from '../src/lib/email/outbox';
import { publishPendingDispatches } from '../src/lib/email/queue';
import { sampleReceipt } from './fixtures/receipt';
test('outbox deduplica la emisión y congela destinatario y documentos originales', async () => {
  let stored: { id: string; snapshot: unknown } | null = null;
  const tx = { emailDispatch: { upsert: async ({ create, update }: { create: { snapshot: unknown }; update: unknown }) => {
    assert.deepEqual(update, {}); if (!stored) stored = { id: 'dispatch', snapshot: structuredClone(create.snapshot) }; return stored;
  } } } as unknown as Prisma.TransactionClient;
  const snapshot = sampleReceipt();
  const input = { paymentId: 'payment', bookingId: 'booking', dedupeKey: 'payment-payment', recipient: snapshot.recipient, snapshot };
  const first = await enqueueReceipt(tx, input); snapshot.documents.invoice.total = 900;
  assert.deepEqual(await enqueueReceipt(tx, input), first);
  assert.equal((stored!.snapshot as ReturnType<typeof sampleReceipt>).documents.invoice.total, 100);
});
test('Redis caído conserva la outbox; al volver se publica con ID estable', async () => {
  const db = { emailDispatch: { findMany: async () => [{ id: 'dispatch', attempts: 0 }] } } as unknown as PrismaClient;
  const keys: string[] = [];
  const queue = { add: async (_name: string, _data: unknown, options: { jobId: string }) => { keys.push(options.jobId); return {} as never; } };
  await assert.rejects(publishPendingDispatches({ add: async () => { throw new Error('Redis caído'); } }, db));
  await publishPendingDispatches(queue, db); await publishPendingDispatches(queue, db);
  assert.deepEqual(keys, ['dispatch-0', 'dispatch-0']);
});

test('relay de prueba consulta sólo pendientes del destinatario autorizado', async () => {
  const recipient = 'authorized@example.com'; let filter: unknown;
  const db = { emailDispatch: { findMany: async (args: { where: unknown }) => { filter = args.where; return []; } } } as unknown as PrismaClient;
  await publishPendingDispatches({ add: async () => { throw new Error('No hay trabajos'); } }, db, recipient);
  assert.equal((filter as { recipient: string }).recipient, recipient);
});
