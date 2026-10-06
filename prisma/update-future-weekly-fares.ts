import { PrismaClient, DemandLevel } from '@prisma/client';

const prisma = new PrismaClient();

const DAY_FACTOR = [1.12, 1.0, 1.0, 1.02, 1.08, 1.22, 1.1];

const BASE_BY_ROUTE: Record<string, number> = {
  'BHI-AEP': 64200,
  'AEP-BHI': 64200,
  'BHI-EZE': 66800,
  'BHI-MDZ': 88500,
  'BHI-COR': 84200,
};

const toYmd = (d: Date) => d.toISOString().slice(0, 10);

const addDays = (d: Date, days: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const weekdayOf = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

const priced = (base: number, dateStr: string) =>
  Math.round((base * DAY_FACTOR[weekdayOf(dateStr)]!) / 100) * 100;

async function main() {
  const routes = await prisma.route.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });

  const start = new Date();
  const end = addDays(new Date(), 90);

  let current = new Date(start);
  let count = 0;

  while (current <= end) {
    const dateStr = toYmd(current);
    const date = new Date(`${dateStr}T00:00:00Z`);

    for (const route of routes) {
      const base = BASE_BY_ROUTE[route.code] ?? 64200;
      const price = priced(base, dateStr);
      const demandLevel = DAY_FACTOR[weekdayOf(dateStr)]! >= 1.15 ? DemandLevel.HIGH : DemandLevel.NORMAL;

      await prisma.weeklyFare.upsert({
        where: {
          routeId_date: {
            routeId: route.id,
            date,
          },
        },
        update: {
          price,
          demandLevel,
          currency: 'ARS',
        },
        create: {
          routeId: route.id,
          date,
          price,
          demandLevel,
          currency: 'ARS',
        },
      });
    }

    count++;
    current = addDays(current, 1);
  }

  console.log(`Weekly fares actualizados para ${count} días y ${routes.length} rutas`);
}

main()
  .catch((error) => {
    console.error('Error actualizando weekly fares:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
