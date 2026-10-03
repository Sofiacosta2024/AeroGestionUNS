import { UserRole } from '@prisma/client';
import { handler, ok, parseQuery } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { getItinerary } from '@/lib/scheduling/itinerary';
import { itineraryQuery } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** GET /api/itinerary?date=YYYY-MM-DD — planilla del dia (vuelos que salen ese dia, hora ART). */
export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);
  const { date } = parseQuery(req, itineraryQuery);
  return ok(await getItinerary(date));
});
