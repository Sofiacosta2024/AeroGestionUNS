import { z } from 'zod';
const airport = z.object({ code: z.string(), city: z.string() });
export const receiptSnapshotSchema = z.object({
  version: z.literal(1), recipient: z.string().email(), greetingName: z.string(),
  displayCode: z.string().regex(/^[A-Z0-9]{6}$/), purchasedAt: z.string().datetime(),
  documents: z.object({
    bookingCode: z.string(), currency: z.string(),
    passes: z.array(z.object({
      bookingCode: z.string(), passengerName: z.string(), documentType: z.string(), documentNumber: z.string(),
      seat: z.string(), cabinClass: z.string(), flightCode: z.string(), origin: airport, destination: airport,
      departureAt: z.string().datetime(), arrivalAt: z.string().datetime(),
    })).min(1),
    invoice: z.object({ buyerName: z.string(), buyerDocumentType: z.string(), buyerDocumentNumber: z.string(),
      voucherType: z.enum(['B', 'C']), reference: z.string(), currency: z.string(),
      lines: z.array(z.object({ label: z.string(), amount: z.number().finite() })), total: z.number().positive(),
    }),
  }),
});
export type ReceiptSnapshot = z.infer<typeof receiptSnapshotSchema>;
export type QueuedEmail = { status: 'queued'; dispatchId: string; message: string };
export const queuedEmail = (dispatchId: string): QueuedEmail => ({
  status: 'queued', dispatchId, message: 'Se ha encolado el envío automático de tu pasaje y factura PDF por email.',
});
