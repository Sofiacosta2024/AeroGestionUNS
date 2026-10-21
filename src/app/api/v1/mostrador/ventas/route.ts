import { handler, ok, parseBody } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { createCounterSale } from '@/lib/mostrador/service';
import { counterSaleSchema } from '@/lib/mostrador/validation';
export const dynamic = 'force-dynamic';
export const POST = handler(async (req: Request) => {
  const user = await requireRole('MOSTRADOR');
  const result = await createCounterSale(await parseBody(req, counterSaleSchema), user);
  return ok(result, result.reused ? 200 : 201);
});
