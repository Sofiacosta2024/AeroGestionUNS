import { NextResponse } from 'next/server';
import { ApiError, handler } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { bookingInclude, canViewBookingPii } from '@/lib/bookings';
import { buildPassPdf } from '@/lib/pdf/documents';
import { prisma } from '@/lib/prisma';
import { toTravelDocuments } from '@/lib/travel-documents';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ codigo: string }> };

/**
 * GET /api/v1/reservas/:codigo/comprobantes/pasaje
 *
 * Devuelve el pasaje en PDF como descarga binaria directa (Content-Disposition
 * attachment). Reutiliza los mismos builders que la pantalla de confirmación.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { codigo } = await ctx.params;

  const booking = await prisma.booking.findUnique({
    where: { bookingCode: codigo.toUpperCase() },
    include: bookingInclude,
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const user = await getCurrentUser();
  if (!canViewBookingPii(user, booking)) {
    throw ApiError.forbidden('No tiene permisos para ver esta reserva');
  }

  const payment = booking.payments.find((p) => p.status === 'APPROVED');
  if (!payment) throw ApiError.conflict('La reserva no tiene un pago aprobado');

  const pdf = buildPassPdf(toTravelDocuments(booking));
  const bytes = pdf.output('arraybuffer');

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="pasaje-${booking.bookingCode}.pdf"`,
      'Content-Length': String(bytes.byteLength),
    },
  });
});
