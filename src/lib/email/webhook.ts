import { Webhook } from 'svix';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../api';
const eventSchema = z.object({ type: z.string(), created_at: z.string().datetime(),
  data: z.object({ email_id: z.string() }) });
export async function receiveReceiptEvent(req: Request, db: PrismaClient, secret = process.env.RESEND_WEBHOOK_SECRET) {
  if (!secret) throw new ApiError(503, 'El webhook de correo no está configurado');
  const body = await req.text();
  let raw: unknown;
  try { new Webhook(secret).verify(body, {
    'svix-id': req.headers.get('svix-id') ?? '', 'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }); raw = JSON.parse(body); } catch { throw ApiError.unauthorized('Firma de webhook inválida'); }
  const event = eventSchema.parse(raw);
  if (event.type !== 'email.delivered' && event.type !== 'email.bounced') return;
  const field = event.type === 'email.delivered' ? 'deliveredAt' : 'bouncedAt';
  const changed = await db.emailDispatch.updateMany({ where: { providerMessageId: event.data.email_id, [field]: null },
    data: { [field]: new Date(event.created_at) } });
  // Si el evento se adelantó al commit del worker, pedir reintento al proveedor.
  if (!changed.count && !await db.emailDispatch.findUnique({ where: { providerMessageId: event.data.email_id } }))
    throw new ApiError(503, 'El despacho aún no está registrado. Reintentar evento.');
}
