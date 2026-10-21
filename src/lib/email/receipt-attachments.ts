import { createHash } from 'node:crypto';
import { buildInvoicePdf, buildPassPdf } from '../pdf/documents';
import type { ReceiptSnapshot } from './types';
/** Metadatos deterministas: un reintento debe enviar exactamente el mismo payload al proveedor. */
export function buildReceiptAttachments(snapshot: ReceiptSnapshot) {
  return ([['Pasaje', buildPassPdf], ['Factura', buildInvoicePdf]] as const).map(([kind, build]) => {
    const pdf = build(snapshot.documents);
    pdf.setCreationDate(new Date(snapshot.purchasedAt));
    pdf.setFileId(createHash('sha256').update(`${kind}:${JSON.stringify(snapshot)}`).digest('hex').slice(0, 32).toUpperCase());
    return { filename: `${kind}_${snapshot.displayCode}.pdf`,
      content: Buffer.from(pdf.output('arraybuffer')).toString('base64'), contentType: 'application/pdf' as const };
  });
}
