import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { quoteCounterSale } from '@/lib/mostrador/service';
import { counterQuoteSchema } from '@/lib/mostrador/validation';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req: Request) => {
  const user = await requireRole('MOSTRADOR');
  const quote = await quoteCounterSale(await parseBody(req, counterQuoteSchema), user);
  return ok({ totalAmount: quote.totalAmount, baseAmount: quote.baseAmount,
    seatSelectionAmount: quote.seatSelectionAmount, currency: quote.currency });
});
