import { z } from 'zod';

const name = (label: string) => z.string().trim().min(1, `Ingresá el ${label}.`).max(80, 'Usá hasta 80 caracteres.')
  .refine(value => !value || /^\p{L}[\p{L}\p{M}]*(?: +\p{L}[\p{L}\p{M}]*)*$/u.test(value), 'Ingresá sólo letras y espacios.')
  .transform(value => value.normalize('NFC'));
const passenger = z.object({
  firstName: name('nombre'), lastName: name('apellido'),
  documentNumber: z.string().trim().min(1, 'Ingresá el DNI.').regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos.'),
  seatId: z.string().min(1).max(64).optional(),
});
export const counterQuoteSchema = z.object({
  flightId: z.string().min(1).max(64), fareId: z.string().min(1).max(64),
  passengersCount: z.number().int().min(1).max(9), seatMode: z.enum(['AUTO', 'MANUAL']),
});
export const counterSaleSchema = z.object({
  requestId: z.string().uuid(), flightId: z.string().min(1).max(64), fareId: z.string().min(1).max(64),
  quotedTotal: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  seatMode: z.enum(['AUTO', 'MANUAL']), passengers: z.array(passenger).min(1).max(9),
  contactEmail: z.string().trim().min(1, 'Ingresá el email.').email('Ingresá un email válido.').max(160, 'Usá hasta 160 caracteres.').transform(v => v.toLowerCase()),
  contactPhone: z.string().min(1, 'Ingresá el teléfono.').regex(/^\d{8,15}$/, 'El teléfono debe tener entre 8 y 15 dígitos.'),
  paymentMethod: z.enum(['CASH', 'DEBIT_CARD', 'CREDIT_CARD']),
}).superRefine((v, ctx) => {
  const ids = v.passengers.map(p => p.seatId).filter(Boolean);
  v.passengers.forEach((p, i) => {
    if (v.seatMode === 'MANUAL' && !p.seatId)
      ctx.addIssue({ code: 'custom', path: ['passengers', i, 'seatId'], message: 'Seleccioná un asiento para este pasajero.' });
    if (p.seatId && ids.filter(id => id === p.seatId).length > 1)
      ctx.addIssue({ code: 'custom', path: ['passengers', i, 'seatId'], message: 'Este asiento ya está elegido para otro pasajero.' });
    if (p.documentNumber && v.passengers.filter(other => other.documentNumber === p.documentNumber).length > 1)
      ctx.addIssue({ code: 'custom', path: ['passengers', i, 'documentNumber'], message: 'Este DNI se repite en otro pasajero.' });
  });
  if (v.seatMode === 'AUTO' && ids.length)
    ctx.addIssue({ code: 'custom', path: ['passengers'], message: 'La asignación automática no admite asientos elegidos' });
});

export type CounterFieldErrors = Record<string, string>;
/** Keep the first actionable message for each field, including passenger index. */
export function counterFieldErrors(issues: { path: (string | number)[]; message: string }[]): CounterFieldErrors {
  const errors: CounterFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    if (/^(contactEmail|contactPhone|passengers\.\d+\.(firstName|lastName|documentNumber|seatId))$/.test(key) && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
