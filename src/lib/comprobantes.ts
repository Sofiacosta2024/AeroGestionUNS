import { NextResponse } from 'next/server';
import type { jsPDF } from 'jspdf';
import type { PaymentStatus } from '@prisma/client';
import { ApiError } from './api';
import { getCurrentUser, type AuthUser } from './auth';
import {
  canViewBookingPii,
  comprobanteInclude,
  type BookingForDocuments,
} from './bookings';
import { prisma } from './prisma';
import { toTravelDocuments, type TravelDocuments } from './travel-documents';

/**
 * Acceso a los comprobantes de una reserva (US-05).
 *
 * Reutiliza la misma autorizacion que la pantalla de confirmacion (dueño u
 * Operations) y ademas exige un pago aprobado: sin cobro no hay comprobante.
 * Separado del acceso a datos para poder testear la regla sin base de datos.
 */

/** Lo minimo que necesita la regla de acceso. */
type ComprobanteBooking = {
  userId: string | null;
  payments: { status: PaymentStatus }[];
};

export function requireComprobanteAccess<B extends ComprobanteBooking>(
  user: AuthUser | null,
  booking: B,
): B['payments'][number] {
  if (!canViewBookingPii(user, booking))
    throw ApiError.forbidden('No tiene permisos para ver esta reserva');

  const payment = booking.payments.find((p) => p.status === 'APPROVED');
  if (!payment) throw ApiError.conflict('La reserva no tiene un pago aprobado');

  return payment;
}

/**
 * Carga una reserva para emitir un comprobante. Compartido por los endpoints de
 * pasaje y factura: 404 si el codigo no existe, 403 si el usuario no puede ver
 * los datos personales y 409 si todavia no hay un pago aprobado.
 *
 * Usa `comprobanteInclude` (9 consultas) en lugar de `bookingInclude` (13).
 */
export async function loadComprobanteContext(codigo: string): Promise<{
  booking: BookingForDocuments;
  payment: BookingForDocuments['payments'][number];
  documents: TravelDocuments;
}> {
  const booking = await prisma.booking.findUnique({
    where: { bookingCode: codigo.toUpperCase() },
    include: comprobanteInclude,
  });
  if (!booking) throw ApiError.notFound('Reserva no encontrada');

  const user = await getCurrentUser();
  const payment = requireComprobanteAccess(user, booking);

  return { booking, payment, documents: toTravelDocuments(booking) };
}

/**
 * Descarga binaria directa del PDF. `handler` completa el `cache-control`
 * `no-store`, asi el comprobante no queda en caches intermedios.
 */
export function pdfResponse(pdf: jsPDF, filename: string): NextResponse {
  const bytes = pdf.output('arraybuffer');
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
    },
  });
}
