import { handler, ok } from '@/lib/api';
import { receiveReceiptEvent } from '@/lib/email/webhook';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req: Request) => { await receiveReceiptEvent(req, prisma); return ok({ received: true }); });
