import { z } from 'zod';

/** Un tramo tal como lo ve el pasajero en el aviso. Instantes en ISO; se muestran en ART. */
const legSchema = z.object({
  flightCode: z.string(),
  origin: z.object({ code: z.string(), city: z.string() }),
  destination: z.object({ code: z.string(), city: z.string() }),
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime(),
  aircraft: z.string(),
});

/**
 * Aviso de reprogramacion de itinerario (US-06A). Se congela al encolar, como el snapshot del
 * comprobante (US-13): un reintento manda siempre el mismo correo. `before` es el tramo anterior
 * (en la US-12B, el vuelo cancelado) y `after` el nuevo.
 */
export const itinerarySnapshotSchema = z.object({
  version: z.literal(1),
  recipient: z.string().email(),
  greetingName: z.string(),
  displayCode: z.string().regex(/^[A-Z0-9]{6}$/),
  bookingUrl: z.string().url(),
  before: legSchema,
  after: legSchema,
});

export type ItineraryLeg = z.infer<typeof legSchema>;
export type ItinerarySnapshot = z.infer<typeof itinerarySnapshotSchema>;
