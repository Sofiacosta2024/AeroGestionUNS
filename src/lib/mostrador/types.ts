import type { z } from 'zod';
import type { counterQuoteSchema, counterSaleSchema } from './validation';
import type { QueuedEmail } from '../email/types';
export type CounterSaleInput = z.infer<typeof counterSaleSchema>;
export type CounterQuoteInput = z.infer<typeof counterQuoteSchema>;
export type CounterQuote = { totalAmount: string; baseAmount: string; seatSelectionAmount: string; currency: string };
export type CounterSaleResult = { bookingCode: string; displayCode: string; totalAmount: string; currency: string; paymentId: string; email: QueuedEmail; reused: boolean };
