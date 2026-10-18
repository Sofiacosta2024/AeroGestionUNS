import { NextResponse } from 'next/server';
import { BookingStatus, type PrismaClient } from '@prisma/client';
import { ApiError, toErrorResponse } from './api';
import { PUBLIC_LOOKUP_MESSAGES, findPublicBooking, toPublicBookingView } from './public-booking';
import { bookingPublicLookupSchema } from './validation';
import { buildPasajePdf } from './pasaje-pdf';

/**
 * Descarga del pasaje en PDF (US-14A, Paso 2).
 *
 * Mismo factor de autorizacion que la consulta (codigo + apellido de un
 * pasajero de la reserva), con un paso extra: las reservas canceladas no
 * generan pasaje (409). El PDF se arma a partir de la vista publica ya
 * proyectada, por lo que no puede filtrar DNI completo ni contactos.
 */

export const PASAJE_CANCELLED_MESSAGE =
  'El pasaje no está disponible para reservas canceladas';

function isMissing(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function pdfFilename(bookingCode: string): string {
  // El codigo siempre tiene la forma AG-XXXXXX (validada por el schema).
  return `pasaje-${bookingCode}.pdf`;
}

/**
 * Handler del endpoint publico (`POST /api/v1/reservas/consulta/pasaje`).
 * Se separa del Route Handler para poder inyectar la conexion en las pruebas.
 */
export async function executePasajeDownload(
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

    if (booking.status === BookingStatus.CANCELLED) {
      throw ApiError.conflict(PASAJE_CANCELLED_MESSAGE);
    }

    const pdf = buildPasajePdf(toPublicBookingView(booking));

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
