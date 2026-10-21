/**
 * Backfill de comprobantes emitidos (RF-05)
 *
 * Registra los comprobantes de las reservas que ya estaban pagas antes de que
 * existiera la tabla `comprobantes`. Reutiliza la misma regla que la app
 * (`emitirComprobantes`), asi el backfill y el flujo normal no se pueden
 * desincronizar.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar registros.
 *
 *   npx tsx prisma/backfill-comprobantes.ts
 */
import { PrismaClient } from '@prisma/client';
import { emitirComprobantes } from '../src/lib/comprobante-emission';

const prisma = new PrismaClient();

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { payments: { some: { status: 'APPROVED' } } },
    select: {
      id: true,
      bookingCode: true,
      payments: {
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true, transactionRef: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const booking of bookings) {
    const payment = booking.payments[0];
    if (!payment) continue;
    await emitirComprobantes(prisma, payment, booking.id);
    console.log(`  ${booking.bookingCode}: pasaje y factura registrados`);
  }

  console.log(`Backfill comprobantes: ${bookings.length} reservas pagas procesadas`);
}

main()
  .catch((error) => {
    console.error('Error en el backfill de comprobantes:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
