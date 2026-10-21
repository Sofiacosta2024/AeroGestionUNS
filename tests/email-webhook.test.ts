import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'svix';
import type { PrismaClient } from '@prisma/client';
import { receiveReceiptEvent } from '../src/lib/email/webhook';
const secret = `whsec_${Buffer.from('test-only-webhook-secret-32-chars!').toString('base64')}`;
test('webhook exige firma válida y deduplica entregas sin borrar rebotes', async () => {
  const events: Record<string, Date | null> = { deliveredAt: null, bouncedAt: null };
  const db = { emailDispatch: {
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, Date> }) => {
      const field = Object.keys(data)[0]!; if (where[field] === null && events[field]) return { count: 0 }; Object.assign(events, data); return { count: 1 };
    }, findUnique: async () => ({ id: 'dispatch' }),
  } } as unknown as PrismaClient;
  await assert.rejects(receiveReceiptEvent(new Request('http://localhost', { method: 'POST', body: '{}' }), db, secret), /Firma/);
  async function deliver(type: string) {
    const body = JSON.stringify({ type, created_at: '2026-10-21T00:00:00.000Z', data: { email_id: 'provider-1' } });
    const at = new Date(); const id = 'msg_test';
    await receiveReceiptEvent(new Request('http://localhost', { method: 'POST', body, headers: {
      'svix-id': id, 'svix-timestamp': String(Math.floor(at.getTime() / 1000)), 'svix-signature': new Webhook(secret).sign(id, at, body),
    } }), db, secret);
  }
  await deliver('email.delivered'); await deliver('email.delivered'); await deliver('email.bounced');
  assert.ok(events.deliveredAt); assert.ok(events.bouncedAt);
});
