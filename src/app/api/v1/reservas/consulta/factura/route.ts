import { handler } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { executeFacturaDownload } from '@/lib/factura';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reservas/consulta/factura
 *
 * Descarga publica (sin sesion) de la factura (comprobante de pago) en PDF
 * de una reserva por codigo + apellido de un pasajero. Solo genera el
 * documento cuando existe un pago aprobado real. Ver `src/lib/factura.ts`.
 */
export const POST = handler((req: Request) => executeFacturaDownload(req, prisma));
