import { handler } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { executePasajeDownload } from '@/lib/pasaje';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/reservas/consulta/pasaje
 *
 * Descarga publica (sin sesion) del pasaje en PDF de una reserva por
 * codigo + apellido de un pasajero. Reutiliza el factor de autorizacion de
 * la consulta publica. Ver `src/lib/pasaje.ts`.
 */
export const POST = handler((req: Request) => executePasajeDownload(req, prisma));
