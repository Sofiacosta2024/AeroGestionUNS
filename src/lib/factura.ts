import { NextResponse } from 'next/server';
import { PaymentStatus, type Payment, type PrismaClient } from '@prisma/client';
import { ApiError, toErrorResponse } from './api';
import { PUBLIC_LOOKUP_MESSAGES, findPublicBooking, toPublicBookingView } from './public-booking';
import { bookingPublicLookupSchema } from './validation';
import { buildFacturaPdf } from './factura-pdf';

/**
 * Descarga de la factura (comprobante de pago) en PDF (US-14A).
 *
 * Mismo factor de autorizacion que la consulta (codigo + apellido de un
 * pasajero de la reserva). La factura documenta el pago APPROVED real de la
 * reserva: no se genera ninguna factura ficticia ni se afirma una emision
 * que no existio. Sin pago aprobado el endpoint responde 409 con un mensaje
 * honesto segun el estado real (pendiente o no disponible). El PDF se arma
 * a partir de la vista publica ya proyectada, por lo que no puede filtrar
 * DNI completo ni contactos.
 */

export const FACTURA_PENDING_MESSAGE =
  'La factura no está disponible hasta que el pago de la reserva sea aprobado';
export const FACTURA_UNAVAILABLE_MESSAGE =
  'La factura no está disponible para esta reserva';

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function pdfFilename(bookingCode: string): string {
  // El codigo siempre tiene la forma AG-XXXXXX (validada por el schema).
  return `factura-${bookingCode}.pdf`;
}

/** Selecciona el pago aprobado mas reciente (por fecha de pago o de alta). */
function latestApproved(payments: Payment[]): Payment | null {
  let best: Payment | null = null;
  let bestTime = -Infinity;
  for (const payment of payments) {
    if (payment.status !== PaymentStatus.APPROVED) continue;
    const time = (payment.paidAt ?? payment.createdAt).getTime();
    if (time >= bestTime) {
      best = payment;
      bestTime = time;
    }
  }
  return best;
}

/**
 * Handler del endpoint publico (`POST /api/v1/reservas/consulta/factura`).
 * Se separa del Route Handler para poder inyectar la conexion en las pruebas.
 */
export async function executeFacturaDownload(
  req: Request,
  db: PrismaClient,
): Promise<NextResponse> {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw ApiError.badRequest('El cuerpo de la peticion debe ser JSON valido');
    }

    const body = (raw ?? {}) as Record<string, unknown>;
    if (isMissing(body.code) || isMissing(body.lastName)) {
      throw ApiError.badRequest(PUBLIC_LOOKUP_MESSAGES.empty);
    }

    const { code, lastName } = bookingPublicLookupSchema.parse(raw);

    const booking = await findPublicBooking(db, { code, lastName });
    if (!booking) {
      // Misma respuesta para codigo inexistente y apellido incorrecto.
      throw ApiError.notFound(PUBLIC_LOOKUP_MESSAGES.notFound);
    }

    const payments = await db.payment.findMany({ where: { bookingId: booking.id } });
    const approved = latestApproved(payments);

    if (!approved) {
      const hasPending = payments.some((p) => p.status === PaymentStatus.PENDING);
      throw ApiError.conflict(
        hasPending ? FACTURA_PENDING_MESSAGE : FACTURA_UNAVAILABLE_MESSAGE,
      );
    }

    const view = toPublicBookingView(booking);
    const pdf = buildFacturaPdf({
      bookingCode: view.bookingCode,
      status: view.status,
      cabinClass: view.cabinClass,
      passengersCount: view.passengersCount,
      totalAmount: view.totalAmount,
      currency: view.currency,
      payment: {
        method: approved.method,
        amount: Number(approved.amount),
        currency: approved.currency,
        status: approved.status,
        paidAt: approved.paidAt,
        installments: approved.installments,
        transactionRef: approved.transactionRef,
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${pdfFilename(booking.bookingCode)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
