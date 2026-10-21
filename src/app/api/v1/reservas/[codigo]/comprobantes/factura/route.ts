import { handler } from '@/lib/api';
import { loadComprobanteContext, pdfResponse } from '@/lib/comprobantes';
import { buildInvoicePdf } from '@/lib/pdf/documents';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ codigo: string }> };

/**
 * GET /api/v1/reservas/:codigo/comprobantes/factura
 *
 * Descarga binaria directa de la factura simulada en PDF (comprobante B, una
 * pagina). Exige la misma autorizacion que la pantalla de confirmacion y un
 * pago aprobado.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { codigo } = await ctx.params;
  const { booking, documents } = await loadComprobanteContext(codigo);

  return pdfResponse(
    buildInvoicePdf(documents),
    `factura-${booking.bookingCode}.pdf`,
  );
});
