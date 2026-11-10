import { Prisma, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { ApiError, handler, ok } from '@/lib/api';
import { getAnalyticsDateRange } from '@/lib/admin-analytics';
import { analyticsCsvLine, formatCsvDecimal } from '@/lib/admin-analytics-csv';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type AnalyticsRecord = {
  routeId: string;
  route: string;
  fareCode: string;
  fareName: string;
  ticketCount: bigint | number;
  grossAmount: Prisma.Decimal | string | number;
  capacitySeats: bigint | number;
};

type SummaryRecord = {
  totalTickets: bigint | number;
  totalGrossAmount: Prisma.Decimal | string | number;
  capacitySeats: bigint | number;
};

export const GET = handler(async (req: Request) => {
  await requireRole(UserRole.ADMIN);

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  if (!startDate || !endDate) {
    throw ApiError.badRequest('La fecha de inicio y la fecha de fin son obligatorias.');
  }
  const { from, until } = getAnalyticsDateRange(startDate, endDate);

  const routeId = url.searchParams.get('routeId')?.trim() || null;
  const fareCode = url.searchParams.get('fareCode')?.trim() || null;
  if (fareCode && fareCode.length > 24) {
    throw ApiError.badRequest('La clase seleccionada no es válida.');
  }
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    throw ApiError.badRequest('El formato solicitado no es válido.');
  }

  const routeFilter = routeId ? Prisma.sql`AND r.id = ${routeId}` : Prisma.empty;
  const classFilter = fareCode
    ? Prisma.sql`AND fare.code = ${fareCode}`
    : Prisma.empty;

  const records = await prisma.$queryRaw<AnalyticsRecord[]>(Prisma.sql`
    WITH sold AS (
      SELECT
        r.id AS "routeId",
        origin."iataCode" || '→' || destination."iataCode" AS route,
        fare.code AS "fareCode",
        fare.name AS "fareName",
        fare.cabin_class::text AS "physicalCabin",
        f.aircraft_id AS "aircraftId",
        SUM(b.passengers_count)::bigint AS "ticketCount",
        SUM(bf.price * b.passengers_count + bf.seat_selection_amount) AS "grossAmount",
        COALESCE(MAX(ff.seat_capacity), 0)::numeric AS "offeredCapacity"
      FROM booking_flights bf
      JOIN bookings b ON b.id = bf.booking_id
      JOIN flights f ON f.id = bf.flight_id
      JOIN routes r ON r.id = f.route_id
      JOIN airports origin ON origin."iataCode" = r.origin_airport_id
      JOIN airports destination ON destination."iataCode" = r.destination_airport_id
      JOIN fares fare ON fare.id = bf.fare_id
      LEFT JOIN flight_fares ff ON ff.flight_id = f.id AND ff.fare_id = fare.id
      WHERE b.created_at >= ${from}
        AND b.created_at < ${until}
        AND b.status::text NOT IN ('PENDING', 'CANCELLED')
        AND EXISTS (
          SELECT 1 FROM payments payment
          WHERE payment.booking_id = b.id AND payment.status::text = 'APPROVED'
        )
        ${routeFilter}
        ${classFilter}
      GROUP BY r.id, route, fare.cabin_class, f.id, f.aircraft_id, fare.code, fare.name
    )
    SELECT
      sold."routeId",
      sold.route,
      sold."fareCode",
      sold."fareName",
      SUM(sold."ticketCount")::bigint AS "ticketCount",
      SUM(sold."grossAmount") AS "grossAmount",
      SUM(
        CASE WHEN physical.seat_count > 0
          THEN physical.seat_count
          ELSE sold."offeredCapacity"
        END
      )::numeric AS "capacitySeats"
    FROM sold
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::numeric AS seat_count
      FROM seats seat
      WHERE seat.aircraft_id = sold."aircraftId"
        AND seat.cabin_class::text = sold."physicalCabin"
    ) physical ON true
    GROUP BY sold."routeId", sold.route, sold."fareCode", sold."fareName"
    ORDER BY sold.route, sold."fareName"
  `);

  const rows = records.map((record) => {
    const ticketCount = Number(record.ticketCount);
    const grossAmount = Number(record.grossAmount);
    const capacitySeats = Number(record.capacitySeats);
    return {
      routeId: record.routeId,
      route: record.route,
      fareCode: record.fareCode,
      classLabel: record.fareName,
      ticketCount,
      grossAmount,
      capacitySeats,
      loadFactorPct: capacitySeats > 0 ? (ticketCount / capacitySeats) * 100 : 0,
    };
  });

  if (format === 'csv') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(
          `\uFEFF${analyticsCsvLine(['Ruta', 'Clase', 'Pasajes vendidos', 'Facturación bruta ($)', 'Load Factor (%)'])}\r\n`,
        ));
        for (const row of rows) {
          controller.enqueue(
            encoder.encode(`${analyticsCsvLine([
              row.route,
              row.classLabel,
              row.ticketCount,
              formatCsvDecimal(row.grossAmount, 2),
              formatCsvDecimal(row.loadFactorPct, 1),
            ])}\r\n`),
          );
        }
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="reporte-analitico-${startDate}-${endDate}.csv"`,
      },
    });
  }

  const [summaryRecord] = await prisma.$queryRaw<SummaryRecord[]>(Prisma.sql`
    WITH physical_sales AS (
      SELECT
        r.id AS "routeId",
        f.id AS "flightId",
        f.aircraft_id AS "aircraftId",
        fare.cabin_class::text AS "physicalCabin",
        SUM(b.passengers_count)::bigint AS "ticketCount",
        SUM(bf.price * b.passengers_count + bf.seat_selection_amount) AS "grossAmount",
        COALESCE(MAX(ff.seat_capacity), 0)::numeric AS "offeredCapacity"
      FROM booking_flights bf
      JOIN bookings b ON b.id = bf.booking_id
      JOIN flights f ON f.id = bf.flight_id
      JOIN routes r ON r.id = f.route_id
      JOIN fares fare ON fare.id = bf.fare_id
      LEFT JOIN flight_fares ff ON ff.flight_id = f.id AND ff.fare_id = fare.id
      WHERE b.created_at >= ${from}
        AND b.created_at < ${until}
        AND b.status::text NOT IN ('PENDING', 'CANCELLED')
        AND EXISTS (
          SELECT 1 FROM payments payment
          WHERE payment.booking_id = b.id AND payment.status::text = 'APPROVED'
        )
        ${routeFilter}
        ${classFilter}
      GROUP BY r.id, f.id, f.aircraft_id, fare.cabin_class
    )
    SELECT
      COALESCE(SUM(sales."ticketCount"), 0)::bigint AS "totalTickets",
      COALESCE(SUM(sales."grossAmount"), 0)::numeric AS "totalGrossAmount",
      COALESCE(SUM(
        CASE WHEN physical.seat_count > 0
          THEN physical.seat_count
          ELSE sales."offeredCapacity"
        END
      ), 0)::numeric AS "capacitySeats"
    FROM physical_sales sales
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::numeric AS seat_count
      FROM seats seat
      WHERE seat.aircraft_id = sales."aircraftId"
        AND seat.cabin_class::text = sales."physicalCabin"
    ) physical ON true
  `);
  const totalTickets = Number(summaryRecord?.totalTickets ?? 0);
  const totalGrossAmount = Number(summaryRecord?.totalGrossAmount ?? 0);
  const totalCapacity = Number(summaryRecord?.capacitySeats ?? 0);

  return ok({
    period: { startDate, endDate },
    rows,
    summary: {
      totalTickets,
      totalGrossAmount,
      averageLoadFactorPct: totalCapacity > 0 ? (totalTickets / totalCapacity) * 100 : 0,
    },
  });
});
