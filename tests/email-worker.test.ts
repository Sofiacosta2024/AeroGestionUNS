import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { processReceiptDispatch, MAX_EMAIL_ATTEMPTS } from '../src/lib/email/processor';
import { DeliveryError } from '../src/lib/email/provider';
import { sampleReceipt } from './fixtures/receipt';
function fixture() {
  let clock = new Date('2026-10-21T00:00:00Z');
  const row = { id: 'dispatch', recipient: sampleReceipt().recipient, attempts: 0, status: 'PENDIENTE', snapshot: sampleReceipt(),
    nextAttemptAt: clock, leaseUntil: null as Date | null, leaseToken: null as string | null, lastError: null as string | null, providerMessageId: null as string | null };
  const history: unknown[] = [];
  const db = { $queryRaw: async () => [],
    emailDispatch: {
      findUnique: async () => ({ ...row }),
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, data, { attempts: typeof data.attempts === 'object' ? row.attempts + 1 : row.attempts }); return { ...row }; },
      updateMany: async ({ where, data }: { where: { leaseToken: string }; data: Record<string, unknown> }) => {
        if (row.leaseToken !== where.leaseToken) return { count: 0 }; Object.assign(row, data); return { count: 1 };
      },
    }, emailDispatchAttempt: { create: async (v: unknown) => { history.push(v); }, update: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  } as unknown as PrismaClient;
  return { row, history, db, now: () => clock, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
test('worker aplica intento inicial más tres reintentos y termina FALLIDO', async () => {
  const f = fixture(); const keys: string[] = [];
  const send = async (_snapshot: unknown, key: string) => { keys.push(key); throw new DeliveryError('SMTP caído', true); };
  for (const delay of [5000, 15000, 30000, 0]) {
    await processReceiptDispatch('dispatch', { db: f.db, now: f.now, send });
    if (delay) { assert.equal(f.row.nextAttemptAt.getTime() - f.now().getTime(), delay); f.advance(delay); }
  }
  assert.equal(f.row.status, 'FALLIDO'); assert.equal(f.row.attempts, MAX_EMAIL_ATTEMPTS); assert.equal(f.history.length, 4);
  assert.equal(new Set(keys).size, 1); await processReceiptDispatch('dispatch', { db: f.db, now: f.now, send }); assert.equal(keys.length, 4);
});

test('worker de prueba ignora trabajos de otros destinatarios sin consumir intentos', async () => {
  const f = fixture(); let sent = 0;
  await processReceiptDispatch('dispatch', { db: f.db, now: f.now, recipient: 'authorized@example.com',
    send: async () => { sent++; return { providerMessageId: 'email' }; } });
  assert.equal(sent, 0); assert.equal(f.row.attempts, 0); assert.equal(f.history.length, 0);
  await processReceiptDispatch('dispatch', { db: f.db, now: f.now, recipient: f.row.recipient,
    send: async () => { sent++; return { providerMessageId: 'email' }; } });
  assert.equal(sent, 1);
});
test('credenciales inválidas fallan sin reintentos; una aceptación no vuelve a enviarse', async () => {
  const f = fixture(); await processReceiptDispatch('dispatch', { db: f.db, now: f.now, send: async () => { throw new DeliveryError('Credencial inválida', false); } });
  assert.equal(f.row.status, 'FALLIDO'); assert.equal(f.row.attempts, 1);
  const g = fixture(); let count = 0; const send = async () => { count++; return { providerMessageId: 'email-1' }; };
  await processReceiptDispatch('dispatch', { db: g.db, now: g.now, send }); await processReceiptDispatch('dispatch', { db: g.db, now: g.now, send });
  assert.equal(count, 1); assert.equal(g.row.status, 'ENVIADO'); assert.equal(g.row.providerMessageId, 'email-1');
});
test('lease activo impide envío duplicado y uno vencido se recupera al reiniciar', async () => {
  const f = fixture(); f.row.leaseUntil = new Date(f.now().getTime() + 90000); let calls = 0;
  const send = async () => { calls++; return { providerMessageId: 'email' }; };
  await processReceiptDispatch('dispatch', { db: f.db, now: f.now, send }); assert.equal(calls, 0);
  f.advance(91000); await processReceiptDispatch('dispatch', { db: f.db, now: f.now, send }); assert.equal(calls, 1);
});
