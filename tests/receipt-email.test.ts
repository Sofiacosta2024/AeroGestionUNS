import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleReceipt } from './fixtures/receipt';
import { buildReceiptAttachments } from '../src/lib/email/receipt-attachments';
import { renderReceiptEmail } from '../src/lib/email/receipt-template';
import { DeliveryError, sendReceiptEmail } from '../src/lib/email/provider';
import { formatExactArs } from '../src/lib/format';
import { receiptSender } from '../src/lib/email/config';
test('conserva el remitente de pruebas local y respeta el remitente configurado', async () => {
  const previousMode = process.env.NODE_ENV;
  const previousFrom = process.env.RESEND_FROM;
  try {
    Object.assign(process.env, { NODE_ENV: 'development' });
    delete process.env.RESEND_FROM;
    assert.equal(receiptSender(), 'AeroGestión UNS <onboarding@resend.dev>');
    await sendReceiptEmail(sampleReceipt(), 'local-test', { apiKey: 'fake', fetch: (async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).from, 'AeroGestión UNS <onboarding@resend.dev>');
      return Response.json({ id: 'local-provider' });
    }) as typeof fetch });
    process.env.RESEND_FROM = 'AeroGestión <ops@example.com>';
    assert.equal(receiptSender(), 'AeroGestión <ops@example.com>');
    assert.equal(receiptSender('Otra <other@example.com>'), 'Otra <other@example.com>');
    delete process.env.RESEND_FROM;
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.equal(receiptSender(), undefined);
  } finally {
    if (previousMode === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previousMode });
    if (previousFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousFrom;
  }
});
test('comprobantes y mostrador muestran centavos sin redondear el precio pactado', () => {
  assert.ok(formatExactArs('100.25').includes('100,25'));
});
test('WF-13 escapa nombres, muestra código, itinerario, clase y hora ART', () => {
  const snapshot = sampleReceipt(); snapshot.greetingName = '<img src=x onerror=alert(1)>';
  const content = renderReceiptEmail(snapshot);
  assert.ok(!content.html.includes('<img')); assert.ok(content.html.includes('&lt;img'));
  for (const value of ['ABC234', 'AG-1420', '06:45', '07:55', 'Economy', '12A']) assert.ok(content.text.includes(value));
});
test('dos PDFs válidos y payload idéntico entre reintentos incluso para nueve pasajeros', () => {
  const snapshot = sampleReceipt(); snapshot.documents.passes = Array.from({ length: 9 }, (_, i) => ({ ...snapshot.documents.passes[0]!, passengerName: `Lucía ${i}`, seat: `${i + 1}A` }));
  const first = buildReceiptAttachments(snapshot);
  assert.deepEqual(first.map(a => a.filename), ['Pasaje_ABC234.pdf', 'Factura_ABC234.pdf']);
  for (const a of first) assert.ok(Buffer.from(a.content, 'base64').subarray(0, 5).toString().startsWith('%PDF-'));
  assert.deepEqual(first, buildReceiptAttachments(snapshot));
});
test('proveedor recibe dos adjuntos, destinatario y clave estable sin enviar email real', async () => {
  const result = await sendReceiptEmail(sampleReceipt(), 'receipt-test', { apiKey: 'fake', from: 'ops@example.com', fetch: (async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.attachments.length, 2);
    assert.deepEqual(body.to, ['lucia@example.com']); assert.equal(new Headers(init?.headers).get('Idempotency-Key'), 'receipt-test');
    return Response.json({ id: 'provider-test' });
  }) as typeof fetch });
  assert.equal(result.providerMessageId, 'provider-test');
});
test('429 respeta Retry-After; 403 permanente; timeout es transitorio', async () => {
  for (const [status, retryable] of [[429, true], [503, true], [403, false]] as const)
    await assert.rejects(sendReceiptEmail(sampleReceipt(), 'test', { apiKey: 'fake', from: 'ops@example.com', fetch: (async () => new Response('{}', { status, headers: { 'Retry-After': '20' } })) as typeof fetch }),
      (e: unknown) => e instanceof DeliveryError && e.retryable === retryable && e.retryAfterMs === 20000);
  await assert.rejects(sendReceiptEmail(sampleReceipt(), 'test', { apiKey: 'fake', from: 'ops@example.com', fetch: (async () => { throw new Error('timeout'); }) as typeof fetch }), (e: unknown) => e instanceof DeliveryError && e.retryable);
});
