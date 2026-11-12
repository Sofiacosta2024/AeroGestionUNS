import { Prisma, UserRole } from '@prisma/client';
import { handler, ok, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type RecordRow = {
  flightId: string; code: string; status: string; departureAt: Date;
  origin: string; destination: string; cabinClass: string;
  capacity: bigint | number; sold: bigint | number;
};

const statusMap: Record<string, string> = {
  PROGRAMADO: 'PROGRAMADO', EN_EMBARQUE: 'EN_EMBARQUE', COMPLETADO: 'COMPLETADO', CANCELADO: 'CANCELADO',
};

function dashboardStatus(status: string, departureAt: Date, now: Date): string {
  if (status === 'CANCELLED') return 'CANCELADO';
  if (status === 'ARRIVED') return 'COMPLETADO';
  if (status === 'BOARDING' || status === 'DEPARTED') return 'EN_EMBARQUE';
  if (departureAt <= now) return 'COMPLETADO';
  return 'PROGRAMADO';
}

export const GET = handler(async (request: Request) => {
  await requireRole(UserRole.ADMIN);
  const status = new URL(request.url).searchParams.get('estado') ?? 'TODOS';
  if (status !== 'TODOS' && !statusMap[status]) throw ApiError.badRequest('El estado indicado no es válido.');
  const records = await prisma.$queryRaw<RecordRow[]>(Prisma.sql`
    WITH sold_by_fare AS (
      SELECT bf.flight_id, bf.fare_id, SUM(b.passengers_count)::bigint AS passengers
      FROM booking_flights bf
      JOIN bookings b ON b.id = bf.booking_id
      WHERE b.status::text NOT IN ('PENDING', 'CANCELLED')
        AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status::text = 'APPROVED')
      GROUP BY bf.flight_id, bf.fare_id
    ), sold AS (
      SELECT s.flight_id,
        CASE
          WHEN fare.cabin_class::text IN ('FIRST', 'BUSINESS') OR fare.name ILIKE '%primera%' THEN 'FIRST'
          WHEN fare.code = 'ECON-FLEX' OR fare.name ILIKE '%premium%' THEN 'PREMIUM'
          ELSE 'ECONOMY'
        END AS cabin_class,
        SUM(s.passengers)::bigint AS passengers
      FROM sold_by_fare s
      JOIN fares fare ON fare.id = s.fare_id
      GROUP BY s.flight_id, 2
    ), capacity AS (
      SELECT ff.flight_id,
        CASE
          WHEN fare.cabin_class::text IN ('FIRST', 'BUSINESS') OR fare.name ILIKE '%primera%' THEN 'FIRST'
          WHEN fare.code = 'ECON-FLEX' OR fare.name ILIKE '%premium%' THEN 'PREMIUM'
          ELSE 'ECONOMY'
        END AS cabin_class,
        SUM(COALESCE(ff.seat_capacity, ff.available_seats + COALESCE(s.passengers, 0)))::bigint AS seats
      FROM flight_fares ff
      JOIN fares fare ON fare.id = ff.fare_id
      LEFT JOIN sold_by_fare s ON s.flight_id = ff.flight_id AND s.fare_id = ff.fare_id
      GROUP BY ff.flight_id, 2
    )
    SELECT f.id AS "flightId", f.code, f.status::text AS status, f.departure_at AS "departureAt",
      origin."iataCode" AS origin, destination."iataCode" AS destination,
      c.cabin_class AS "cabinClass", c.seats AS capacity, COALESCE(s.passengers, 0)::bigint AS sold
    FROM flights f
    JOIN routes r ON r.id = f.route_id
    JOIN airports origin ON origin."iataCode" = r.origin_airport_id
    JOIN airports destination ON destination."iataCode" = r.destination_airport_id
    LEFT JOIN capacity c ON c.flight_id = f.id AND c.cabin_class IN ('ECONOMY', 'PREMIUM', 'FIRST')
    LEFT JOIN sold s ON s.flight_id = f.id AND s.cabin_class = c.cabin_class
    ORDER BY f.departure_at ASC
  `);

  const now = new Date();
  const byFlight = new Map<string, { id: string; code: string; status: string; departureAt: string; route: string; classes: Record<string, { sold: number; capacity: number }> }>();
  for (const row of records) {
    const flightStatus = dashboardStatus(row.status, row.departureAt, now);
    if (status !== 'TODOS' && flightStatus !== statusMap[status]) continue;
    let flight = byFlight.get(row.flightId);
    if (!flight) {
      flight = { id: row.flightId, code: row.code, status: flightStatus, departureAt: row.departureAt.toISOString(), route: `${row.origin} → ${row.destination}`, classes: {} };
      byFlight.set(row.flightId, flight);
    }
    if (row.cabinClass) flight.classes[row.cabinClass] = { sold: Number(row.sold), capacity: Number(row.capacity) };
  }
  const flights = [...byFlight.values()];
  const totalSold = flights.reduce((sum, flight) => sum + Object.values(flight.classes).reduce((n, c) => n + c.sold, 0), 0);
  const totalCapacity = flights.reduce((sum, flight) => sum + Object.values(flight.classes).reduce((n, c) => n + c.capacity, 0), 0);
  return ok({ flights, summary: { totalSold, totalCapacity, averageLoadFactorPct: totalCapacity ? totalSold / totalCapacity * 100 : 0, activeFlights: flights.length } });
});
