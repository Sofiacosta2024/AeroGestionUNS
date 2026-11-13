import { z } from 'zod';

export const cancellationReasonSchema = z.enum(['Clima', 'Mantenimiento', 'Operativo']);

const flightSchema = z.object({
  flightCode: z.string(),
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime(),
});

const noticeSchema = z.object({
  version: z.literal(1),
  recipient: z.string().email(),
  greetingName: z.string(),
  displayCode: z.string().regex(/^[A-Z0-9-]{1,12}$/i),
  bookingUrl: z.string().url().refine((url) => /^https?:\/\//i.test(url)),
});

export const cancellationSnapshotSchema = noticeSchema.extend({
  reason: cancellationReasonSchema,
  cancelled: flightSchema,
}).and(z.discriminatedUnion('status', [
  z.object({ status: z.literal('REASIGNACION_PROPUESTA'), proposed: flightSchema }),
  z.object({ status: z.literal('SIN_ALTERNATIVA'), proposed: z.null() }),
]));

export type CancellationSnapshot = z.infer<typeof cancellationSnapshotSchema>;

export const bookingCancellationSnapshotSchema = noticeSchema.extend({
  refundPending: z.boolean(),
});

export type BookingCancellationSnapshot = z.infer<typeof bookingCancellationSnapshotSchema>;
