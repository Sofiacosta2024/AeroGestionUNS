import { buildReceiptAttachments } from './receipt-attachments';
import { renderReceiptEmail } from './receipt-template';
import type { ReceiptSnapshot } from './types';
import { receiptSender } from './config';
export class DeliveryError extends Error {
  constructor(message: string, public retryable: boolean, public retryAfterMs = 0) { super(message); }
}
export async function sendReceiptEmail(snapshot: ReceiptSnapshot, idempotencyKey: string,
  options: { apiKey?: string; from?: string; fetch?: typeof fetch } = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const from = receiptSender(options.from);
  if (!apiKey || !from) throw new DeliveryError('Configure RESEND_API_KEY y RESEND_FROM', false);
  const content = renderReceiptEmail(snapshot);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey,
      }, body: JSON.stringify({ from, to: [snapshot.recipient], ...content,
        attachments: buildReceiptAttachments(snapshot).map(a => ({ filename: a.filename, content: a.content, content_type: a.contentType })) }),
    });
  } catch { throw new DeliveryError('No se pudo confirmar la respuesta del proveedor', true); }
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
    throw new DeliveryError(`El proveedor respondió HTTP ${response.status}`, response.status >= 500 || response.status === 429, Number.isFinite(retryMs) ? retryMs : 0);
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new DeliveryError('Respuesta incompleta del proveedor', true); }
  if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string')
    throw new DeliveryError('Respuesta incompleta del proveedor', true);
  return { providerMessageId: result.id };
}
