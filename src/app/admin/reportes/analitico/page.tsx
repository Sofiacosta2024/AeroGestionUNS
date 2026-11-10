import { prisma } from '@/lib/prisma';
import { requireAdminPage } from '../../require-admin';
import AnalyticsReport from './report-client';

export const dynamic = 'force-dynamic';

export default async function AnalyticsReportPage() {
  await requireAdminPage();
  const [routes, fares] = await Promise.all([
    prisma.route.findMany({
      include: {
        originAirport: { select: { iataCode: true } },
        destinationAirport: { select: { iataCode: true } },
      },
      orderBy: [{ originAirportId: 'asc' }, { destinationAirportId: 'asc' }],
    }),
    prisma.fare.findMany({
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <AnalyticsReport
      routes={routes.map((route) => ({
        value: route.id,
        label: `${route.originAirport.iataCode} → ${route.destinationAirport.iataCode}`,
      }))}
      classes={fares.map((fare) => ({
        value: fare.code,
        label: fare.name,
      }))}
    />
  );
}
