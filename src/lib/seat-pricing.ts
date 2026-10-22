import { commercialCabin } from './cabin';

/** Sólo Economy tiene adicional; Premium, Primera y asignación automática lo incluyen. */
export function seatSelectionUnitFee(
  fare: { cabinClass: string; code?: string; name?: string; seatSelectionFee?: number | string | { toString(): string } } | null | undefined,
  mode: 'AUTO' | 'MANUAL' = 'MANUAL',
): number {
  if (mode === 'AUTO' || !fare || commercialCabin(fare) !== 'ECONOMY') return 0;
  const fee = Number(fare?.seatSelectionFee ?? 0);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}
